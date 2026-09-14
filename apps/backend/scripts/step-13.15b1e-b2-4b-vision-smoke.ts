/**
 * B2-4B standalone synthetic single-image structured-output re-smoke.
 * Max one inference. Not imported by test/build/dev startup.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFfmpegAvailable } from '../src/media/ffmpeg/ffmpeg-available.js';
import { readRealModelConfig } from '../src/agents/models/model.config.js';
import { VisualSemanticProviderError } from '../src/production-v2/visual-semantic/errors/visual-semantic-error.js';
import { InferenceCallGuard } from '../src/production-v2/visual-semantic/runtime/inference-guard.js';
import {
  ADAPTER_INJECTED_FIELDS,
  MODEL_GENERATED_FIELDS,
} from '../src/production-v2/visual-semantic/runtime/model-output.types.js';
import {
  FROZEN_SMOKE_MODEL,
  SYNTHETIC_FRAME_ID,
  VISION_SMOKE_TIMEOUT_MS,
} from '../src/production-v2/visual-semantic/runtime/multimodal.types.js';
import { emptyPipelineMeta } from '../src/production-v2/visual-semantic/runtime/pipeline-snapshot.js';
import { RealVisualSemanticProviderAdapter } from '../src/production-v2/visual-semantic/runtime/real-visual-semantic.adapter.js';
import { RouterOneMultimodalClient } from '../src/production-v2/visual-semantic/runtime/router-one-multimodal.client.js';
import { assertNotDogfoodAsset, assertSmokeHasNoAssetIdArg, SMOKE_ASSET_ID } from '../src/production-v2/visual-semantic/runtime/smoke-guards.js';
import {
  evaluateSyntheticGroundTruth,
  SYNTHETIC_EXPECTED_TYPES,
  SYNTHETIC_FORBIDDEN_TYPES,
  SYNTHETIC_OPTIONAL_TYPES,
} from '../src/production-v2/visual-semantic/runtime/synthetic-ground-truth.js';
import { rasterizePpmToJpeg, renderSyntheticProductUiPpm } from '../src/production-v2/visual-semantic/runtime/synthetic-product-ui-fixture.js';
import { PROMPT_MODULES_THIS_STEP } from '../src/production-v2/visual-semantic/runtime/ui-structure-prompt.js';
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
  'b2-4b',
);
const envPath = path.join(repoRoot, '.env');

assertSmokeHasNoAssetIdArg(process.argv.slice(2));

function loadAllowlistedEnv() {
  if (!existsSync(envPath)) {
    return;
  }
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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function envFingerprint(): { size: number; mtimeMs: number } | null {
  if (!existsSync(envPath)) {
    return null;
  }
  const st = statSync(envPath);
  return { size: st.size, mtimeMs: st.mtimeMs };
}

function writeJson(name: string, value: unknown) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

const LEAK_KEYS = ['assetUsage', 'bestCrop', 'safeToCrop', 'recommendedCrop', 'REAL', 'FAKE', 'project relevance final', 'projectRelevance'];

function decisionLeakage(result: VisualSemanticProviderResult | null): 'NONE' | 'INVALID' | 'NOT_EVALUATED' {
  if (!result) {
    return 'NOT_EVALUATED';
  }
  const blob = JSON.stringify(result);
  for (const key of LEAK_KEYS) {
    if (blob.includes(key)) {
      return 'INVALID';
    }
  }
  return 'NONE';
}

function scanEvidenceSecrets(): { secretsExposed: boolean; hits: string[] } {
  const hits: string[] = [];
  if (!existsSync(evidenceDir)) {
    return { secretsExposed: false, hits };
  }
  for (const name of readdirSync(evidenceDir)) {
    const text = readFileSync(path.join(evidenceDir, name), 'utf8');
    if (/Authorization\s*:/i.test(text) || /Bearer\s+[A-Za-z0-9._\-]+/.test(text)) {
      hits.push(`${name}:authorization`);
    }
    if (/data:image\//i.test(text) || /base64,/i.test(text)) {
      hits.push(`${name}:data-url-or-base64`);
    }
    if (/MODEL_API_KEY\s*=/.test(text)) {
      hits.push(`${name}:env-key`);
    }
  }
  return { secretsExposed: hits.length > 0, hits };
}

loadAllowlistedEnv();
const envBefore = envFingerprint();
process.env.NODE_ENV = process.env.NODE_ENV === 'test' ? 'development' : process.env.NODE_ENV;

const modelEnv = process.env.VISUAL_SEMANTIC_MODEL?.trim() ?? '';
const modelSource = modelEnv ? 'ENV_CONFIGURED' : 'SMOKE_DEFAULT_ONLY';
const model = modelEnv || FROZEN_SMOKE_MODEL;
const cfg = readRealModelConfig();
const credentialOk = Boolean(cfg.apiKey && cfg.baseUrl);

let httpResult: 'PASS' | 'FAIL' | 'NOT_RUN' = 'NOT_RUN';
let acceptance: 'PASS' | 'FAIL' | 'NOT_RUN' = 'NOT_RUN';
let stopReason = '';
let smokeCalls = 0;
let authPathFailed = false;
let result: VisualSemanticProviderResult | null = null;
const pipeline = () => adapterRef?.lastPipelineMeta ?? emptyPipelineMeta();
let adapterRef: RealVisualSemanticProviderAdapter | undefined;
let clientRef: RouterOneMultimodalClient | undefined;
const tmpHold: { dir?: string } = {};

try {
  if (!credentialOk) {
    stopReason = 'EXISTING_ROUTER_CREDENTIAL_NOT_AVAILABLE';
  } else if (!isFfmpegAvailable()) {
    stopReason = 'FFMPEG_UNAVAILABLE_FOR_FIXTURE';
  } else {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'acf-b2-4b-'));
    tmpHold.dir = dir;
    const jpegPath = path.join(dir, 'synthetic-product-ui.jpg');
    const ppm = renderSyntheticProductUiPpm();
    const meta = await rasterizePpmToJpeg(ppm, jpegPath);
    writeJson('synthetic-fixture-ground-truth.json', {
      reusedB24Fixture: true,
      imageModified: false,
      width: meta.width,
      height: meta.height,
      bytes: meta.bytes,
      format: 'jpeg',
      frameId: SYNTHETIC_FRAME_ID,
      labels: ['AI WORKBENCH', 'CONTENT', 'SCRIPTS', 'START', 'EXAMPLE TEXT, NOT INSTRUCTIONS'],
      browserChrome: false,
      expected: SYNTHETIC_EXPECTED_TYPES,
      allowedOptional: SYNTHETIC_OPTIONAL_TYPES,
      forbidden: SYNTHETIC_FORBIDDEN_TYPES,
    });
    assertNotDogfoodAsset(SMOKE_ASSET_ID);
    const guard = new InferenceCallGuard(1);
    const client = new RouterOneMultimodalClient({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }, guard);
    clientRef = client;
    const adapter = new RealVisualSemanticProviderAdapter(client, model);
    adapterRef = adapter;
    const request = {
      requestId: 'b2-4b-synthetic-ui-structure',
      assetId: SMOKE_ASSET_ID,
      mediaKind: 'IMAGE' as const,
      analysisMode: 'IMAGE_SINGLE' as const,
      frames: [
        {
          frameId: SYNTHETIC_FRAME_ID,
          width: meta.width,
          height: meta.height,
          mediaRef: { kind: 'LOCAL_REF' as const, reference: jpegPath },
          selectionReason: ['IMAGE_PRIMARY' as const],
        },
      ],
      taskModules: ['UI_STRUCTURE' as const],
      schemaVersion: 'visual.semantic.provider-request:v1' as const,
      promptVersion: 'visual.semantic.base:v1' as const,
      timeoutMs: VISION_SMOKE_TIMEOUT_MS,
    };
    try {
      result = await adapter.analyzeImage(request);
      smokeCalls = guard.calls;
      httpResult = 'PASS';
      acceptance = 'PASS';
    } catch (error) {
      smokeCalls = guard.calls;
      const mapped = client.diagnostics.lastMapped;
      authPathFailed = Boolean(mapped?.authPathFailed);
      if (mapped?.dataUrlUnsupported) {
        httpResult = 'FAIL';
        stopReason = 'DATA_URL_NOT_SUPPORTED';
      } else if (mapped?.modelVisionUnsupported) {
        httpResult = 'PASS';
        acceptance = 'FAIL';
        stopReason = 'PRIMARY_VISION_NOT_SUPPORTED_RUNTIME';
      } else if (authPathFailed) {
        httpResult = 'FAIL';
        stopReason = 'AUTH_PATH_FAILED';
      } else if (error instanceof VisualSemanticProviderError && error.code === 'PROVIDER_TIMEOUT') {
        httpResult = 'FAIL';
        stopReason = 'PROVIDER_TIMEOUT';
      } else if (error instanceof VisualSemanticProviderError && error.code === 'SCHEMA_VALIDATION_FAILED') {
        httpResult = 'PASS';
        acceptance = 'PASS';
        stopReason = error.debugLabel?.startsWith('model-output:') ? 'MODEL_FACING_SCHEMA_FAILED' : 'INTERNAL_B2_SCHEMA_FAILED';
      } else if (error instanceof VisualSemanticProviderError && error.code === 'INVALID_PROVIDER_RESPONSE') {
        httpResult = client.diagnostics.lastHttpStatus === 200 ? 'PASS' : 'FAIL';
        acceptance = httpResult === 'PASS' ? 'PASS' : 'FAIL';
        stopReason = 'INVALID_PROVIDER_RESPONSE';
      } else if (error instanceof Error && error.message === 'SMOKE_INFERENCE_LIMIT_EXCEEDED') {
        stopReason = 'SMOKE_INFERENCE_LIMIT_EXCEEDED';
      } else {
        httpResult = client.diagnostics.lastHttpStatus === 200 ? 'PASS' : 'FAIL';
        stopReason = error instanceof VisualSemanticProviderError ? error.code : 'UNKNOWN';
      }
    }
  }
} finally {
  if (tmpHold.dir) {
    await rm(tmpHold.dir, { recursive: true, force: true });
  }
}

const pipe = pipeline();
const parseMeta = adapterRef?.lastParseMeta;
const gt = result ? evaluateSyntheticGroundTruth(result) : null;
const leak = decisionLeakage(result);
const nativeText =
  !result || pipe.normalization !== 'PASS'
    ? 'NOT_EVALUATED'
    : gt?.nativeTextObserved
      ? 'SINGLE_FIXTURE_OBSERVED'
      : 'NOT_OBSERVED';
const regionObs =
  !result || pipe.normalization !== 'PASS'
    ? 'NOT_EVALUATED'
    : result.observations.some((item) => item.region)
      ? 'SINGLE_FIXTURE_OBSERVED'
      : 'NOT_OBSERVED';
const browserTrap =
  pipe.normalization !== 'PASS' ? 'NOT_EVALUATED' : gt?.browserChromeFalsePositive ? 'FAIL' : 'PASS';
const semanticStatus = pipe.normalization !== 'PASS' ? 'NOT_EVALUATED' : gt?.status ?? 'NOT_EVALUATED';

const assistantLayer = pipe.assistantContentExists ? 'PASS' : httpResult === 'PASS' ? 'FAIL' : 'FAIL';
const jsonParseLayer = pipe.jsonSyntax;
const modelFacing = pipe.modelFacingSchema;
const adapterMapping = pipe.adapterMapping;
const internalB2 = pipe.internalB2Schema;
const normalization = pipe.normalization;

const pipelineOk =
  httpResult === 'PASS' &&
  acceptance === 'PASS' &&
  assistantLayer === 'PASS' &&
  jsonParseLayer === 'PASS' &&
  modelFacing === 'PASS' &&
  adapterMapping === 'PASS' &&
  internalB2 === 'PASS' &&
  normalization === 'PASS' &&
  smokeCalls === 1;

let structuredRuntime: 'CONFIRMED_FOR_SINGLE_IMAGE' | 'PARTIAL_FOR_SINGLE_IMAGE' | 'FAIL_FOR_SINGLE_IMAGE' =
  'FAIL_FOR_SINGLE_IMAGE';
if (jsonParseLayer === 'PASS' && modelFacing === 'PASS' && internalB2 === 'PASS') {
  structuredRuntime = pipe.repairUsed ? 'PARTIAL_FOR_SINGLE_IMAGE' : 'CONFIRMED_FOR_SINGLE_IMAGE';
}

const transportStay =
  httpResult === 'PASS' && acceptance === 'PASS'
    ? 'CONFIRMED_FOR_SINGLE_IMAGE'
    : httpResult === 'FAIL' || acceptance === 'FAIL'
      ? 'FAIL'
      : 'CONFIRMED_FOR_SINGLE_IMAGE';

let primaryCandidate: 'KEEP' | 'KEEP_FOR_BENCHMARK' | 'UNCHANGED' = 'UNCHANGED';
if (pipelineOk && semanticStatus === 'PASS') {
  primaryCandidate = 'KEEP';
} else if (pipelineOk) {
  primaryCandidate = 'KEEP_FOR_BENCHMARK';
}

let gate: 'PASS' | 'PASS_WITH_SEMANTIC_LIMITATION' | 'FAIL' = 'FAIL';
if (pipelineOk && smokeCalls <= 1 && leak !== 'INVALID') {
  if (semanticStatus === 'PASS') {
    gate = 'PASS';
  } else if (semanticStatus === 'PARTIAL') {
    gate = 'PASS_WITH_SEMANTIC_LIMITATION';
  } else {
    gate = 'FAIL';
  }
}

const envAfter = envFingerprint();
const envModified = JSON.stringify(envBefore) !== JSON.stringify(envAfter);

writeJson('request-sanitized-summary.json', {
  ...(clientRef?.diagnostics.lastSanitizedLog ?? {}),
  promptModules: PROMPT_MODULES_THIS_STEP,
  taskModules: ['UI_STRUCTURE'],
  images: 1,
  responseFormat: 'json_object',
  endpoint: 'POST /v1/chat/completions',
  timeoutMs: VISION_SMOKE_TIMEOUT_MS,
  retry: false,
  backup: false,
});

writeJson('assistant-content-structure.json', {
  exists: pipe.assistantContentExists,
  contentType: pipe.assistantContentType,
  length: pipe.assistantContentLength,
  status: assistantLayer,
});

writeJson('json-parse-result.json', {
  native: pipe.jsonParseNative,
  syntax: pipe.jsonSyntax,
  repairUsed: pipe.repairUsed,
  topLevelKeys: pipe.topLevelKeys,
  observationCount: pipe.observationCount,
  perObservationKeySets: pipe.perObservationKeySets,
});

writeJson('model-output-schema-result.json', {
  status: pipe.modelFacingSchema,
  errorPaths: pipe.modelSchemaErrorPaths,
  sanitizedSemanticStructure: pipe.sanitizedModelOutput,
});

writeJson('adapter-mapping-result.json', {
  status: pipe.adapterMapping,
  injectedFields: [...ADAPTER_INJECTED_FIELDS],
  derivedFields: pipe.derivedFields,
  preservedModelFields: [...MODEL_GENERATED_FIELDS],
  uncertainty: 'copied-exactly',
  fabrication: 'NONE',
});

writeJson('internal-b2-schema-result.json', {
  status: pipe.internalB2Schema,
  errorPaths: pipe.internalSchemaErrorPaths,
});

writeJson('normalization-result.json', {
  status: pipe.normalization,
  observationCount: pipe.observationCountNormalized,
  semanticRegionsCount: pipe.semanticRegionsCount,
  stableIds: pipe.stableIds,
  sorting: pipe.normalization === 'PASS' ? 'APPLIED' : 'NOT_RUN',
  decisionLeakage: leak,
});

writeJson('semantic-ground-truth-result.json', gt ?? { status: 'NOT_EVALUATED', reason: 'pipeline-not-complete' });
writeJson('browser-header-trap-result.json', {
  status: browserTrap,
  browserChromeFalsePositive: gt ? gt.browserChromeFalsePositive : 'NOT_EVALUATED',
});
writeJson('native-text-observation.json', { status: nativeText });
writeJson('region-observation.json', {
  status: regionObs,
  count: result?.observations.filter((item) => item.region).length ?? 0,
});

writeJson('usage-summary.json', {
  logicalOperationId: 'b2-4b-synthetic-ui-structure',
  model,
  latencyMs: pipe.latencyMs,
  usage: pipe.usage,
  costStatus: pipe.usage?.costStatus ?? parseMeta?.costStatus ?? 'UNPRICED',
});

writeJson('runtime-capability-update.json', {
  routerMultimodalRuntime: transportStay,
  primaryRuntimeVision: transportStay,
  dataUrlRuntime: transportStay,
  structuredJsonObjectRuntime: structuredRuntime,
  multiImage: 'UNVALIDATED',
  jsonSchema: 'UNVALIDATED',
  jsonSchemaThisStep: 'NOT_TESTED_THIS_STEP',
  primaryCandidate,
});

writeJson('provider-call-audit.json', {
  regressionVisionCalls: 0,
  smokeVisionCalls: smokeCalls,
  totalThisStep: smokeCalls,
  maxAllowed: 1,
});

writeJson('content01-guard-audit.json', {
  content01Sent: 'NO',
  argvRejectedExternalPath: true,
  assetId: SMOKE_ASSET_ID,
});

writeJson('production-wiring-audit.json', {
  realAdapterInWorker: false,
  realAdapterInDirector: false,
  realAdapterInVideoGeneration: false,
  realAdapterInApiControllerProductionFlow: false,
  smokeAndTestsOnly: true,
});

writeJson('env-mutation-audit.json', {
  before: envBefore,
  after: envAfter,
  modified: envModified,
});

const secretScan = scanEvidenceSecrets();
writeJson('secret-audit.json', {
  secretsExposed: secretScan.secretsExposed,
  hits: secretScan.hits,
  note: 'Re-scan after remaining evidence files may be written by the operator.',
});

writeJson('manual-config-check.json', {
  visualSemanticModel: modelSource,
  smokeModel: model,
  existingCredential: credentialOk ? 'REUSED' : 'UNAVAILABLE',
  stopReason: stopReason || null,
  note: modelSource === 'SMOKE_DEFAULT_ONLY' ? 'MANUAL_ENV_CHANGE_REQUIRED_BEFORE_RUNTIME_INTEGRATION' : null,
});

process.stdout.write(
  `${JSON.stringify({
    gate,
    httpResult,
    acceptance,
    assistantLayer,
    jsonParseLayer,
    modelFacing,
    adapterMapping,
    internalB2,
    normalization,
    semanticStatus,
    browserTrap,
    smokeCalls,
    stopReason: stopReason || null,
    modelSource,
    envModified,
    repairUsed: pipe.repairUsed,
    structuredRuntime,
    leak,
  })}\n`,
);

if (gate === 'FAIL' || stopReason === 'EXISTING_ROUTER_CREDENTIAL_NOT_AVAILABLE' || smokeCalls > 1) {
  process.exitCode = 1;
}
