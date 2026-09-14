import { readFile } from 'node:fs/promises';
import type { VisualSemanticAnalysisRequest, VisualSemanticProviderResult } from '../contracts/provider-runtime.types.js';
import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import { normalizeVisualSemanticProviderResult } from '../normalization/normalize-semantic-result.js';
import { parseVisualSemanticAnalysisRequest } from '../schema/visual-semantic-request.schema.js';
import { parseProviderRawPayload } from '../schema/visual-semantic-response.schema.js';
import type { VisualSemanticProvider } from '../provider/visual-semantic-provider.js';
import { bytesToDataUrl } from './data-url.js';
import { mapModelOutputToProviderResult } from './map-model-output.js';
import { isModelOutputEnumValidationError } from './model-output-enum-validation-error.js';
import { TEXT_EVIDENCE_ONLY_MAX_FRAMES, type MultimodalInvokeInput, type MultimodalModelClient } from './multimodal.types.js';
import {
  emptyPipelineMeta,
  jsonShape,
  sanitizeModelOutputSnapshot,
  type AdapterPipelineMeta,
} from './pipeline-snapshot.js';
import { parseJsonObjectWithOptionalFormatRepair } from './response-extract.js';
import type { RouterOneMultimodalClient } from './router-one-multimodal.client.js';
import { buildInterleavedUserContent } from './serialize-multi-frame.js';
import {
  buildTextDeveloperUserPrompt,
  buildTextEvidenceUserPrompt,
  buildUiStructureUserPrompt,
  UI_STRUCTURE_SYSTEM_PROMPT,
} from './ui-structure-prompt.js';
import { validateVisualSemanticModelOutput } from './validate-model-output.js';

export const REAL_VISION_CAPABILITIES = {
  imageAnalysis: true,
  multiFrameAnalysis: true,
  structuredOutput: true,
  ocr: false,
  regionGrounding: true,
  temporalReasoning: false,
} as const;

export type RealAdapterParseMeta = {
  rawSchemaPass: boolean;
  repairUsed: boolean;
  latencyMs: number;
  httpStatus: number;
  usage: VisualSemanticProviderResult['usage'];
  costStatus: 'PRICED' | 'UNPRICED';
};

export type RealAdapterPayloadMeta = {
  numberOfImages: number;
  perImageBytes: number[];
  totalImageBytes: number;
  estimatedBase64Bytes: number;
};

export class RealVisualSemanticProviderAdapter implements VisualSemanticProvider {
  readonly providerId = 'router-one-vision';
  readonly providerFamily = 'OPENAI_COMPATIBLE' as const;
  readonly capabilities = { ...REAL_VISION_CAPABILITIES };
  readonly regionGroundingTransport = true;
  readonly regionGroundingQuality = 'UNVALIDATED' as const;
  lastParseMeta: RealAdapterParseMeta | null = null;
  lastPipelineMeta: AdapterPipelineMeta = emptyPipelineMeta();
  lastPayloadMeta: RealAdapterPayloadMeta | null = null;

  constructor(
    readonly multimodalClient: MultimodalModelClient,
    private readonly model: string,
  ) {}

  async analyzeImage(input: unknown): Promise<VisualSemanticProviderResult> {
    const request = parseVisualSemanticAnalysisRequest(input);
    this.assertNoContext(request);
    if (request.mediaKind !== 'IMAGE' || request.analysisMode !== 'IMAGE_SINGLE' || request.frames.length !== 1) {
      throw new VisualSemanticProviderError('INPUT_INVALID', 'image-single');
    }
    if (request.taskModules.length !== 1 || request.taskModules[0] !== 'UI_STRUCTURE') {
      throw new VisualSemanticProviderError('UNSUPPORTED_CAPABILITY', 'taskModules');
    }
    return this.runFrames(request, 2500, 'UI');
  }

