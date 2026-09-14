/**
 * B2-5 multi-image vision benchmark. Max 3 inferences. Synthetic only.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRealModelConfig } from '../src/agents/models/model.config.js';
import { isFfmpegAvailable } from '../src/media/ffmpeg/ffmpeg-available.js';
import { VisualSemanticProviderError } from '../src/production-v2/visual-semantic/errors/visual-semantic-error.js';
import {
  aggregatePerFrameObservations,
  assessLatency,
  decisionLeakage,
  evaluateBrowser,
  evaluateContamination,
  evaluateFrameIdentity,
  evaluatePrecisionRecall,
  evaluateRegions,
  evaluateText,
  pipelinePass,
  shouldRunOptionalText,
  shouldRunSixImage,
} from '../src/production-v2/visual-semantic/runtime/benchmark-evaluators.js';
import { InferenceCallGuard } from '../src/production-v2/visual-semantic/runtime/inference-guard.js';
import {
  BENCHMARK_INFERENCE_LIMIT,
  FROZEN_SMOKE_MODEL,
  VISION_MULTI_3_TIMEOUT_MS,
  VISION_MULTI_6_TIMEOUT_MS,
} from '../src/production-v2/visual-semantic/runtime/multimodal.types.js';
import { RealVisualSemanticProviderAdapter } from '../src/production-v2/visual-semantic/runtime/real-visual-semantic.adapter.js';
import { RouterOneMultimodalClient } from '../src/production-v2/visual-semantic/runtime/router-one-multimodal.client.js';
import { assertNotDogfoodAsset, assertSmokeHasNoAssetIdArg } from '../src/production-v2/visual-semantic/runtime/smoke-guards.js';
import {
  SYNTHETIC_BENCHMARK_VERSION,
  SYNTHETIC_FRAME_MANIFEST,
  rasterizeBenchmarkSet,
  smoke3Manifests,
  smoke6Manifests,
  type SyntheticFrameManifest,
} from '../src/production-v2/visual-semantic/runtime/synthetic-benchmark-frames.js';
import { PROMPT_MODULES_MULTI_FRAME } from '../src/production-v2/visual-semantic/runtime/ui-structure-prompt.js';
import type { VisualSemanticProviderResult } from '../src/production-v2/visual-semantic/contracts/provider-runtime.types.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceRoot = path.join(
  repoRoot,
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-5',
);
const envPath = path.join(repoRoot, '.env');
const ASSET_ID = 'synthetic-b2-5-benchmark';

assertSmokeHasNoAssetIdArg(process.argv.slice(2));

function loadAllowlistedEnv() {
  if (!existsSync(envPath)) return;
  const allow = new Set(['MODEL_API_KEY', 'MODEL_BASE_URL', 'MODEL_NAME', 'VISUAL_SEMANTIC_MODEL', 'FFMPEG_PATH', 'FFPROBE_PATH']);
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!allow.has(key)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function envFingerprint(): { size: number; mtimeMs: number } | null {
  if (!existsSync(envPath)) return null;
  const st = statSync(envPath);
  return { size: st.size, mtimeMs: st.mtimeMs };
}

function writeJson(rel: string, value: unknown) {
  const full = path.join(evidenceRoot, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

loadAllowlistedEnv();
const envBefore = envFingerprint();
process.env.NODE_ENV = process.env.NODE_ENV === 'test' ? 'development' : process.env.NODE_ENV;
const modelEnv = process.env.VISUAL_SEMANTIC_MODEL?.trim() ?? '';
const modelSource = modelEnv ? 'ENV_CONFIGURED' : 'SMOKE_DEFAULT_ONLY';
const model = modelEnv || FROZEN_SMOKE_MODEL;
const cfg = readRealModelConfig();
const credentialOk = Boolean(cfg.apiKey && cfg.baseUrl);

type Layer = 'PASS' | 'FAIL' | 'NOT_RUN';
type SmokeOutcome = {
  name: string;
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
};

function emptyOutcome(name: string): SmokeOutcome {
  return {
    name,
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
  };
}

assertNotDogfoodAsset(ASSET_ID);

const three = emptyOutcome('3-image');
const six = emptyOutcome('6-image');
let textRun: 'RUN' | 'NOT_RUN' = 'NOT_RUN';
const tmpHold: { dir?: string } = {};
let client: RouterOneMultimodalClient | undefined;
let adapter: RealVisualSemanticProviderAdapter | undefined;
let guard: InferenceCallGuard | undefined;

async function runSmoke(
  outcome: SmokeOutcome,
  manifests: SyntheticFrameManifest[],
  timeoutMs: number,
  requestId: string,
  outDir: string,
): Promise<void> {
  if (!adapter || !guard || !tmpHold.dir) return;
  const callsBefore = guard.calls;
  const rendered = await rasterizeBenchmarkSet(manifests, path.join(tmpHold.dir, outcome.name));
  const request = {
    requestId,
    assetId: ASSET_ID,
    mediaKind: 'VIDEO' as const,
    analysisMode: 'VIDEO_FRAME_SET' as const,
    durationMs: manifests.length * 1000,
    frames: rendered.map((item, index) => ({
      frameId: item.manifest.frameId,
      timestampMs: index * 1000,
      width: 1280,
      height: 720,
      mediaRef: { kind: 'LOCAL_REF' as const, reference: item.jpegPath },
      selectionReason: ['UNIFORM' as const],
    })),
    taskModules: ['UI_STRUCTURE' as const],
    schemaVersion: 'visual.semantic.provider-request:v1' as const,
    promptVersion: 'visual.semantic.base:v1' as const,
    timeoutMs,
  };
  writeJson(`${outDir}/request-summary.json`, {
    requestId,
    model,
    numberOfImages: rendered.length,
    perImageBytes: rendered.map((item) => item.bytes),
    totalImageBytes: rendered.reduce((sum, item) => sum + item.bytes, 0),
    estimatedBase64Bytes: Math.ceil(rendered.reduce((sum, item) => sum + item.bytes, 0) * (4 / 3)),
    timeoutMs,
    responseFormat: 'json_object',
    promptModules: PROMPT_MODULES_MULTI_FRAME,
    retry: false,
    backup: false,
  });
  try {
    const result = await adapter.analyzeVideoFrames(request);
    outcome.result = result;
    outcome.calls = guard.calls - callsBefore;
    outcome.transport = 'PASS';
    const pipe = adapter.lastPipelineMeta;
    outcome.json = pipe.jsonSyntax;
    outcome.model = pipe.modelFacingSchema;
    outcome.adapter = pipe.adapterMapping;
    outcome.b2 = pipe.internalB2Schema;
    outcome.normalize = pipe.normalization;
    outcome.latencyMs = pipe.latencyMs;
    writeSmokeEvidence(outDir, manifests, result, adapter);
  } catch (error) {
    outcome.calls = guard.calls - callsBefore;
    const pipe = adapter.lastPipelineMeta;
    outcome.json = pipe.jsonSyntax;
    outcome.model = pipe.modelFacingSchema;
    outcome.adapter = pipe.adapterMapping;
    outcome.b2 = pipe.internalB2Schema;
    outcome.normalize = pipe.normalization;
    outcome.latencyMs = pipe.latencyMs;
    const mapped = client?.diagnostics.lastMapped;
    if (mapped?.dataUrlUnsupported) {
      outcome.transport = 'FAIL';
      outcome.stopReason = 'DATA_URL_NOT_SUPPORTED';
    } else if (error instanceof VisualSemanticProviderError && error.code === 'PROVIDER_TIMEOUT') {
      outcome.transport = 'FAIL';
      outcome.stopReason = 'PROVIDER_TIMEOUT';
    } else if (error instanceof VisualSemanticProviderError && error.code === 'SCHEMA_VALIDATION_FAILED') {
      outcome.transport = 'PASS';
      outcome.stopReason = error.debugLabel ?? 'SCHEMA_VALIDATION_FAILED';
    } else if (error instanceof VisualSemanticProviderError && error.code === 'INVALID_PROVIDER_RESPONSE') {
      outcome.transport = client?.diagnostics.lastHttpStatus === 200 ? 'PASS' : 'FAIL';
      outcome.stopReason = 'INVALID_PROVIDER_RESPONSE';
    } else if (error instanceof Error && error.message === 'SMOKE_INFERENCE_LIMIT_EXCEEDED') {
      outcome.stopReason = 'SMOKE_INFERENCE_LIMIT_EXCEEDED';
    } else {
      outcome.transport = client?.diagnostics.lastHttpStatus === 200 ? 'PASS' : 'FAIL';
      outcome.stopReason = error instanceof VisualSemanticProviderError ? error.code : 'UNKNOWN';
    }
    writeJson(`${outDir}/sanitized-model-output.json`, pipe.sanitizedModelOutput);
    writeJson(`${outDir}/json-result.json`, { status: outcome.json, native: pipe.jsonParseNative });
    writeJson(`${outDir}/model-schema-result.json`, { status: outcome.model, errorPaths: pipe.modelSchemaErrorPaths });
    writeJson(`${outDir}/adapter-result.json`, { status: outcome.adapter });
    writeJson(`${outDir}/b2-schema-result.json`, { status: outcome.b2, errorPaths: pipe.internalSchemaErrorPaths });
    writeJson(`${outDir}/normalization-result.json`, { status: outcome.normalize });
    writeJson(`${outDir}/latency-usage.json`, { latencyMs: pipe.latencyMs, usage: pipe.usage, stopReason: outcome.stopReason });
  }
}

function writeSmokeEvidence(
  outDir: string,
  manifests: SyntheticFrameManifest[],
  result: VisualSemanticProviderResult,
  live: RealVisualSemanticProviderAdapter,
) {
  const pipe = live.lastPipelineMeta;
  const payload = live.lastPayloadMeta;
  const identity = evaluateFrameIdentity(result, manifests.map((item) => item.frameId));
  const pr = evaluatePrecisionRecall(result, manifests);
  const contamination = evaluateContamination(result, manifests);
  const browser = evaluateBrowser(result, manifests);
  const regions = evaluateRegions(result, manifests);
  const text = evaluateText(result, manifests);
  writeJson(`${outDir}/sanitized-model-output.json`, pipe.sanitizedModelOutput);
  writeJson(`${outDir}/json-result.json`, {
    status: pipe.jsonSyntax,
    native: pipe.jsonParseNative,
    topLevelKeys: pipe.topLevelKeys,
    observationCount: pipe.observationCount,
    assistantContentLength: pipe.assistantContentLength,
  });
  writeJson(`${outDir}/model-schema-result.json`, { status: pipe.modelFacingSchema, errorPaths: pipe.modelSchemaErrorPaths });
  writeJson(`${outDir}/adapter-result.json`, {
    status: pipe.adapterMapping,
    frameIdentityCopiedFromModel: true,
    guessedFrameFromOrder: false,
  });
  writeJson(`${outDir}/b2-schema-result.json`, { status: pipe.internalB2Schema, errorPaths: pipe.internalSchemaErrorPaths });
  writeJson(`${outDir}/normalization-result.json`, {
    status: pipe.normalization,
    observationCount: pipe.observationCountNormalized,
    semanticRegionsCount: pipe.semanticRegionsCount,
    stableIds: pipe.stableIds,
    aggregation: aggregatePerFrameObservations(result),
    decisionLeakage: decisionLeakage(result),
  });
  writeJson(`${outDir}/semantic-evaluation.json`, { frameIdentity: identity, precisionRecall: pr, contamination });
  writeJson(`${outDir}/region-evaluation.json`, regions);
  writeJson(`${outDir}/browser-evaluation.json`, browser);
  writeJson(`${outDir}/latency-usage.json`, {
    latencyMs: pipe.latencyMs,
    usage: pipe.usage,
    payload,
    latencyAssessment: pipe.latencyMs != null ? assessLatency(pipe.latencyMs) : 'NOT_EVALUATED',
  });
  writeJson(`${outDir}/text-evaluation.json`, text);
}

try {
  if (!credentialOk) {
    three.stopReason = 'EXISTING_ROUTER_CREDENTIAL_NOT_AVAILABLE';
  } else if (!isFfmpegAvailable()) {
    three.stopReason = 'FFMPEG_UNAVAILABLE_FOR_FIXTURE';
  } else {
    tmpHold.dir = await mkdtemp(path.join(os.tmpdir(), 'acf-b2-5-'));
    guard = new InferenceCallGuard(BENCHMARK_INFERENCE_LIMIT);
    client = new RouterOneMultimodalClient({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }, guard);
    adapter = new RealVisualSemanticProviderAdapter(client, model);
    await runSmoke(three, smoke3Manifests(), VISION_MULTI_3_TIMEOUT_MS, 'b2-5-3-image', 'smoke-3-image');
    const threeOk = pipelinePass({
      transport: three.transport,
      json: three.json,
      model: three.model,
      b2: three.b2,
    });
    if (shouldRunSixImage(threeOk)) {
      await runSmoke(six, smoke6Manifests(), VISION_MULTI_6_TIMEOUT_MS, 'b2-5-6-image', 'smoke-6-image');
    } else {
      six.stopReason = 'SKIPPED_AFTER_3_IMAGE_FAILURE';
    }
    const sixOk = pipelinePass({ transport: six.transport, json: six.json, model: six.model, b2: six.b2 });
    if (shouldRunOptionalText(sixOk, six.latencyMs, six.model === 'PASS') && six.latencyMs != null && six.latencyMs > 150_000) {
      textRun = 'NOT_RUN';
    } else {
      textRun = 'NOT_RUN';
    }
  }
} finally {
  if (tmpHold.dir) {
    await rm(tmpHold.dir, { recursive: true, force: true });
  }
}

const envAfter = envFingerprint();
const threeManifests = smoke3Manifests();
const sixManifests = smoke6Manifests();
const threeEval = three.result
  ? {
      identity: evaluateFrameIdentity(three.result, threeManifests.map((item) => item.frameId)),
      pr: evaluatePrecisionRecall(three.result, threeManifests),
      contamination: evaluateContamination(three.result, threeManifests),
      browser: evaluateBrowser(three.result, threeManifests),
      regions: evaluateRegions(three.result, threeManifests),
      text: evaluateText(three.result, threeManifests),
      leak: decisionLeakage(three.result),
    }
  : null;
const sixEval = six.result
  ? {
      identity: evaluateFrameIdentity(six.result, sixManifests.map((item) => item.frameId)),
      pr: evaluatePrecisionRecall(six.result, sixManifests),
      contamination: evaluateContamination(six.result, sixManifests),
      browser: evaluateBrowser(six.result, sixManifests),
      regions: evaluateRegions(six.result, sixManifests),
      text: evaluateText(six.result, sixManifests),
      leak: decisionLeakage(six.result),
    }
  : null;

const precision = sixEval?.pr.precision ?? threeEval?.pr.precision ?? null;
const recall = sixEval?.pr.recall ?? threeEval?.pr.recall ?? null;
const contaminationRate = sixEval?.contamination.rate ?? threeEval?.contamination.rate ?? null;
const medianIoU = sixEval?.regions.medianIoU ?? threeEval?.regions.medianIoU ?? null;
const browserFp = (threeEval?.browser.fp ?? 0) + (sixEval?.browser.fp ?? 0);
const schemaStable = three.model === 'PASS' && six.model === 'PASS';
const pipeline3 = pipelinePass({ transport: three.transport, json: three.json, model: three.model, b2: three.b2 });
const pipeline6 = pipelinePass({ transport: six.transport, json: six.json, model: six.model, b2: six.b2 });

let multiCapability: 'CONFIRMED_FOR_6_IMAGES' | 'CONFIRMED_FOR_3_IMAGES' | 'PARTIAL' | 'FAIL' = 'FAIL';
if (pipeline6 && pipeline3) multiCapability = 'CONFIRMED_FOR_6_IMAGES';
else if (pipeline3) multiCapability = 'CONFIRMED_FOR_3_IMAGES';
else if (three.transport === 'PASS') multiCapability = 'PARTIAL';

const structuredMulti =
  schemaStable && pipeline6 ? 'CONFIRMED_FOR_6_IMAGES' : pipeline3 && three.model === 'PASS' ? 'CONFIRMED_FOR_3_IMAGES' : pipeline3 ? 'PARTIAL' : 'FAIL';

let semanticStatus: 'PASS' | 'PASS_WITH_LIMITATIONS' | 'NEEDS_CALIBRATION' | 'FAIL' = 'FAIL';
if (pipeline3 && pipeline6 && threeEval && sixEval) {
  const calibrated =
    (precision ?? 0) >= 0.8 &&
    (recall ?? 0) >= 0.7 &&
    browserFp === 0 &&
    (contaminationRate ?? 1) <= 0.1 &&
    (medianIoU ?? 0) >= 0.3;
  semanticStatus = calibrated ? 'PASS' : 'NEEDS_CALIBRATION';
}

let gate: 'PASS' | 'PASS_WITH_LIMITATIONS' | 'FAIL' = 'FAIL';
if (
  pipeline3 &&
  pipeline6 &&
  three.model === 'PASS' &&
  six.model === 'PASS' &&
  three.b2 === 'PASS' &&
  six.b2 === 'PASS' &&
  threeEval?.identity.status === 'PASS' &&
  sixEval?.identity.status === 'PASS' &&
  browserFp === 0 &&
  threeEval.leak === 'NONE' &&
  sixEval.leak === 'NONE' &&
  (contaminationRate ?? 1) <= 0.1
) {
  gate = semanticStatus === 'PASS' ? 'PASS' : 'PASS_WITH_LIMITATIONS';
}

const totalCalls = (guard?.calls ?? 0);
writeJson('benchmark-config.json', {
  version: SYNTHETIC_BENCHMARK_VERSION,
  model,
  modelSource,
  maxInferenceCalls: BENCHMARK_INFERENCE_LIMIT,
  timeouts: { three: VISION_MULTI_3_TIMEOUT_MS, six: VISION_MULTI_6_TIMEOUT_MS },
  maxObservationsPerFrame: 10,
  responseFormat: 'json_object',
});
writeJson('fixture-manifest.json', SYNTHETIC_FRAME_MANIFEST);
writeJson('fixture-ground-truth.json', { version: SYNTHETIC_BENCHMARK_VERSION, frames: SYNTHETIC_FRAME_MANIFEST });
writeJson('multi-frame-contract.json', { interleaved: 'TEXT + FRAME_ID + IMAGE', maxImages: 6 });
writeJson('frame-identity-contract.json', { required: 'observation.frameId', adapterGuess: false });
writeJson('benchmark-summary.json', { three, six, gate, semanticStatus, multiCapability, structuredMulti, totalCalls });
writeJson('precision-recall.json', { precision, recall, three: threeEval?.pr ?? null, six: sixEval?.pr ?? null });
writeJson('cross-frame-contamination.json', { rate: contaminationRate, three: threeEval?.contamination ?? null, six: sixEval?.contamination ?? null });
writeJson('browser-benchmark.json', { fp: browserFp, tp: 'NOT_EVALUATED_LIVE', three: threeEval?.browser ?? null, six: sixEval?.browser ?? null });
writeJson('text-benchmark.json', { three: threeEval?.text ?? null, six: sixEval?.text ?? null });
writeJson('region-grounding-benchmark.json', { three: threeEval?.regions ?? null, six: sixEval?.regions ?? null, medianIoU });
writeJson('latency-benchmark.json', {
  singleImageBaselineMs: 49812,
  threeMs: three.latencyMs,
  sixMs: six.latencyMs,
  threeAssessment: three.latencyMs != null ? assessLatency(three.latencyMs) : 'NOT_EVALUATED',
  sixAssessment: six.latencyMs != null ? assessLatency(six.latencyMs) : 'NOT_EVALUATED',
});
writeJson('runtime-capability-update.json', {
  multiImageRuntime: multiCapability,
  structuredJsonObjectMultiImage: structuredMulti,
  jsonSchema: 'UNVALIDATED',
  primaryCandidate: 'KEEP',
});
writeJson('provider-call-audit.json', {
  regressionVisionCalls: 0,
  threeImageCalls: three.calls,
  sixImageCalls: six.calls,
  textEvidenceCalls: 0,
  totalThisStep: totalCalls,
  maxAllowed: 3,
});
writeJson('content01-guard-audit.json', { content01Sent: 'NO', assetId: ASSET_ID });
writeJson('production-wiring-audit.json', {
  analyzeVideoFramesSmokeAndTestsOnly: true,
  worker: false,
  director: false,
  videoGeneration: false,
});
writeJson('env-mutation-audit.json', { before: envBefore, after: envAfter, modified: JSON.stringify(envBefore) !== JSON.stringify(envAfter) });
writeJson('manual-config-check.json', { visualSemanticModel: modelSource, smokeModel: model, existingCredential: credentialOk ? 'REUSED' : 'UNAVAILABLE' });

function scanSecrets() {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      const text = readFileSync(full, 'utf8');
      if (/Authorization\s*:/i.test(text) || /Bearer\s+[A-Za-z0-9._\-]+/.test(text) || /data:image\//i.test(text) || /base64,/i.test(text) || /MODEL_API_KEY\s*=/.test(text)) {
        hits.push(full.replace(evidenceRoot, ''));
      }
    }
  };
  if (existsSync(evidenceRoot)) walk(evidenceRoot);
  return hits;
}

const secretHits = scanSecrets();
writeJson('secret-audit.json', { secretsExposed: secretHits.length > 0, hits: secretHits });

process.stdout.write(
  `${JSON.stringify({
    gate,
    semanticStatus,
    multiCapability,
    three: { transport: three.transport, json: three.json, model: three.model, b2: three.b2, normalize: three.normalize, calls: three.calls, stopReason: three.stopReason, latencyMs: three.latencyMs },
    six: { transport: six.transport, json: six.json, model: six.model, b2: six.b2, normalize: six.normalize, calls: six.calls, stopReason: six.stopReason, latencyMs: six.latencyMs },
    textRun,
    totalCalls,
    precision,
    recall,
    contaminationRate,
    medianIoU,
    browserFp,
    modelSource,
  })}\n`,
);

if (gate === 'FAIL' || totalCalls > 3) {
  process.exitCode = 1;
}
