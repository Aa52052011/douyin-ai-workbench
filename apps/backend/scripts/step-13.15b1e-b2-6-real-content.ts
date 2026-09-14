/**
 * B2-6 Content #1 real semantic frame validation. Max 2 inferences.
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
import { aggregatePerFrameObservations, assessLatency, decisionLeakage } from '../src/production-v2/visual-semantic/runtime/benchmark-evaluators.js';
import {
  assertB26AssetId,
  assertB26Cli,
  CONTENT_01_NEW_ASSET_ID,
  privacyPreflightScan,
  REAL_ASSET_PRIVACY_PREFLIGHT_BLOCKED,
  sanitizeVisibleText,
} from '../src/production-v2/visual-semantic/runtime/b2-6-guards.js';
import { InferenceCallGuard } from '../src/production-v2/visual-semantic/runtime/inference-guard.js';
import {
  FROZEN_SMOKE_MODEL,
  REAL_CONTENT_CALL_A_TIMEOUT_MS,
  REAL_CONTENT_CALL_B_TIMEOUT_MS,
  REAL_CONTENT_INFERENCE_LIMIT,
  REAL_CONTENT_VISION_INFERENCE_LIMIT_EXCEEDED,
  SMOKE_INFERENCE_LIMIT_EXCEEDED,
} from '../src/production-v2/visual-semantic/runtime/multimodal.types.js';
import { RealVisualSemanticProviderAdapter } from '../src/production-v2/visual-semantic/runtime/real-visual-semantic.adapter.js';
import { RouterOneMultimodalClient } from '../src/production-v2/visual-semantic/runtime/router-one-multimodal.client.js';
import { PROMPT_MODULES_MULTI_FRAME, PROMPT_MODULES_TEXT_DEV } from '../src/production-v2/visual-semantic/runtime/ui-structure-prompt.js';
import type { VisualSemanticProviderResult } from '../src/production-v2/visual-semantic/contracts/provider-runtime.types.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(repoRoot, '.local', 'dogfood', '30-day', 'first-3', 'content-01', 'production-2-visual-semantic', 'b2-6');
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

function writeJson(name: string, value: unknown) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`);
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
  b2: Layer;
  normalize: Layer;
  calls: number;
  stopReason: string;
  result: VisualSemanticProviderResult | null;
  latencyMs: number | null;
};

function emptyCall(): CallState {
  return { transport: 'NOT_RUN', json: 'NOT_RUN', model: 'NOT_RUN', b2: 'NOT_RUN', normalize: 'NOT_RUN', calls: 0, stopReason: '', result: null, latencyMs: null };
}

const callA = emptyCall();
const callB = emptyCall();
let framesSent = 0;
let privacyBlocked = false;
let stopEarly = '';

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

function pipelinePass(call: CallState): boolean {
  return call.transport === 'PASS' && call.json === 'PASS' && call.model === 'PASS' && call.b2 === 'PASS' && call.normalize === 'PASS';
}

async function invokeCall(
  adapter: RealVisualSemanticProviderAdapter,
  guard: InferenceCallGuard,
  client: RouterOneMultimodalClient,
  request: unknown,
  state: CallState,
  prefix: string,
): Promise<void> {
  const before = guard.calls;
  try {
    const result = await adapter.analyzeVideoFrames(request);
    state.result = result;
    state.calls = guard.calls - before;
    state.transport = 'PASS';
    const pipe = adapter.lastPipelineMeta;
    state.json = pipe.jsonSyntax;
    state.model = pipe.modelFacingSchema;
    state.b2 = pipe.internalB2Schema;
    state.normalize = pipe.normalization;
    state.latencyMs = pipe.latencyMs;
    writeJson(`${prefix}-transport.json`, { status: 'PASS', httpStatus: pipe.httpStatus });
    writeJson(`${prefix}-json.json`, { status: pipe.jsonSyntax, native: pipe.jsonParseNative, length: pipe.assistantContentLength });
    writeJson(`${prefix}-model-schema.json`, { status: pipe.modelFacingSchema, errorPaths: pipe.modelSchemaErrorPaths });
    writeJson(`${prefix}-b2-schema.json`, { status: pipe.internalB2Schema, errorPaths: pipe.internalSchemaErrorPaths });
    writeJson(`${prefix}-normalization.json`, { status: pipe.normalization, observationCount: pipe.observationCountNormalized, semanticRegions: pipe.semanticRegionsCount });
  } catch (error) {
    state.calls = guard.calls - before;
    const pipe = adapter.lastPipelineMeta;
    state.json = pipe.jsonSyntax;
    state.model = pipe.modelFacingSchema;
    state.b2 = pipe.internalB2Schema;
    state.normalize = pipe.normalization;
    state.latencyMs = pipe.latencyMs;
    if (error instanceof Error && error.message === SMOKE_INFERENCE_LIMIT_EXCEEDED) {
      throw new Error(REAL_CONTENT_VISION_INFERENCE_LIMIT_EXCEEDED);
    }
    if (error instanceof VisualSemanticProviderError && error.code === 'PROVIDER_TIMEOUT') {
      state.transport = 'FAIL';
      state.stopReason = 'PROVIDER_TIMEOUT';
    } else if (error instanceof VisualSemanticProviderError && error.code === 'SCHEMA_VALIDATION_FAILED') {
      state.transport = 'PASS';
      state.stopReason = error.debugLabel ?? 'SCHEMA_VALIDATION_FAILED';
    } else if (error instanceof VisualSemanticProviderError && error.code === 'INVALID_PROVIDER_RESPONSE') {
      state.transport = client.diagnostics.lastHttpStatus === 200 ? 'PASS' : 'FAIL';
      state.stopReason = 'INVALID_PROVIDER_RESPONSE';
    } else {
      state.transport = client.diagnostics.lastHttpStatus === 200 ? 'PASS' : 'FAIL';
      state.stopReason = error instanceof VisualSemanticProviderError ? error.code : 'UNKNOWN';
    }
    writeJson(`${prefix}-transport.json`, { status: state.transport, stopReason: state.stopReason });
    writeJson(`${prefix}-json.json`, { status: state.json });
    writeJson(`${prefix}-model-schema.json`, { status: state.model, errorPaths: pipe.modelSchemaErrorPaths });
    writeJson(`${prefix}-b2-schema.json`, { status: state.b2, errorPaths: pipe.internalSchemaErrorPaths });
    writeJson(`${prefix}-normalization.json`, { status: state.normalize });
  }
}

const temps: string[] = [];
try {
  if (!cfg.apiKey || !cfg.baseUrl) {
    stopEarly = 'EXISTING_ROUTER_CREDENTIAL_NOT_AVAILABLE';
  } else if (!isFfmpegAvailable()) {
    stopEarly = 'FFMPEG_UNAVAILABLE';
  } else if (!process.env.DATABASE_URL) {
    stopEarly = 'DATABASE_URL_MISSING';
  } else {
    const prisma = new PrismaClient();
    const storage = new LocalStorageProvider();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'acf-b26-cache-'));
    temps.push(cacheDir);
    try {
      const row = await prisma.asset.findUnique({
        where: { id: CONTENT_01_NEW_ASSET_ID },
        select: { id: true, type: true, mimeType: true, contentHash: true, storageKey: true, width: true, height: true },
      });
      writeJson('asset-validation.json', {
        id: row?.id ?? null,
        type: row?.type ?? null,
        mimeType: row?.mimeType ?? null,
        hasStorageKey: Boolean(row?.storageKey),
        expected: CONTENT_01_NEW_ASSET_ID,
      });
      writeJson('scope-guard.json', { allowedAsset: CONTENT_01_NEW_ASSET_ID, oldAssetBlocked: true, argvExternal: false });
      if (!row?.storageKey) {
        stopEarly = 'ASSET_NOT_FOUND';
      } else {
        const body = await storage.get(row.storageKey);
        const work = await mkdtemp(path.join(os.tmpdir(), 'acf-b26-mat-'));
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
          writeJson(
            'b1-facts-summary.json',
            redactPaths({
              status: b1.deterministicStatus ?? b1.facts?.deterministicStatus,
              durationMs: b1.facts?.metadata.durationMs,
              width: b1.facts?.metadata.width,
              height: b1.facts?.metadata.height,
              hasAudio: b1.facts?.metadata.hasAudio,
              completedStages: b1.facts?.completedStages,
              topStripCount: b1.facts?.topStructuredStripCandidates?.length ?? 0,
            }),
          );
          const guard = new InferenceCallGuard(REAL_CONTENT_INFERENCE_LIMIT);
          const client = new RouterOneMultimodalClient({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }, guard);
          const adapter = new RealVisualSemanticProviderAdapter(client, model);
          await withSemanticFrames(
            {
              assetId: CONTENT_01_NEW_ASSET_ID,
              mediaKind: 'VIDEO',
              mediaPath: filePath,
              facts: b1.facts,
              contentHash: row.contentHash ?? undefined,
            },
            async (prep, scope) => {
              writeJson('semantic-frame-plan.json', redactPaths(prep.selectionPlan));
              writeJson('semantic-frame-extraction-summary.json', {
                status: prep.status,
                requested: prep.selectionPlan.requestedFrameCount,
                max: prep.selectionPlan.maxFrameCount,
                extracted: prep.extractedFrames.length,
                providerReady: prep.providerReadyFrames.length,
                warnings: prep.warnings,
                longEdge: SEMANTIC_FRAME_CONFIG.semanticLongEdge,
                expectedSize: semanticSize(b1.facts?.metadata.width ?? 1920, b1.facts?.metadata.height ?? 1040),
                timing: prep.timing,
              });
              const ready = prep.providerReadyFrames.filter((item) => item.extractionStatus === 'OK' && !item.excludedFromProvider);
              framesSent = ready.length;
              writeJson('provider-ready-frame-summary.json', {
                count: ready.length,
                frames: ready.map((item) => ({
                  frameId: item.frameId,
                  timestampMs: item.timestampMs,
                  width: item.width,
                  height: item.height,
                  reasons: item.reasons,
                })),
              });
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
              if (ready.length < 1) {
                stopEarly = 'NO_PROVIDER_READY_FRAMES';
                return;
              }
              const frames = ready.map((item) => ({
                frameId: item.frameId,
                timestampMs: item.timestampMs,
                width: item.width,
                height: item.height,
                mediaRef: { kind: 'LOCAL_REF' as const, reference: scope.resolve(item.frameId) },
                selectionReason: item.reasons,
              }));
              writeJson('call-a-request-summary.json', {
                requestId: 'b2-6-call-a-ui-structure',
                model,
                numberOfImages: frames.length,
                taskModules: ['UI_STRUCTURE'],
                timeoutMs: REAL_CONTENT_CALL_A_TIMEOUT_MS,
                promptModules: PROMPT_MODULES_MULTI_FRAME,
                retry: false,
                backup: false,
              });
              await invokeCall(
                adapter,
                guard,
                client,
                {
                  requestId: 'b2-6-call-a-ui-structure',
                  assetId: CONTENT_01_NEW_ASSET_ID,
                  mediaKind: 'VIDEO',
                  analysisMode: 'VIDEO_FRAME_SET',
                  durationMs: b1.facts?.metadata.durationMs,
                  frames,
                  taskModules: ['UI_STRUCTURE'],
                  schemaVersion: 'visual.semantic.provider-request:v1',
                  promptVersion: 'visual.semantic.base:v1',
                  timeoutMs: REAL_CONTENT_CALL_A_TIMEOUT_MS,
                },
                callA,
                'call-a',
              );
              if (callA.result) {
                const sanitized = sanitizeObservations(callA.result);
                writeJson('call-a-sanitized-observations.json', sanitized);
                const frameMap: Record<string, string[]> = {};
                for (const item of callA.result.observations) {
                  const id = item.evidence.frameIds[0] ?? 'unknown';
                  frameMap[id] = [...new Set([...(frameMap[id] ?? []), item.type])];
                }
                writeJson('call-a-frame-map.json', frameMap);
                writeJson(
                  'browser-chrome-observations.json',
                  callA.result.observations
                    .filter((item) => item.type === 'BROWSER_CHROME')
                    .map((item) => ({
                      frameId: item.evidence.frameIds[0],
                      confidence: item.confidence,
                      region: item.region ?? null,
                      signals: item.evidence.visualSignals ?? [],
                    })),
                );
                writeJson(
                  'product-navigation-observations.json',
                  callA.result.observations
                    .filter((item) => item.type === 'NAVIGATION')
                    .map((item) => ({ frameId: item.evidence.frameIds[0], confidence: item.confidence, region: item.region ?? null })),
                );
                const conflicts = [];
                for (const item of callA.result.observations.filter((obs) => obs.type === 'BROWSER_CHROME' && obs.region)) {
                  const nav = callA.result.observations.find(
                    (other) =>
                      other.evidence.frameIds[0] === item.evidence.frameIds[0] &&
                      (other.type === 'NAVIGATION' || other.type === 'PRODUCT_UI') &&
                      other.region,
                  );
                  if (nav) {
                    conflicts.push({
                      kind: 'SEMANTIC_REGION_CONFLICT_CANDIDATE',
                      frameId: item.evidence.frameIds[0],
                      types: [item.type, nav.type],
                    });
                  }
                }
                writeJson('semantic-conflicts.json', conflicts);
              }
              if (!pipelinePass(callA)) {
                callB.stopReason = 'SKIPPED_AFTER_CALL_A_FAILURE';
                return;
              }
              writeJson('call-b-request-summary.json', {
                requestId: 'b2-6-call-b-text-dev',
                model,
                numberOfImages: frames.length,
                taskModules: ['TEXT_EVIDENCE', 'DEVELOPER_ARTIFACT'],
                timeoutMs: REAL_CONTENT_CALL_B_TIMEOUT_MS,
                promptModules: PROMPT_MODULES_TEXT_DEV,
              });
              await invokeCall(
                adapter,
                guard,
                client,
                {
                  requestId: 'b2-6-call-b-text-dev',
                  assetId: CONTENT_01_NEW_ASSET_ID,
                  mediaKind: 'VIDEO',
                  analysisMode: 'VIDEO_FRAME_SET',
                  durationMs: b1.facts?.metadata.durationMs,
                  frames,
                  taskModules: ['TEXT_EVIDENCE', 'DEVELOPER_ARTIFACT'],
                  schemaVersion: 'visual.semantic.provider-request:v1',
                  promptVersion: 'visual.semantic.base:v1',
                  timeoutMs: REAL_CONTENT_CALL_B_TIMEOUT_MS,
                },
                callB,
                'call-b',
              );
              if (callB.result) {
                writeJson('text-evidence-summary.json', {
                  fragments: callB.result.observations.flatMap((item) =>
                    (item.evidence.textFragments ?? []).map((frag) => {
                      const redacted = sanitizeVisibleText(frag.text);
                      return {
                        frameId: frag.frameId,
                        confidence: frag.confidence,
                        ...(redacted.redacted
                          ? { category: redacted.category, redactedText: redacted.sanitized }
                          : { text: redacted.sanitized }),
                      };
                    }),
                  ),
                });
                writeJson('developer-artifact-summary.json', {
                  observations: callB.result.observations
                    .filter((item) => ['DEVELOPER_ARTIFACT', 'LOCALHOST_REFERENCE', 'TERMINAL'].includes(item.type))
                    .map((item) => ({ type: item.type, frameId: item.evidence.frameIds[0], confidence: item.confidence, region: item.region ?? null })),
                });
              }
            },
          );
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

const typesA = new Set(callA.result?.observations.map((item) => item.type) ?? []);
const productUi = typesA.has('PRODUCT_UI') ? 'OBSERVED' : typesA.has('CONTENT_PANEL') ? 'PARTIAL' : 'NOT_OBSERVED';
const navigation = typesA.has('NAVIGATION') ? 'OBSERVED' : 'NOT_OBSERVED';
const browser = typesA.has('BROWSER_CHROME') ? 'OBSERVED_ON_REAL_CONTENT_1' : 'NOT_OBSERVED';
const appChrome = typesA.has('APP_WINDOW_CHROME') ? 'OBSERVED' : 'NOT_OBSERVED';
const identity =
  callA.result && callA.result.observations.every((item) => item.evidence.frameIds[0]) ? 'PASS' : callA.result ? 'FAIL' : 'NOT_EVALUATED';
const leak = callA.result ? decisionLeakage(callA.result) : 'NONE';
const regions = callA.result?.observations.filter((item) => item.region) ?? [];
const regionSanity = !callA.result ? 'NOT_EVALUATED' : regions.length === 0 ? 'NOT_EVALUATED' : regions.length >= Math.ceil((callA.result.observations.length || 1) * 0.5) ? 'GOOD' : 'ACCEPTABLE';
const textA = callA.result?.observations.some((item) => item.type === 'TEXT_REGION' || (item.evidence.textFragments?.length ?? 0) > 0);
const textB = (callB.result?.observations.flatMap((item) => item.evidence.textFragments ?? []).length ?? 0) > 0;
const textStatus = textB || textA ? 'USEFUL' : pipelinePass(callA) ? 'PARTIAL' : 'NOT_EVALUATED';
const localhost =
  callB.result?.observations.some((item) => item.type === 'LOCALHOST_REFERENCE' || (item.evidence.textFragments ?? []).some((frag) => /localhost|127\.0\.0\.1/i.test(frag.text)))
    ? 'OBSERVED'
    : callB.result
      ? 'NOT_OBSERVED'
      : 'NOT_RUN';
const devStatus =
  callB.result?.observations.some((item) => ['DEVELOPER_ARTIFACT', 'LOCALHOST_REFERENCE', 'TERMINAL'].includes(item.type))
    ? 'OBSERVED'
    : callB.result
      ? 'NOT_OBSERVED'
      : 'NOT_RUN';

let quality: 'PASS' | 'PASS_WITH_LIMITATIONS' | 'NEEDS_CALIBRATION' | 'FAIL' | 'NOT_EVALUATED' = 'NOT_EVALUATED';
if (!pipelinePass(callA)) quality = callA.transport === 'NOT_RUN' ? 'NOT_EVALUATED' : 'FAIL';
else if (identity === 'PASS' && productUi === 'OBSERVED') quality = textStatus === 'USEFUL' ? 'PASS' : 'PASS_WITH_LIMITATIONS';
else quality = 'NEEDS_CALIBRATION';

const gateOk =
  !privacyBlocked &&
  pipelinePass(callA) &&
  identity === 'PASS' &&
  productUi !== 'NOT_OBSERVED' &&
  leak !== 'INVALID' &&
  framesSent >= 1 &&
  framesSent <= 6 &&
  callA.calls + callB.calls <= 2;
const gate = !gateOk ? 'FAIL' : quality === 'PASS' ? 'PASS' : quality === 'PASS_WITH_LIMITATIONS' ? 'PASS_WITH_LIMITATIONS' : 'FAIL';

const envAfter = envFingerprint();
writeJson('frame-identity-validation.json', { status: identity });
writeJson('cross-frame-review.json', { count: 0, note: 'no full real GT; denominator=human sample none automated unique-token', aggregation: callA.result ? aggregatePerFrameObservations(callA.result) : [] });
writeJson('human-validation-summary.json', {
  assetCurrentCleanRecording: { human: 'HUMAN_CONFIRMED', vision: 'NOT_A_VISION_TASK' },
  oldMockAbsent: { human: 'HUMAN_CONFIRMED', vision: typesA.has('DEVELOPER_ARTIFACT') ? 'CANDIDATE_SEEN_IN_CALL_A' : 'NO_DEV_TYPE_IN_CALL_A' },
  browserChrome: { human: 'HUMAN_EXPECTED', vision: browser },
  productUi: { human: 'HUMAN_CONFIRMED', vision: productUi },
});
writeJson('real-semantic-quality-summary.json', { quality, productUi, navigation, browser, appChrome, textStatus, identity, gate });
writeJson('latency-usage.json', {
  callA: { latencyMs: callA.latencyMs, usage: callA.result?.usage ?? null, assessment: callA.latencyMs != null ? assessLatency(callA.latencyMs) : 'NOT_EVALUATED' },
  callB: { latencyMs: callB.latencyMs, usage: callB.result?.usage ?? null, assessment: callB.latencyMs != null ? assessLatency(callB.latencyMs) : 'NOT_EVALUATED' },
  totalMs: (callA.latencyMs ?? 0) + (callB.latencyMs ?? 0),
});
writeJson('provider-call-audit.json', {
  regressionVisionCalls: 0,
  callA: callA.calls,
  callB: callB.calls,
  total: callA.calls + callB.calls,
  max: 2,
  framesSent,
  wholeVideoSent: false,
  oldAssetSent: false,
});
writeJson('production-wiring-audit.json', { worker: false, director: false, videoGeneration: false, smokeOnly: true });
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
        hits.push(name);
      }
    }
  };
  walk(evidenceDir);
  return hits;
}
const secretHits = scanSecrets();
writeJson('secret-audit.json', { secretsExposed: secretHits.length > 0, hits: secretHits });

process.stdout.write(
  `${JSON.stringify({
    gate,
    quality,
    stopEarly: stopEarly || null,
    framesSent,
    callA: { transport: callA.transport, json: callA.json, model: callA.model, b2: callA.b2, normalize: callA.normalize, calls: callA.calls, latencyMs: callA.latencyMs, stopReason: callA.stopReason },
    callB: { transport: callB.transport, json: callB.json, model: callB.model, b2: callB.b2, normalize: callB.normalize, calls: callB.calls, latencyMs: callB.latencyMs, stopReason: callB.stopReason },
    productUi,
    navigation,
    browser,
    identity,
    textStatus,
    devStatus,
    localhost,
    regionSanity,
    leak,
    modelSource,
  })}\n`,
);

if (gate === 'FAIL' || privacyBlocked || callA.calls + callB.calls > 2) {
  process.exitCode = 1;
}