  async analyzeVideoFrames(input: unknown): Promise<VisualSemanticProviderResult> {
    const request = parseVisualSemanticAnalysisRequest(input);
    this.assertNoContext(request);
    if (request.mediaKind !== 'VIDEO' || request.analysisMode !== 'VIDEO_FRAME_SET') {
      throw new VisualSemanticProviderError('INPUT_INVALID', 'video-frame-set');
    }
    if (request.frames.length < 1 || request.frames.length > 6) {
      throw new VisualSemanticProviderError('INPUT_INVALID', 'frame-count');
    }
    const uiOnly = request.taskModules.length === 1 && request.taskModules[0] === 'UI_STRUCTURE';
    const textDev =
      request.taskModules.length === 2 &&
      request.taskModules.includes('TEXT_EVIDENCE') &&
      request.taskModules.includes('DEVELOPER_ARTIFACT');
    const textOnly = request.taskModules.length === 1 && request.taskModules[0] === 'TEXT_EVIDENCE';
    if (!uiOnly && !textDev && !textOnly) {
      throw new VisualSemanticProviderError('UNSUPPORTED_CAPABILITY', 'taskModules');
    }
    if (textOnly && request.frames.length > TEXT_EVIDENCE_ONLY_MAX_FRAMES) {
      throw new VisualSemanticProviderError('INPUT_INVALID', 'text-evidence-frame-limit');
    }
    const maxTokens = request.frames.length <= 3 ? 4500 : 10000;
    const promptKind = uiOnly ? 'UI' : textOnly ? 'TEXT_ONLY' : 'TEXT_DEV';
    return this.runFrames(request, maxTokens, promptKind);
  }

