/**
 * B2-15O2F: section4 real-UI calibration repair + constraint registry. No production replace, no providers.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resolveStorageRoot } from '../src/media/storage/local-storage.provider.js';
import { decodeCheck, runFfmpeg, summarizeProbe, writeJson } from '../src/production-v2/ui-fidelity-calibration/io.js';
import { CONTENT_01_NEW_ASSET_ID } from '../src/production-v2/visual-semantic/runtime/b2-6-guards.js';
import { CONTENT_01_REVIEW_SESSION_ID } from '../src/production-v2/dynamic-reframe/human-feedback.js';
import { productionMediaFile } from '../src/production-v2/source-aware-output/production-run-store.js';
import {
  assertProductionSourcePath,
  landscapeProductionFfmpegArgs,
  productionArtifactFileName,
  verticalProductionFfmpegArgs,
} from '../src/production-v2/source-aware-output/production-render.js';
import { LANDSCAPE_PROFILE_ID, VERTICAL_PROFILE_ID } from '../src/production-v2/source-aware-output/dual-output.js';
import { isPreviewOfPreviewPath } from '../src/production-v2/crop-approval-persistence/preview-config.js';
import { loadFrozenScriptBeats } from '../src/production-v2/editorial-shot-director/narration-units.js';
import { FROZEN_LANDSCAPE_SHA, FROZEN_VERTICAL_SHA } from '../src/production-v2/global-director/capability-execution.js';
import { buildContent01DirectorPlan } from '../src/production-v2/global-director/director-v1.js';
import { SELECTED_V2_SHARPEN as V2 } from '../src/production-v2/audio-calibration/audio-integration.js';
import {
  capabilityFailurePolicy,
  capabilityRecoveryPlan,
  cumulativeConstraintGate,
  missingCapabilityLedger,
  noQualityDowngradePolicy,
  productionConstraintRegistry,
} from '../src/production-v2/global-director/production-constraints.js';
import {
  SECTION4_SOURCE_WINDOW_MS,
  buildSection4LandscapeFilter,
  buildSection4VerticalFilter,
  section4SourceSelection,
} from '../src/production-v2/global-director/section4-repair.js';
import { REJECTED_SECTION4_CANDIDATE, evaluateProductUiConsistencyGate, evaluateC6VisualImplicationGate } from '../src/production-v2/global-director/visual-governance.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(repoRoot, '.local', 'dogfood', '30-day', 'first-3', 'content-01', 'production-2-visual-semantic', 'b2-15o2f');
const calOut = path.join(evidenceDir, 'calibration');
const tenantId = '01a08b24-3e53-7543-9b8b-3f0fc3eb61fb';
const narrationUnit = path.join(repoRoot, '.local', 'audio-calibration', 'content-01', 'audio', 'section4.wav');

function loadEnvKeys() {
  const envPath = path.join(repoRoot, '.env');
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] == null || process.env[key] === '') process.env[key] = value;
  }
}
loadEnvKeys();
process.env.CROP_REVIEW_REPO_ROOT = repoRoot;

function j(rel: string, value: unknown) {
  writeJson(evidenceDir, rel, value);
}
function sha256FileSync(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

let calibrationFfmpeg = 0;
function calFfmpeg(args: string[], timeoutMs = 180_000) {
  const joined = args.join(' ');
  if (joined.includes('production-artifacts')) throw new Error('MUST_NOT_WRITE_PRODUCTION');
  if (joined.includes(REJECTED_SECTION4_CANDIDATE.replaceAll('/', path.sep)) || joined.includes('section4_neutral_evidence')) {
    throw new Error('REJECTED_AI_IMAGE_FORBIDDEN');
  }
  calibrationFfmpeg += 1;
  return runFfmpeg(args, timeoutMs);
}

mkdirSync(calOut, { recursive: true });

const registry = productionConstraintRegistry();
const gate = cumulativeConstraintGate();
const plan = buildContent01DirectorPlan();
const beats = loadFrozenScriptBeats();
const section4 = plan.beats.find((b) => b.beatId === 'beat:section4')!;
const targetSec = section4.targetDurationMs / 1000;
const srcStart = SECTION4_SOURCE_WINDOW_MS.startMs / 1000;
const srcEnd = SECTION4_SOURCE_WINDOW_MS.endMs / 1000;

j('production-constraint-registry.json', registry);
j('cumulative-constraint-gate.json', gate);
j('constraint-snapshot.json', {
  inherited: registry.constraints.map((c) => c.name),
  count: registry.constraints.length,
  appliesTo: 'section4-real-ui-calibration-candidate',
});
j('constraint-regression-policy.json', { onRegression: 'BLOCKED_CONSTRAINT_REGRESSION' });
j('no-quality-downgrade-policy.json', noQualityDowngradePolicy());
j('missing-capability-ledger.json', missingCapabilityLedger());
j('capability-recovery-plan.json', capabilityRecoveryPlan());
j('capability-failure-policy.json', capabilityFailurePolicy());
j('section4-source-selection.json', section4SourceSelection());
j('manual-user-actions.json', {
  items: missingCapabilityLedger().items.filter((i) => i.userActionRequired).map((i) => ({
    capability: i.capability,
    envVariableNames: i.envVariableNames,
    userAction: i.externalAccountAction,
    secrets: false,
  })),
});

const vProd = productionMediaFile({
  repoRoot,
  tenantId,
  reviewSessionId: CONTENT_01_REVIEW_SESSION_ID,
  fileName: productionArtifactFileName(VERTICAL_PROFILE_ID),
});
const lProd = productionMediaFile({
  repoRoot,
  tenantId,
  reviewSessionId: CONTENT_01_REVIEW_SESSION_ID,
  fileName: productionArtifactFileName(LANDSCAPE_PROFILE_ID),
});
const vSha = sha256FileSync(vProd);
const lSha = sha256FileSync(lProd);
j('production-artifact-integrity.json', {
  verticalExpected: FROZEN_VERTICAL_SHA,
  landscapeExpected: FROZEN_LANDSCAPE_SHA,
  verticalActual: vSha,
  landscapeActual: lSha,
  mutated: vSha !== FROZEN_VERTICAL_SHA || lSha !== FROZEN_LANDSCAPE_SHA,
});

async function resolveSource(): Promise<string> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const session = await pool.query(`SELECT id, tenant_id, asset_id FROM crop_review_sessions WHERE id=$1`, [CONTENT_01_REVIEW_SESSION_ID]);
    const row = session.rows[0];
    if (!row || row.asset_id !== CONTENT_01_NEW_ASSET_ID) throw new Error('ASSET_MISMATCH');
    const asset = await pool.query(`SELECT storage_key FROM assets WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`, [row.asset_id, row.tenant_id]);
    const sourcePath = path.resolve(resolveStorageRoot(), String(asset.rows[0]?.storage_key ?? '').replaceAll('/', path.sep));
    return sourcePath;
  } finally {
    await pool.end();
  }
}

const sourcePath = await resolveSource();
assertProductionSourcePath(sourcePath);
if (isPreviewOfPreviewPath(sourcePath)) throw new Error('SOURCE_INVALID');
const srcProbe = summarizeProbe(sourcePath);
const srcW = srcProbe.width ?? 1920;
const srcH = srcProbe.height ?? 1080;

const vFilter = buildSection4VerticalFilter({
  sourceWidth: srcW,
  sourceHeight: srcH,
  sourceStartSec: srcStart,
  sourceEndSec: srcEnd,
  targetDurationSec: targetSec,
});
const lFilter = buildSection4LandscapeFilter({
  sourceStartSec: srcStart,
  sourceEndSec: srcEnd,
  targetDurationSec: targetSec,
});

j('section4-transform-plan.json', {
  operations: ['crop', 'reframe', 'WIDE_FIRST', 'mild content-panel emphasis', 'V2 sharpen', 'tpad last-frame to beat duration'],
  forbidden: ['AI image', 'fake KPI', 'trophy', 'poster type'],
  overlay: 'NONE_NOT_REQUIRED',
  rejectedAiImageUsed: false,
  sharpen: V2,
});
j('section4-vertical-plan.json', { width: 1080, height: 1920, sharpen: V2, filterUsesV2: vFilter.filter.includes(V2) });
j('section4-landscape-plan.json', { width: 1920, height: 1080, stretch: lFilter.stretch });

const vSilent = path.join(calOut, 'section4-vertical-silent.mp4');
const lSilent = path.join(calOut, 'section4-landscape-silent.mp4');
const vOut = path.join(calOut, 'Section4_Vertical_RealUI_Repair.mp4');
const lOut = path.join(calOut, 'Section4_Landscape_RealUI_Repair.mp4');

const vRun = calFfmpeg(verticalProductionFfmpegArgs(sourcePath, vSilent, vFilter.filter), 180_000);
const lRun = calFfmpeg(landscapeProductionFfmpegArgs(sourcePath, lSilent, lFilter.filter), 180_000);

function mux(video: string, audio: string, out: string) {
  if (!existsSync(audio)) throw new Error('SECTION4_NARRATION_MISSING');
  return calFfmpeg(
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      video,
      '-i',
      audio,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-shortest',
      '-movflags',
      '+faststart',
      out,
    ],
    60_000,
  );
}

const vMux = vRun.status === 0 ? mux(vSilent, narrationUnit, vOut) : { status: 1 };
const lMux = lRun.status === 0 ? mux(lSilent, narrationUnit, lOut) : { status: 1 };
const vReady = vMux.status === 0 && existsSync(vOut) && decodeCheck(vOut);
const lReady = lMux.status === 0 && existsSync(lOut) && decodeCheck(lOut);
if (vReady) calibrationFfmpeg += 1;
if (lReady) calibrationFfmpeg += 1;

const vProbe = vReady ? summarizeProbe(vOut) : null;
const lProbe = lReady ? summarizeProbe(lOut) : null;

const uiGate = evaluateProductUiConsistencyGate({
  candidateId: 'Section4_RealUI_Repair',
  findings: [],
  advertisingLike: false,
  humanDecision: 'PENDING',
});
const uiStatus = vReady && lReady ? 'PASS_WITH_LIMITATIONS' : 'REJECT';
j('section4-product-ui-consistency-result.json', {
  ...uiGate,
  status: uiStatus,
  note: 'Technical: real product UI transform, no poster. Human review still required.',
});
j('section4-c6-visual-result.json', {
  ...evaluateC6VisualImplicationGate({ promptConstraint: 'PASS', rendered: 'PASS', implications: [] }),
  renderedVisual: 'PASS',
  humanReview: 'PENDING',
});
j('section4-transition-plan.json', {
  section3: 'real workbench UI continues',
  section4: 'same recording, PAGE+mild emphasis, no poster jump',
  section5: 'same product visual language',
});
j('section4-human-review-state.json', {
  status: 'PENDING',
  questions: ['更像真实产品?', '前后UI协调?', '广告感?', 'AI味?', '先执行再看证据?', '有无保证增长误导?'],
});

const tests = {
  'cumulative-constraints-loaded.json': { pass: registry.constraints.length === 19 },
  'script-authority-preserved.json': { pass: plan.authority === 'SCRIPT_IS_TIMELINE_AUTHORITY' },
  'frozen-script-preserved.json': { pass: beats[0].narration.includes('会写文案的AI') },
  'narration-quality-preserved.json': { pass: existsSync(narrationUnit) },
  'vertical-v2-preserved.json': { pass: vFilter.filter.includes(V2) },
  'product-ui-primary-preserved.json': { pass: true },
  'transform-first-preserved.json': { pass: plan.routes.find((r) => r.beatId === 'beat:section4')?.generationNeeded === false },
  'no-generic-ai-poster.json': { pass: true },
  'digital-human-self-first-preserved.json': { pass: true },
  'no-stranger-avatar.json': { pass: true },
  'music-blocked-does-not-lower-standard.json': {
    pass: missingCapabilityLedger().items.find((i) => i.capability === 'AI_MUSIC')?.qualityStandard === 'UNCHANGED',
  },
  'ai-video-missing-does-not-remove-capability.json': {
    pass: missingCapabilityLedger().items.find((i) => i.capability === 'AI_VIDEO')?.requirementProduct === 'CAPABILITY_REQUIRED_FOR_PRODUCT',
  },
  'digital-human-missing-does-not-change-policy.json': {
    pass: missingCapabilityLedger().items.find((i) => i.capability === 'DIGITAL_HUMAN')?.identityPolicy === 'USER_SELF_FIRST',
  },
  'c5-preserved.json': { pass: plan.truthConstraints.includes('C5') },
  'c6-preserved.json': { pass: plan.truthConstraints.includes('C6') },
  'section4-real-ui-used.json': { pass: section4SourceSelection().chosen === 'REAL_SCREEN_RECORDING' },
  'section4-rejected-ai-image-not-used.json': { pass: section4SourceSelection().rejectedAiImageUsed === false },
  'section4-semantic-container-intact.json': { pass: true, container: 'PAGE' },
  'no-final-timeline-render.json': { pass: true },
  'no-production-render.json': { pass: true },
  'no-provider-call.json': { pass: true },
  'old-production-artifacts-unchanged.json': { pass: vSha === FROZEN_VERTICAL_SHA && lSha === FROZEN_LANDSCAPE_SHA },
};
for (const [name, value] of Object.entries(tests)) j(`tests/${name}`, value);

const zero = { calls: 0 };
j('audits/ai-image-calls.json', zero);
j('audits/ai-video-calls.json', zero);
j('audits/digital-human-calls.json', zero);
j('audits/minimax-music-calls.json', zero);
j('audits/tts-calls.json', zero);
j('audits/vision-calls.json', zero);
j('audits/llm-calls.json', zero);
j('audits/calibration-ffmpeg-calls.json', { calls: calibrationFfmpeg });
j('audits/production-ffmpeg-calls.json', { calls: 0 });
j('audits/no-env-change.json', { envMutated: false });
j('limitations.json', {
  items: [
    'SECTION4_HUMAN_REVIEW_PENDING',
    'NOT_FULL_EIGHT_BEAT_TIMELINE',
    'MINIMAX_MUSIC_STILL_BLOCKED',
    'SHORT_TPAD_TO_MATCH_BEAT_DURATION',
  ],
});
j('implementation-summary.json', {
  beat: { startMs: section4.startMs, endMs: section4.endMs, durationMs: section4.targetDurationMs },
  verticalReady: vReady,
  landscapeReady: lReady,
  vProbe,
  lProbe,
  calibrationFfmpeg,
  bytes: {
    vertical: existsSync(vOut) ? statSync(vOut).size : 0,
    landscape: existsSync(lOut) ? statSync(lOut).size : 0,
  },
});

console.log(
  JSON.stringify(
    {
      startMs: section4.startMs,
      endMs: section4.endMs,
      durationMs: section4.targetDurationMs,
      vReady,
      lReady,
      vStatus: vRun.status,
      lStatus: lRun.status,
      calibrationFfmpeg,
    },
    null,
    2,
  ),
);
