import type { VisualSemanticProviderCapabilities, VisualSemanticProviderResult } from '../contracts/provider-runtime.types.js';
import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import { normalizeVisualSemanticProviderResult } from '../normalization/normalize-semantic-result.js';
import { parseVisualSemanticAnalysisRequest } from '../schema/visual-semantic-request.schema.js';
import { parseProviderRawPayload } from '../schema/visual-semantic-response.schema.js';
import { DEFAULT_MOCK_CAPABILITIES, type VisualSemanticProvider } from './visual-semantic-provider.js';

export type MockProviderMode = 'SUCCESS' | 'PARTIAL' | 'FAIL' | 'TIMEOUT' | 'INVALID_SCHEMA';

export class MockVisualSemanticProvider implements VisualSemanticProvider {
  readonly providerId = 'mock-visual-semantic';
  readonly providerFamily = 'MOCK' as const;
  readonly capabilities: VisualSemanticProviderCapabilities;

  constructor(
    private readonly options: {
      mode: MockProviderMode;
      fixture?: unknown;
      capabilities?: Partial<VisualSemanticProviderCapabilities>;
    },
  ) {
    this.capabilities = { ...DEFAULT_MOCK_CAPABILITIES, ...options.capabilities };
  }

  analyzeImage(input: unknown): Promise<VisualSemanticProviderResult> {
    return this.execute(input, 'IMAGE');
  }

  analyzeVideoFrames(input: unknown): Promise<VisualSemanticProviderResult> {
    return this.execute(input, 'VIDEO');
  }

  private async execute(input: unknown, expectedKind: 'IMAGE' | 'VIDEO'): Promise<VisualSemanticProviderResult> {
    const request = parseVisualSemanticAnalysisRequest(input);
    if (request.mediaKind !== expectedKind) {
      throw new VisualSemanticProviderError('INPUT_INVALID', 'mediaKind');
    }
    if (expectedKind === 'IMAGE' && (request.analysisMode !== 'IMAGE_SINGLE' || request.frames.length !== 1)) {
      throw new VisualSemanticProviderError('INPUT_INVALID', 'image-frames');
    }
    if (expectedKind === 'VIDEO' && (request.analysisMode !== 'VIDEO_FRAME_SET' || request.frames.length < 1)) {
      throw new VisualSemanticProviderError('INPUT_INVALID', 'video-frames');
    }
    if (expectedKind === 'IMAGE' && !this.capabilities.imageAnalysis) {
      throw new VisualSemanticProviderError('UNSUPPORTED_CAPABILITY', 'imageAnalysis');
    }
    if (request.frames.length > 1 && !this.capabilities.multiFrameAnalysis) {
      throw new VisualSemanticProviderError('UNSUPPORTED_CAPABILITY', 'multiFrameAnalysis');
    }
    if (this.options.mode === 'TIMEOUT') {
      throw new VisualSemanticProviderError('PROVIDER_TIMEOUT');
    }
    if (this.options.mode === 'FAIL') {
      throw new VisualSemanticProviderError('PROVIDER_UNAVAILABLE');
    }

    const raw =
      this.options.mode === 'INVALID_SCHEMA'
        ? { ...((this.options.fixture as object) ?? {}), observations: [{ confidence: 1.5 }] }
        : this.options.fixture;
    if (raw === undefined) {
      throw new VisualSemanticProviderError('INVALID_PROVIDER_RESPONSE');
    }

    const parsed = parseProviderRawPayload(raw, request.durationMs);
    parsed.requestId = request.requestId;
    parsed.providerId = this.providerId;
    parsed.providerFamily = this.providerFamily;

    const moduleResults = [...(parsed.moduleResults ?? [])];
    const warnings = [...parsed.warnings];
    if (request.taskModules.includes('TEXT_EVIDENCE') && !this.capabilities.ocr) {
      moduleResults.push({ module: 'TEXT_EVIDENCE', status: 'FAILED', warnings: ['MODULE_ANALYSIS_PARTIAL'] });
      if (!warnings.includes('MODULE_ANALYSIS_PARTIAL')) {
        warnings.push('MODULE_ANALYSIS_PARTIAL');
      }
      parsed.status = parsed.status === 'FAILED' ? 'FAILED' : 'PARTIAL';
      parsed.textEvidence = [];
    }
    if (this.options.mode === 'PARTIAL') {
      parsed.status = 'PARTIAL';
      if (!warnings.includes('MODULE_ANALYSIS_PARTIAL')) {
        warnings.push('MODULE_ANALYSIS_PARTIAL');
      }
    }
    parsed.moduleResults = moduleResults;
    parsed.warnings = warnings;
    return normalizeVisualSemanticProviderResult(parsed);
  }
}