  private async runFrames(
    request: VisualSemanticAnalysisRequest,
    maxTokens: number,
    promptKind: 'UI' | 'TEXT_DEV' | 'TEXT_ONLY',
  ): Promise<VisualSemanticProviderResult> {
    const loaded = [];
    for (const frame of request.frames) {
      if (frame.mediaRef.kind !== 'LOCAL_REF' && frame.mediaRef.kind !== 'FIXTURE_REF') {
        throw new VisualSemanticProviderError('INPUT_INVALID', 'mediaRef');
      }
      const bytes = await readFile(frame.mediaRef.reference);
      loaded.push({ frameId: frame.frameId, bytes, dataUrl: bytesToDataUrl(bytes, 'image/jpeg').dataUrl });
    }
    const perImageBytes = loaded.map((item) => item.bytes.byteLength);
    const totalImageBytes = perImageBytes.reduce((sum, value) => sum + value, 0);
    this.lastPayloadMeta = {
      numberOfImages: loaded.length,
      perImageBytes,
      totalImageBytes,
      estimatedBase64Bytes: Math.ceil(totalImageBytes * (4 / 3)),
    };
    const allowedFrameIds = loaded.map((item) => item.frameId);
    const prompt =
      promptKind === 'TEXT_DEV'
        ? buildTextDeveloperUserPrompt(allowedFrameIds)
        : promptKind === 'TEXT_ONLY'
          ? buildTextEvidenceUserPrompt(allowedFrameIds)
          : buildUiStructureUserPrompt(allowedFrameIds);
    const userContent = buildInterleavedUserContent(prompt, loaded);
    const invokeInput: MultimodalInvokeInput = {
      model: this.model,
      requestId: request.requestId,
      responseFormat: 'json_object',
      maxTokens,
      images: [],
      messages: [
        { role: 'system', content: UI_STRUCTURE_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    };
    const pipeline = emptyPipelineMeta();
    this.lastPipelineMeta = pipeline;
    const invoked = await this.multimodalClient.invoke(invokeInput, { timeoutMs: request.timeoutMs ?? 90_000 });
    return this.completePipeline(invoked, request, allowedFrameIds, pipeline);
  }

  private completePipeline(
    invoked: Awaited<ReturnType<MultimodalModelClient['invoke']>>,
    request: VisualSemanticAnalysisRequest,
    allowedFrameIds: string[],
    pipeline: AdapterPipelineMeta,
  ): VisualSemanticProviderResult {
    pipeline.httpStatus = invoked.httpStatus;
    pipeline.latencyMs = invoked.latencyMs;
    pipeline.usage = invoked.usage;
    pipeline.assistantContentExists = invoked.rawText.trim().length > 0;
    pipeline.assistantContentLength = invoked.rawText.length;
    const clientDiagnostics =
      'diagnostics' in this.multimodalClient
        ? (this.multimodalClient as RouterOneMultimodalClient).diagnostics
        : undefined;
    pipeline.assistantContentType = clientDiagnostics?.lastAssistantContentType ?? 'string';

    let parsedJson: unknown;
    let rawSchemaPass = false;
    let repairUsed = false;
    try {
      JSON.parse(invoked.rawText.trim());
      pipeline.jsonParseNative = 'PASS';
    } catch {
      pipeline.jsonParseNative = 'FAIL';
    }
    try {
      const repaired = parseJsonObjectWithOptionalFormatRepair(invoked.rawText);
      parsedJson = repaired.value;
      rawSchemaPass = repaired.rawSchemaPass;
      repairUsed = repaired.repairUsed;
      pipeline.jsonSyntax = 'PASS';
      pipeline.repairUsed = repairUsed;
      pipeline.rawSchemaPass = rawSchemaPass;
      Object.assign(pipeline, jsonShape(parsedJson));
      pipeline.sanitizedModelOutput = sanitizeModelOutputSnapshot(parsedJson);
    } catch {
      pipeline.jsonSyntax = 'FAIL';
      this.recordParseMeta(invoked, false, false, undefined);
      throw new VisualSemanticProviderError('INVALID_PROVIDER_RESPONSE', 'json');
    }

    let modelOutput;
    try {
      modelOutput = validateVisualSemanticModelOutput(parsedJson, { allowedFrameIds });
      pipeline.modelFacingSchema = 'PASS';
    } catch (error) {
      pipeline.modelFacingSchema = 'FAIL';
      pipeline.modelSchemaErrorPaths = [
        error instanceof VisualSemanticProviderError ? error.debugLabel ?? error.code : 'model-output',
      ];
      if (isModelOutputEnumValidationError(error)) {
        pipeline.modelSchemaFailure = error.toSnapshot();
      }
      this.recordParseMeta(invoked, rawSchemaPass, repairUsed, undefined);
      throw error;
    }

    let mapped;
    try {
      mapped = mapModelOutputToProviderResult(modelOutput, {
        requestId: request.requestId,
        providerId: this.providerId,
        allowedFrameIds,
        taskModules: request.taskModules,
      });
      pipeline.adapterMapping = 'PASS';
    } catch (error) {
      pipeline.adapterMapping = 'FAIL';
      this.recordParseMeta(invoked, rawSchemaPass, repairUsed, undefined);
      throw error;
    }

    let parsed;
    try {
      parsed = parseProviderRawPayload(mapped);
      pipeline.internalB2Schema = 'PASS';
    } catch (error) {
      pipeline.internalB2Schema = 'FAIL';
      pipeline.internalSchemaErrorPaths = [
        error instanceof VisualSemanticProviderError ? error.debugLabel ?? error.code : 'internal-schema',
      ];
      this.recordParseMeta(invoked, rawSchemaPass, repairUsed, undefined);
      throw error;
    }

    parsed.usage = {
      latencyMs: invoked.latencyMs,
      inputUnits: invoked.usage.inputTextUnits ?? undefined,
      outputUnits: invoked.usage.outputUnits ?? undefined,
      cost: invoked.usage.cost ?? undefined,
    };

    try {
      const normalized = normalizeVisualSemanticProviderResult(parsed);
      pipeline.normalization = 'PASS';
      pipeline.observationCountNormalized = normalized.observations.length;
      pipeline.semanticRegionsCount = normalized.semanticRegions.length;
      pipeline.stableIds = normalized.observations.map((item) => item.observationId);
      this.recordParseMeta(invoked, rawSchemaPass, repairUsed, normalized.usage);
      return normalized;
    } catch (error) {
      pipeline.normalization = 'FAIL';
      this.recordParseMeta(invoked, rawSchemaPass, repairUsed, parsed.usage);
      throw error;
    }
  }

  private recordParseMeta(
    invoked: { latencyMs: number; httpStatus: number; usage: { costStatus: 'PRICED' | 'UNPRICED' } },
    rawSchemaPass: boolean,
    repairUsed: boolean,
    usage: VisualSemanticProviderResult['usage'],
  ): void {
    this.lastParseMeta = {
      rawSchemaPass,
      repairUsed,
      latencyMs: invoked.latencyMs,
      httpStatus: invoked.httpStatus,
      usage,
      costStatus: invoked.usage.costStatus,
    };
  }

  private assertNoContext(request: VisualSemanticAnalysisRequest): void {
    if (request.projectContext !== undefined) {
      throw new VisualSemanticProviderError('INPUT_INVALID', 'projectContext');
    }
    if (request.platformContext !== undefined) {
      throw new VisualSemanticProviderError('INPUT_INVALID', 'platformContext');
    }
  }
}
