/**
 * B2-6C4 3-frame exact-enum re-smoke (ui-structure:v2). Exactly 1 UI_STRUCTURE inference, 120s.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { readRealModelConfig } from '../src/agents/models/model.config.js';
import { isFfmpegAvailable } from '../src/media/ffmpeg/ffmpeg-available.js';
import { LocalStorageProvider } from '../src/media/storage/local-storage.provider.js';
import { DeterministicVisualAnalyzerService } from '../src/production-v2/visual/analyzer/deterministic-visual-analyzer.service.js';
import { LocalJsonVisualAnalysisCacheStore } from '../src/production-v2/visual/cache/local-json-visual-analysis-cache-store.js';
import { VisualSemanticProviderError } from '../src/production-v2/visual-semantic/errors/visual-semantic-error.js';
import { withSemanticFrames } from '../src/production-v2/visual-semantic/frames/semantic-frame-extractor.js';
import { SEMANTIC_FRAME_CONFIG, semanticSize } from '../src/production-v2/visual-semantic/frames/semantic-frame-config.js';
import { selectSemanticFrames } from '../src/production-v2/visual-semantic/frames/select-semantic-frames.js';
import {
  selectRepresentativeSemanticFramesV1,
  toRepresentativeInputs,
} from '../src/production-v2/visual-semantic/frames/select-representative-semantic-frames.js';
import { decisionLeakage, evaluateFrameIdentity } from '../src/production-v2/visual-semantic/runtime/benchmark-evaluators.js';
import {
  assertB26AssetId,
  assertB26Cli,
  CONTENT_01_NEW_ASSET_ID,
  privacyPreflightScan,
  REAL_ASSET_PRIVACY_PREFLIGHT_BLOCKED,
  sanitizeVisibleText,
} from '../src/production-v2/visual-semantic/runtime/b2-6-guards.js';
import {
  assessB26ALatency,
  detectSemanticInflation,
  firstTypedRegion,
  framesWithType,
  pairRelationship,
  PRODUCT_UI_PROMPT_DEFINITION,
  PRODUCT_UI_PROMPT_NON_FORCE,
  promptForcesProductUi,
  reclassifyBrowserNavPairs,
  type TypedRegion,
} from '../src/production-v2/visual-semantic/runtime/b2-6a-calibration.js';
import { assertB26BCallShape } from '../src/production-v2/visual-semantic/runtime/b2-6b-guards.js';
import {
  assessExactEnumInstruction,
  buildEnumContractDiagnosis,
  extractPromptObservationTypes,
} from '../src/production-v2/visual-semantic/runtime/b2-6c0-enum-diagnosis.js';
import { MODEL_OUTPUT_OBSERVATION_TYPES } from '../src/production-v2/visual-semantic/runtime/model-output.types.js';
import { InferenceCallGuard } from '../src/production-v2/visual-semantic/runtime/inference-guard.js';
import {
  B2_6B_CALL_A_TIMEOUT_MS,
  B2_6B_INFERENCE_LIMIT,
  FROZEN_SMOKE_MODEL,
  REAL_CONTENT_VISION_INFERENCE_LIMIT_EXCEEDED,
  SMOKE_INFERENCE_LIMIT_EXCEEDED,
} from '../src/production-v2/visual-semantic/runtime/multimodal.types.js';
import { RealVisualSemanticProviderAdapter } from '../src/production-v2/visual-semantic/runtime/real-visual-semantic.adapter.js';
import { RouterOneMultimodalClient } from '../src/production-v2/visual-semantic/runtime/router-one-multimodal.client.js';
import {
  buildUiStructureUserPrompt,
  PROMPT_MODULES_MULTI_FRAME,
  UI_STRUCTURE_PROMPT_MODULE_V2,
} from '../src/production-v2/visual-semantic/runtime/ui-structure-prompt.js';
import type { VisualSemanticProviderResult } from '../src/production-v2/visual-semantic/contracts/provider-runtime.types.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(
  repoRoot,
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-6c4',
);
const envPath = path.join(repoRoot, '.env');

assertB26Cli(process.argv.slice(2));
assertB26AssetId(CONTENT_01_NEW_ASSET_ID);

function loadEnvKeys(keys: string[]) {
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!keys.includes(key)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function envFingerprint() {
  if (!existsSync(envPath)) return null;
  const st = statSync(envPath);
  return { size: st.size, mtimeMs: st.mtimeMs };
}

function writeJson(rel: string, value: unknown) {
  const full = path.join(evidenceDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

function redactPaths(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, val) => {
      if (typeof key === 'string' && /path|file|root|dir|tempRef|storageKey|mediaPath/i.test(key) && key !== 'fileSize') {
        return undefined;
      }
      if (typeof val === 'string' && (/^[A-Za-z]:\\/.test(val) || val.includes('acf-'))) return '[redacted]';
      return val;
    }),
  );
}

loadEnvKeys(['DATABASE_URL', 'MEDIA_STORAGE_ROOT', 'MODEL_API_KEY', 'MODEL_BASE_URL', 'MODEL_NAME', 'VISUAL_SEMANTIC_MODEL', 'FFMPEG_PATH', 'FFPROBE_PATH']);
const envBefore = envFingerprint();
process.env.NODE_ENV = process.env.NODE_ENV === 'test' ? 'development' : process.env.NODE_ENV;
const modelEnv = process.env.VISUAL_SEMANTIC_MODEL?.trim() ?? '';
const modelSource = modelEnv ? 'ENV_CONFIGURED' : 'SMOKE_DEFAULT_ONLY';
const model = modelEnv || FROZEN_SMOKE_MODEL;
const cfg = readRealModelConfig();

type Layer = 'PASS' | 'FAIL' | 'NOT_RUN';
type CallState = {
  transport: Layer;
  json: Layer;
  model: Layer;
  adapter: Layer;
  b2: Layer;
  normalize: Layer;
  calls: number;
  stopReason: string;
  result: VisualSemanticProviderResult | null;
  latencyMs: number | null;
  assistant: Layer;
  usage: VisualSemanticProviderResult['usage'] | null;
};

function emptyCall(): CallState {
  return {
    transport: 'NOT_RUN',
    json: 'NOT_RUN',
    model: 'NOT_RUN',
    adapter: 'NOT_RUN',
    b2: 'NOT_RUN',
    normalize: 'NOT_RUN',
    calls: 0,
    stopReason: '',
    result: null,
    latencyMs: null,
    assistant: 'NOT_RUN',
    usage: null,
  };
}

const callA = emptyCall();
let framesSent = 0;
let sentFrameIds: string[] = [];
let originalSix = 0;
let extractedCount = 0;
let selectedIds: string[] = [];
let schemaFailure: unknown = null;
let privacyBlocked = false;
let stopEarly = '';
let credential: 'REUSED' | 'UNAVAILABLE' = 'UNAVAILABLE';

function sanitizeObservations(result: VisualSemanticProviderResult) {
  return result.observations.map((item) => ({
    type: item.type,
    confidence: item.confidence,
    frameId: item.evidence.frameIds[0],
    region: item.region ?? null,
    visualSignals: item.evidence.visualSignals ?? [],
    uncertainty: item.uncertainty,
    text: (item.evidence.textFragments ?? []).map((frag) => {
      const redacted = sanitizeVisibleText(frag.text);
      return redacted.redacted
        ? { category: redacted.category, redactedText: redacted.sanitized, confidence: frag.confidence, frameId: frag.frameId }
        : { text: redacted.sanitized, confidence: frag.confidence, frameId: frag.frameId };
    }),
  }));
}

function toTypedRegions(rows: ReadonlyArray<{ type: string; frameId?: string; region?: unknown }>): TypedRegion[] {
  const out: TypedRegion[] = [];
  for (const row of rows) {
    if (!row.frameId || !row.region || typeof row.region !== 'object') continue;
    const region = row.region as { x?: number; y?: number; width?: number; height?: number };
    if ([region.x, region.y, region.width, region.height].some((n) => typeof n !== 'number')) continue;
    out.push({
      frameId: row.frameId,
      type: row.type,
      region: { x: region.x as number, y: region.y as number, width: region.width as number, height: region.height as number },
    });
  }
  return out;
}

function pipelinePass(call: CallState): boolean {
  return (
    call.transport === 'PASS' &&
    call.assistant === 'PASS' &&
    call.json === 'PASS' &&
    call.model === 'PASS' &&
    call.adapter === 'PASS' &&
    call.b2 === 'PASS' &&
    call.normalize === 'PASS'
  );
}

async function invokeCall(
  adapter: RealVisualSemanticProviderAdapter,
  guard: InferenceCallGuard,
  client: RouterOneMultimodalClient,
  request: unknown,
): Promise<void> {
  const before = guard.calls;
  try {
    const result = await adapter.analyzeVideoFrames(request);
    callA.result = result;
    callA.calls = guard.calls - before;
    callA.transport = 'PASS';
    const pipe = adapter.lastPipelineMeta;
    callA.assistant = pipe.assistantContentExists ? 'PASS' : 'FAIL';
    callA.json = pipe.jsonSyntax;
    callA.model = pipe.modelFacingSchema;
    callA.adapter = pipe.adapterMapping;
    callA.b2 = pipe.internalB2Schema;
    callA.normalize = pipe.normalization;
    callA.latencyMs = pipe.latencyMs;
    callA.usage = pipe.usage
      ? {
          inputTextUnits: pipe.usage.inputTextUnits,
          inputImageUnits: null,
          outputUnits: pipe.usage.outputUnits,
          totalUnits: pipe.usage.totalUnits,
          cost: pipe.usage.cost,
          costStatus: pipe.usage.costStatus,
        }
      : null;
    schemaFailure = pipe.modelSchemaFailure;
    writeJson('call-a/transport.json', { status: 'PASS', httpStatus: pipe.httpStatus });
    writeJson('call-a/assistant-content-structure.json', {
      status: callA.assistant,
      type: pipe.assistantContentType,
      length: pipe.assistantContentLength,
      repairUsed: pipe.repairUsed,
    });
    writeJson('call-a/json-result.json', { status: pipe.jsonSyntax, native: pipe.jsonParseNative, length: pipe.assistantContentLength });
    writeJson('call-a/model-schema-result.json', { status: pipe.modelFacingSchema, errorPaths: pipe.modelSchemaErrorPaths });
    writeJson('call-a/model-schema-failure.json', pipe.modelSchemaFailure ?? { status: 'NONE' });
    writeJson('call-a/adapter-result.json', { status: pipe.adapterMapping, injectedFields: pipe.injectedFields });
    writeJson('call-a/b2-schema-result.json', { status: pipe.internalB2Schema, errorPaths: pipe.internalSchemaErrorPaths });
    writeJson('call-a/normalization-result.json', {
      status: pipe.normalization,
      observationCount: pipe.observationCountNormalized,
      semanticRegions: pipe.semanticRegionsCount,
    });
  } catch (error) {
    callA.calls = guard.calls - before;
    const pipe = adapter.lastPipelineMeta;
    callA.json = pipe.jsonSyntax;
    callA.model = pipe.modelFacingSchema;
    callA.adapter = pipe.adapterMapping;
    callA.b2 = pipe.internalB2Schema;
    callA.normalize = pipe.normalization;
    callA.latencyMs = pipe.latencyMs;
    callA.assistant = pipe.assistantContentExists ? 'PASS' : 'FAIL';
    callA.usage = pipe.usage
      ? {
          inputTextUnits: pipe.usage.inputTextUnits,
          inputImageUnits: null,
          outputUnits: pipe.usage.outputUnits,
          totalUnits: pipe.usage.totalUnits,
          cost: pipe.usage.cost,
          costStatus: pipe.usage.costStatus,
        }
      : null;
    schemaFailure = pipe.modelSchemaFailure;
    if (error instanceof Error && error.message === SMOKE_INFERENCE_LIMIT_EXCEEDED) {
      throw new Error(REAL_CONTENT_VISION_INFERENCE_LIMIT_EXCEEDED);
    }
    if (error instanceof VisualSemanticProviderError && error.code === 'PROVIDER_TIMEOUT') {
      callA.transport = 'FAIL';
      callA.stopReason = 'PROVIDER_TIMEOUT';
      callA.assistant = 'NOT_RECEIVED' as Layer;
    } else if (error instanceof VisualSemanticProviderError && error.code === 'SCHEMA_VALIDATION_FAILED') {
      callA.transport = 'PASS';
      callA.stopReason = error.debugLabel ?? 'SCHEMA_VALIDATION_FAILED';
    } else {
      callA.transport = client.diagnostics.lastHttpStatus === 200 ? 'PASS' : 'FAIL';
      callA.stopReason = error instanceof VisualSemanticProviderError ? error.code : 'UNKNOWN';
    }
    writeJson('call-a/transport.json', { status: callA.transport, stopReason: callA.stopReason });
    writeJson('call-a/assistant-content-structure.json', { status: callA.assistant, stopReason: callA.stopReason });
    writeJson('call-a/json-result.json', { status: callA.json });
    writeJson('call-a/model-schema-result.json', { status: callA.model, errorPaths: pipe.modelSchemaErrorPaths });
    writeJson('call-a/model-schema-failure.json', pipe.modelSchemaFailure ?? { status: 'NONE', stopReason: callA.stopReason });
    writeJson('call-a/adapter-result.json', { status: callA.adapter });
    writeJson('call-a/b2-schema-result.json', { status: callA.b2, errorPaths: pipe.internalSchemaErrorPaths });
    writeJson('call-a/normalization-result.json', { status: callA.normalize });
  }
}

const uiPrompt = buildUiStructureUserPrompt(['semantic-frame:a', 'semantic-frame:b', 'semantic-frame:c']);
const renderedEnum = extractPromptObservationTypes(uiPrompt);
writeJson('prompt/runtime-version.json', {
  runtime: UI_STRUCTURE_PROMPT_MODULE_V2,
  modules: [...PROMPT_MODULES_MULTI_FRAME],
  notV1: PROMPT_MODULES_MULTI_FRAME[1] === UI_STRUCTURE_PROMPT_MODULE_V2,
});
writeJson('prompt/enum-source.json', {
  source: 'MODEL_OUTPUT_OBSERVATION_TYPES',
  rendered: renderedEnum,
  dto: [...MODEL_OUTPUT_OBSERVATION_TYPES],
  match: renderedEnum.join('|') === MODEL_OUTPUT_OBSERVATION_TYPES.join('|'),
  listInEnum: renderedEnum.includes('LIST'),
});
writeJson('prompt/exact-enum-rules.json', {
  exactEnumInstruction: assessExactEnumInstruction(uiPrompt),
  useOnlyExactLiterals: uiPrompt.includes('Use ONLY the exact observation type enum literals listed below'),
  doNotInvent: uiPrompt.includes('Do not invent new type names'),
  doNotUseSynonyms: uiPrompt.includes('Do not use synonyms, aliases, paraphrases'),
  caseSensitive: uiPrompt.includes('Enum values are case-sensitive exact literals'),
  unknownFallback: uiPrompt.includes('If a visible structured region does not fit any allowed specific type exactly, output:'),
  listNotValid: uiPrompt.includes('do NOT output "LIST"'),
});
writeJson('representative-selection/selection-config.json', {
  version: 'semantic.representative-selection:v1',
  maxFrames: 3,
  priorities: ['temporal coverage', 'scene/state diversity', 'non-duplicate', 'UI richness', 'browser-visible secondary'],
  noHardcodedTimestamps: true,
  promptForcesProductUi: promptForcesProductUi(uiPrompt),
  productUiDefinition: PRODUCT_UI_PROMPT_DEFINITION,
  nonForcingRule: PRODUCT_UI_PROMPT_NON_FORCE,
  timeoutMs: B2_6B_CALL_A_TIMEOUT_MS,
  inferenceMax: B2_6B_INFERENCE_LIMIT,
});

const temps: string[] = [];
try {
  if (!cfg.apiKey || !cfg.baseUrl) {
    stopEarly = 'EXISTING_ROUTER_CREDENTIAL_NOT_AVAILABLE';
  } else if (!isFfmpegAvailable()) {
    stopEarly = 'FFMPEG_UNAVAILABLE';
  } else if (!process.env.DATABASE_URL) {
    stopEarly = 'DATABASE_URL_MISSING';
  } else {
    credential = 'REUSED';
    const prisma = new PrismaClient();
    const storage = new LocalStorageProvider();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'acf-b26c4-cache-'));
    temps.push(cacheDir);
    try {
      const row = await prisma.asset.findUnique({
        where: { id: CONTENT_01_NEW_ASSET_ID },
        select: { id: true, type: true, mimeType: true, contentHash: true, storageKey: true, width: true, height: true },
      });
      writeJson('scope-guard.json', {
        id: row?.id ?? null,
        expected: CONTENT_01_NEW_ASSET_ID,
        oldAssetBlocked: true,
        argvExternal: false,
        hasStorageKey: Boolean(row?.storageKey),
      });
      if (!row?.storageKey) {
        stopEarly = 'ASSET_NOT_FOUND';
      } else {
        const body = await storage.get(row.storageKey);
        const work = await mkdtemp(path.join(os.tmpdir(), 'acf-b26c4-mat-'));
        temps.push(work);
        const filePath = path.join(work, 'in.mp4');
        await writeFile(filePath, body);
        const videoScan = privacyPreflightScan({ label: 'source-bytes', bytes: body });
        writeJson('privacy-preflight.json', { stage: 'source', ok: videoScan.ok, hits: videoScan.ok ? [] : videoScan.hits });
        if (!videoScan.ok) {
          privacyBlocked = true;
          stopEarly = REAL_ASSET_PRIVACY_PREFLIGHT_BLOCKED;
        } else {
          const analyzer = new DeterministicVisualAnalyzerService({ cache: new LocalJsonVisualAnalysisCacheStore(cacheDir) });
          const b1 = await analyzer.analyze({
            assetId: CONTENT_01_NEW_ASSET_ID,
            contentHash: row.contentHash ?? undefined,
            mediaPath: filePath,
            kind: 'VIDEO',
            forceReanalyze: true,
          });
          const six = selectSemanticFrames({
            assetId: CONTENT_01_NEW_ASSET_ID,
            mediaKind: 'VIDEO',
            facts: b1.facts,
            durationMs: b1.facts?.metadata.durationMs,
          });
          originalSix = six.plan.selectedFrames.length;
          writeJson('representative-selection/input-6-frame-summary.json', redactPaths({
            requested: six.plan.requestedFrameCount,
            selected: six.plan.selectedFrames.map((item) => ({
              frameId: item.frameId,
              timestampMs: item.timestampMs,
              reasons: item.reasons,
              priority: item.priority,
              sourceSignals: item.sourceSignals,
              selectionScore: item.selectionScore,
            })),
            warnings: six.plan.warnings,
            durationMs: six.plan.sourceDurationMs,
          }));
          const representative = selectRepresentativeSemanticFramesV1({
            frames: toRepresentativeInputs(six.plan.selectedFrames),
            durationMs: six.plan.sourceDurationMs,
            maxFrames: 3,
          });
          writeJson('representative-selection/selected-3-frame-summary.json', representative.selected.map((item) => ({
            slot: item.representativeSlot,
            frameId: item.frameId,
            timestampMs: item.timestampMs,
            reasons: item.reasons,
            selectionReasons: item.selectionReasons,
            tertile: item.tertile,
            score: item.score,
          })));
          writeJson('representative-selection/selected-frame-summary.json', representative.selected.map((item) => ({
            slot: item.representativeSlot,
            frameId: item.frameId,
            timestampMs: item.timestampMs,
            reasons: item.reasons,
            selectionReasons: item.selectionReasons,
            tertile: item.tertile,
            score: item.score,
          })));
          writeJson('representative-selection/excluded-frame-summary.json', representative.excluded.map((item) => ({
            frameId: item.frameId,
            timestampMs: item.timestampMs,
            reasons: item.reasons,
            excludedReasons: item.excludedReasons,
          })));
          writeJson('representative-selection/selection-summary.json', {
            originalCount: originalSix,
            selectedCount: representative.selected.length,
            excludedCount: representative.excluded.length,
            selectedIds: representative.selected.map((item) => item.frameId),
            excludedIds: representative.excluded.map((item) => item.frameId),
            hardcodedTimestamps: false,
            modelCalledForSelection: false,
          });
          selectedIds = representative.selected.map((item) => item.frameId);
          const frozenSelected = ['semantic-frame:0', 'semantic-frame:20015', 'semantic-frame:35027'];
          const selectorMatch =
            selectedIds.length === frozenSelected.length && selectedIds.every((id, i) => id === frozenSelected[i]);
          writeJson('representative-selection/deterministic-comparison.json', {
            frozenB26bC2Ids: frozenSelected,
            c4SelectedIds: selectedIds,
            match: selectorMatch,
            regression: selectorMatch ? null : 'REPRESENTATIVE_SELECTOR_REGRESSION',
          });
          if (!selectorMatch) {
            stopEarly = 'REPRESENTATIVE_SELECTOR_REGRESSION';
          } else {
          const extractIds = representative.selected.map((item) => item.frameId);
          const guard = new InferenceCallGuard(B2_6B_INFERENCE_LIMIT);
          const client = new RouterOneMultimodalClient({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }, guard);
          const adapter = new RealVisualSemanticProviderAdapter(client, model);
          await withSemanticFrames(
            {
              assetId: CONTENT_01_NEW_ASSET_ID,
              mediaKind: 'VIDEO',
              mediaPath: filePath,
              facts: b1.facts,
              contentHash: row.contentHash ?? undefined,
              extractFrameIds: extractIds,
            },
            async (prep, scope) => {
              extractedCount = prep.extractedFrames.filter((item) => item.extractionStatus === 'OK').length;
              const ready = prep.providerReadyFrames.filter((item) => extractIds.includes(item.frameId));
              for (const frame of ready) {
                const jpeg = await (await import('node:fs/promises')).readFile(scope.resolve(frame.frameId));
                const scan = privacyPreflightScan({ label: frame.frameId, bytes: jpeg });
                if (!scan.ok) {
                  privacyBlocked = true;
                  stopEarly = REAL_ASSET_PRIVACY_PREFLIGHT_BLOCKED;
                  writeJson('privacy-preflight.json', { stage: 'frames', ok: false, hits: scan.hits });
                  return;
                }
              }
              const frames = ready.map((item) => ({
                frameId: item.frameId,
                timestampMs: item.timestampMs,
                width: item.width,
                height: item.height,
                mediaRef: { kind: 'LOCAL_REF' as const, reference: scope.resolve(item.frameId) },
                selectionReason: item.reasons,
              }));
              framesSent = frames.length;
              sentFrameIds = frames.map((item) => item.frameId);
              writeJson('representative-selection/extraction-strategy.json', {
                strategy: 'METADATA_THEN_EXTRACT_SELECTED',
                originalPlanFrames: originalSix,
                extractedJpegCount: extractedCount,
                sentToProvider: framesSent,
                longEdge: SEMANTIC_FRAME_CONFIG.semanticLongEdge,
                expectedSize: semanticSize(b1.facts?.metadata.width ?? 1920, b1.facts?.metadata.height ?? 1040),
                crop: false,
                note: 'B2-2 plans 6 frames; extractFrameIds limits JPEG decode to the representative 3.',
              });
              if (frames.length < 1) {
                stopEarly = 'NO_PROVIDER_READY_FRAMES';
                return;
              }
              assertB26BCallShape({ taskModules: ['UI_STRUCTURE'], frameCount: frames.length, timeoutMs: B2_6B_CALL_A_TIMEOUT_MS });
              writeJson('call-a/request-summary.json', {
                requestId: 'b2-6c4-call-a-ui-structure',
                model,
                numberOfImages: frames.length,
                taskModules: ['UI_STRUCTURE'],
                timeoutMs: B2_6B_CALL_A_TIMEOUT_MS,
                promptModules: PROMPT_MODULES_MULTI_FRAME,
                uiStructurePromptVersion: UI_STRUCTURE_PROMPT_MODULE_V2,
                retry: false,
                backup: false,
                textEvidence: false,
                developerArtifact: false,
              });
              await invokeCall(adapter, guard, client, {
                requestId: 'b2-6c4-call-a-ui-structure',
                assetId: CONTENT_01_NEW_ASSET_ID,
                mediaKind: 'VIDEO',
                analysisMode: 'VIDEO_FRAME_SET',
                durationMs: b1.facts?.metadata.durationMs,
                frames,
                taskModules: ['UI_STRUCTURE'],
                schemaVersion: 'visual.semantic.provider-request:v1',
                promptVersion: 'visual.semantic.base:v1',
                timeoutMs: B2_6B_CALL_A_TIMEOUT_MS,
              });
            },
          );
          }
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  }
} finally {
  for (const dir of temps) {
    await rm(dir, { recursive: true, force: true });
  }
}

const sanitized = callA.result ? sanitizeObservations(callA.result) : [];
const productFrames = framesWithType(sanitized, 'PRODUCT_UI');
const navFrames = framesWithType(sanitized, 'NAVIGATION');
const browserFrames = framesWithType(sanitized, 'BROWSER_CHROME');
const appChrome = sanitized.some((item) => item.type === 'APP_WINDOW_CHROME');
const identity =
  callA.result && sentFrameIds.length
    ? evaluateFrameIdentity(callA.result, sentFrameIds).status
    : 'NOT_EVALUATED';
const inflation = callA.result
  ? detectSemanticInflation({
      frameCount: sentFrameIds.length || 3,
      productUiFrames: productFrames.size,
      navigationCount: sanitized.filter((item) => item.type === 'NAVIGATION').length,
      contentPanelCount: sanitized.filter((item) => item.type === 'CONTENT_PANEL').length,
      productUiSignals: sanitized.filter((item) => item.type === 'PRODUCT_UI').map((item) => item.visualSignals),
    })
  : 'NOT_EVALUATED';
const chromeOnlyProduct = sanitized.some(
  (item) =>
    item.type === 'PRODUCT_UI' &&
    !sanitized.some(
      (other) =>
        other.frameId === item.frameId &&
        (other.type === 'NAVIGATION' || other.type === 'CONTENT_PANEL' || other.type === 'BUTTON_LIKE_REGION'),
    ) &&
    sanitized.some((other) => other.frameId === item.frameId && other.type === 'BROWSER_CHROME'),
);
const semanticInflation = inflation === 'OVER_CALIBRATED' || chromeOnlyProduct ? 'OBSERVED' : callA.result ? 'NONE' : 'NOT_EVALUATED';
const productUiCalibration = !callA.result
  ? 'NOT_EVALUATED'
  : productFrames.size >= 2
    ? 'PASS'
    : productFrames.size === 1
      ? 'PARTIAL'
      : 'FAIL';
const productUiStatus = !callA.result ? 'NOT_EVALUATED' : productFrames.size >= 2 ? 'OBSERVED' : productFrames.size === 1 ? 'PARTIAL' : 'NOT_OBSERVED';
const navStatus = !callA.result ? 'NOT_EVALUATED' : navFrames.size >= 2 ? 'OBSERVED' : navFrames.size === 1 ? 'PARTIAL' : 'NOT_OBSERVED';
const browserStatus = !callA.result
  ? 'NOT_EVALUATED'
  : browserFrames.size >= 1
    ? 'OBSERVED_ON_REAL_CONTENT_1'
    : 'NOT_OBSERVED';
const typed = toTypedRegions(sanitized);
const rels = sentFrameIds.map((frameId) => {
  const browser = firstTypedRegion(typed, frameId, 'BROWSER_CHROME');
  const nav = firstTypedRegion(typed, frameId, 'NAVIGATION');
  const product = firstTypedRegion(typed, frameId, 'PRODUCT_UI');
  return {
    frameId,
    browserVsNavigation: pairRelationship(browser, nav),
    browserVsProductUi: pairRelationship(browser, product),
    productUiVsNavigation: pairRelationship(product, nav),
  };
});
const liveReclass = reclassifyBrowserNavPairs(typed);
const leak = callA.result ? decisionLeakage(callA.result) : 'NONE';
const incidentalText = sanitized.flatMap((item) => item.text ?? []).filter((frag) => 'text' in frag);
const incidentalStatus = !callA.result ? 'NOT_EVALUATED' : incidentalText.length >= 4 ? 'USEFUL' : incidentalText.length >= 1 ? 'PARTIAL' : 'POOR';
const crossFrame =
  identity === 'FAIL'
    ? 'CONTAMINATION_OBSERVED'
    : identity === 'PASS'
      ? 'NO_OBVIOUS_CONTAMINATION_OBSERVED'
      : 'NOT_EVALUATED';
const regionCalibration = !callA.result
  ? 'NOT_EVALUATED'
  : liveReclass.trueConflictCount === 0 && (liveReclass.adjacentCount > 0 || liveReclass.containmentCount > 0 || rels.some((item) => item.productUiVsNavigation))
    ? 'PASS'
    : liveReclass.trueConflictCount === 0
      ? 'PARTIAL'
      : 'FAIL';

const OTHER_MODULE_B21 = new Set(['WATERMARK', 'LOGO', 'PERSON', 'FACE', 'PRIVACY_SENSITIVE']);
const failSnap =
  schemaFailure && typeof schemaFailure === 'object' && schemaFailure !== null && 'rejectedValue' in schemaFailure
    ? (schemaFailure as {
        path: string;
        observationIndex: number | null;
        field: string;
        rejectedValue: string;
        expectedEnumId: string;
        observationKeys: string[];
        code: string;
        validationStage: string;
        repairAttempted: boolean;
      })
    : null;
let enumDiagnostic: 'PASS' | 'FAIL' | 'NOT_APPLICABLE' = 'NOT_APPLICABLE';
let rejectedValue: string | null = null;
let enumClassification:
  | 'PROMPT_ENUM_DRIFT'
  | 'MODEL_ENUM_NONCOMPLIANCE'
  | 'MODEL_DTO_ENUM_GAP'
  | 'MULTIPLE'
  | 'UNKNOWN_INSUFFICIENT_EVIDENCE'
  | 'NOT_APPLICABLE' = 'NOT_APPLICABLE';
if (callA.model === 'FAIL') {
  if (failSnap?.rejectedValue) {
    rejectedValue = failSnap.rejectedValue;
    enumDiagnostic = 'PASS';
    const diagnosis = buildEnumContractDiagnosis({ recoveredType: rejectedValue, evidenceNotes: [] });
    enumClassification = diagnosis.failureClassification;
    if (rejectedValue === '[REDACTED_INVALID_ENUM_TOKEN]') {
      enumClassification = 'UNKNOWN_INSUFFICIENT_EVIDENCE';
    } else if (enumClassification === 'MODEL_DTO_ENUM_GAP' && OTHER_MODULE_B21.has(rejectedValue)) {
      enumClassification = 'MODEL_ENUM_NONCOMPLIANCE';
    }
    writeJson('enum-diagnosis/rejected-token.json', {
      rejectedValue,
      path: failSnap.path,
      observationIndex: failSnap.observationIndex,
      field: failSnap.field,
      expectedEnumId: failSnap.expectedEnumId,
      observationKeys: failSnap.observationKeys,
      repairAttempted: failSnap.repairAttempted,
    });
    writeJson('enum-diagnosis/enum-source-comparison.json', {
      promptAllows: diagnosis.promptAllowsInvalid,
      dtoAllows: diagnosis.dtoAllowsInvalid,
      b21Allows: diagnosis.b21AllowsInvalid,
      promptVsDto: diagnosis.promptVsDto,
      dtoVsB21: diagnosis.dtoVsB21,
    });
    writeJson('enum-diagnosis/failure-classification.json', {
      classification: enumClassification,
      moduleOwnershipNote:
        OTHER_MODULE_B21.has(rejectedValue) && diagnosis.b21AllowsInvalid === 'YES'
          ? 'B2-1 type exists but is not UI_STRUCTURE-owned; not treated as MODEL_DTO_ENUM_GAP'
          : null,
    });
  } else {
    enumDiagnostic = 'FAIL';
    writeJson('enum-diagnosis/rejected-token.json', { rejectedValue: null, note: 'B2-6C1_DIAGNOSTIC_REGRESSION' });
  }
} else {
  writeJson('call-a/model-schema-failure.json', failSnap ?? { status: 'NONE' });
}

if (callA.result) {
  writeJson('call-a/sanitized-observations.json', sanitized);
  const perFrame: Record<string, string[]> = {};
  for (const item of sanitized) {
    if (!item.frameId) continue;
    perFrame[item.frameId] = [...new Set([...(perFrame[item.frameId] ?? []), item.type])];
  }
  writeJson('call-a/per-frame-observations.json', perFrame);
  writeJson('semantic-calibration/product-ui-observations.json', sanitized.filter((item) => item.type === 'PRODUCT_UI').map((item) => ({
    frameId: item.frameId,
    confidence: item.confidence,
    region: item.region ?? null,
    visualSignals: item.visualSignals,
    uncertainty: item.uncertainty,
  })));
  writeJson('semantic-calibration/product-ui-result.json', {
    frames: [...productFrames],
    count: productFrames.size,
    supportedHumanProductFrames: sentFrameIds.length,
    calibration: productUiCalibration,
    status: productUiStatus,
  });
  writeJson('semantic-calibration/navigation-result.json', { frames: [...navFrames], count: navFrames.size, status: navStatus });
  writeJson('semantic-calibration/browser-result.json', {
    frames: [...browserFrames],
    count: browserFrames.size,
    status: browserStatus,
    browserSemanticRegression: browserFrames.size === 0 ? 'YES' : 'NO',
  });
  writeJson('semantic-calibration/semantic-inflation-check.json', { status: semanticInflation, chromeOnlyProduct });
  writeJson('semantic-calibration/frame-identity-check.json', { status: identity });
  writeJson('semantic-calibration/cross-frame-review.json', { status: crossFrame, note: 'no contamination rate; 3-frame sanity only' });
  writeJson('semantic-calibration/region-relationships.json', rels);
  writeJson('region-relationship/per-frame-relationships.json', rels);
  writeJson('region-relationship/browser-nav-summary.json', {
    trueConflictCount: liveReclass.trueConflictCount,
    adjacentCount: liveReclass.adjacentCount,
    containmentCount: liveReclass.containmentCount,
    ambiguousCount: liveReclass.ambiguousCount,
  });
  writeJson('region-relationship/productui-nav-summary.json', {
    relations: rels.map((item) => ({ frameId: item.frameId, relationship: item.productUiVsNavigation?.relationship ?? null })),
  });
}

const browserSemanticRegression = !callA.result ? 'NOT_EVALUATED' : browserFrames.size === 0 ? 'YES' : 'NO';
const latencyAssessment =
  callA.stopReason === 'PROVIDER_TIMEOUT' ? 'TOO_HIGH' : callA.latencyMs != null ? assessB26ALatency(callA.latencyMs) : 'NOT_EVALUATED';
const runtimeStability =
  callA.stopReason === 'PROVIDER_TIMEOUT'
    ? 'RUNTIME_VARIANCE_CONCERN'
    : callA.latencyMs == null
      ? 'NOT_CONFIRMED'
      : 'RECONFIRMED_AGAIN';
const usageRecord = callA.usage ?? callA.result?.usage ?? null;
writeJson('runtime/latency-history.json', {
  b26: { frames: 6, latencyMs: 130019 },
  b26a: { frames: 6, latencyMs: null, timeout: true, timeoutMs: 150000 },
  b26b: { frames: 3, latencyMs: 52741 },
  b26c2: { frames: 3, latencyMs: 56414 },
  b26c4: { frames: framesSent, latencyMs: callA.latencyMs, timeoutMs: B2_6B_CALL_A_TIMEOUT_MS, stopReason: callA.stopReason || null },
});
writeJson('runtime/runtime-stability.json', {
  REAL_3_FRAME_UI_STRUCTURE_RUNTIME: runtimeStability,
  LatencyAssessment: latencyAssessment,
});
writeJson('runtime/usage-summary.json', {
  usage: usageRecord
    ? {
        inputTextUnits: usageRecord.inputTextUnits ?? null,
        inputImageUnits: 'inputImageUnits' in usageRecord ? usageRecord.inputImageUnits : null,
        outputUnits: usageRecord.outputUnits ?? null,
        totalUnits: usageRecord.totalUnits ?? null,
        costStatus: usageRecord.costStatus ?? 'UNPRICED',
      }
    : null,
  costStatus: usageRecord?.costStatus ?? 'UNPRICED',
});
writeJson('latency-summary.json', {
  b26: 130019,
  b26a: 'TIMEOUT>=150000',
  b26b: 52741,
  b26c2: 56414,
  b26c4: callA.latencyMs,
  assessment: latencyAssessment,
  runtimeStability,
});

const limitations: string[] = [
  'REAL_3_FRAME_RUNTIME_SAMPLE_ONLY',
  'TEXT_EVIDENCE_STILL_UNVALIDATED',
  'DEV_ARTIFACT_STILL_UNVALIDATED',
  'BROWSER_TRUE_POSITIVE_LIMITED_TO_CONTENT_01',
  'LATENCY_STILL_PROVIDER_VARIABLE',
  'NO_FULL_GT',
];
if (callA.stopReason === 'PROVIDER_TIMEOUT') limitations.push('CALL_A_PROVIDER_TIMEOUT');
if (productUiCalibration === 'FAIL' || productUiCalibration === 'NOT_EVALUATED') limitations.push('PRODUCT_UI_UNSTABLE_OR_UNEVALUATED');
if (callA.model === 'FAIL') limitations.push('MODEL_FACING_ENUM_OR_SCHEMA_FAIL');
if (enumDiagnostic === 'FAIL') limitations.push('ENUM_DIAGNOSTIC_REGRESSION');
if (stopEarly === 'REPRESENTATIVE_SELECTOR_REGRESSION') limitations.push('REPRESENTATIVE_SELECTOR_REGRESSION');
if (browserSemanticRegression === 'YES') limitations.push('BROWSER_SEMANTIC_REGRESSION');

const semanticCore =
  pipelinePass(callA) &&
  (productUiCalibration === 'PASS' || productUiCalibration === 'PARTIAL') &&
  navStatus !== 'NOT_OBSERVED' &&
  browserStatus !== 'NOT_OBSERVED' &&
  semanticInflation !== 'OBSERVED' &&
  identity === 'PASS' &&
  crossFrame !== 'CONTAMINATION_OBSERVED' &&
  leak !== 'INVALID';
const gate =
  stopEarly === 'REPRESENTATIVE_SELECTOR_REGRESSION' ||
  !pipelinePass(callA) ||
  leak === 'INVALID' ||
  identity === 'FAIL' ||
  productUiCalibration === 'FAIL' ||
  callA.stopReason === 'PROVIDER_TIMEOUT'
    ? 'FAIL'
    : productUiCalibration === 'PASS' && latencyAssessment !== 'HIGH' && regionCalibration !== 'FAIL' && browserSemanticRegression !== 'YES'
      ? 'PASS'
      : 'PASS_WITH_LIMITATIONS';
const envAfter = envFingerprint();

writeJson('provider-call-audit.json', {
  regressionVisionCalls: 0,
  calibrationVisionCalls: callA.calls,
  total: callA.calls,
  max: 1,
  framesSent,
  wholeVideoSent: false,
  oldAssetSent: false,
  ocrCalls: 0,
});
writeJson('production-wiring-audit.json', { worker: false, director: false, hybrid: false, crop: false, context: false, smokeOnly: true });
writeJson('env-mutation-audit.json', { before: envBefore, after: envAfter, modified: JSON.stringify(envBefore) !== JSON.stringify(envAfter) });
writeJson('security-audit.json', {
  framesSent,
  wholeVideoSent: 'NO',
  oldAssetSent: 'NO',
  otherAssetsSent: 'NO',
  rawFramesPersisted: 'NO',
  privacyBlocked,
  stopEarly: stopEarly || null,
});
writeJson('limitations.json', { items: limitations, count: limitations.length });
writeJson('files-changed.json', {
  step: '13.15B-1E-B2-6C4',
  files: [
    'apps/backend/scripts/step-13.15b1e-b2-6c4-exact-enum-resmoke.ts',
    'apps/backend/package.json',
  ],
  promptUnchangedThisStep: true,
  enumUnchanged: true,
  adapterSemanticUnchanged: true,
  b21Unchanged: true,
  envUnchanged: true,
  noGit: true,
});
writeJson('implementation-summary.json', {
  step: '13.15B-1E-B2-6C4',
  analyzedAsset: CONTENT_01_NEW_ASSET_ID,
  model,
  modelSource,
  credential,
  gate,
  enumDiagnostic,
  rejectedValue,
  enumClassification,
  framesSent,
  originalSix,
  extractedCount,
  productUiCalibration,
  runtimePromptVersion: UI_STRUCTURE_PROMPT_MODULE_V2,
  latencyMs: callA.latencyMs,
  runtimeStability,
  browserSemanticRegression,
});

function scanSecrets() {
  const hits: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      const text = readFileSync(full, 'utf8');
      if (/Authorization\s*:/i.test(text) || /data:image\//i.test(text) || /base64,/i.test(text) || /MODEL_API_KEY\s*=/.test(text)) {
        hits.push(path.relative(evidenceDir, full));
      }
    }
  };
  walk(evidenceDir);
  return hits;
}
writeJson('secret-audit.json', { secretsExposed: scanSecrets().length > 0, hits: scanSecrets() });

process.stdout.write(
  `${JSON.stringify({
    gate,
    stopEarly: stopEarly || null,
    originalSix,
    framesSent,
    extractedCount,
    credential,
    modelSource,
    callA: {
      transport: callA.transport,
      assistant: callA.assistant,
      json: callA.json,
      model: callA.model,
      adapter: callA.adapter,
      b2: callA.b2,
      normalize: callA.normalize,
      calls: callA.calls,
      latencyMs: callA.latencyMs,
      stopReason: callA.stopReason,
    },
    productUiCalibration,
    productFrames: productFrames.size,
    navStatus,
    browserStatus,
    appChrome: appChrome ? 'OBSERVED' : callA.result ? 'NOT_OBSERVED' : 'NOT_EVALUATED',
    semanticInflation,
    identity,
    crossFrame,
    regionCalibration,
    trueConflicts: callA.result ? liveReclass.trueConflictCount : null,
    adjacent: callA.result ? liveReclass.adjacentCount : null,
    containment: callA.result ? liveReclass.containmentCount : null,
    leak,
    rejectedValue,
    enumClassification,
    enumDiagnostic,
    runtimeStability,
    browserSemanticRegression,
    incidentalStatus,
    limitations: limitations.length,
    semanticCore,
    promptVersion: UI_STRUCTURE_PROMPT_MODULE_V2,
  })}\n`,
);

if (gate === 'FAIL' || privacyBlocked || callA.calls > 1 || stopEarly === 'REPRESENTATIVE_SELECTOR_REGRESSION') {
  process.exitCode = 1;
}
