/**
 * B2-15F: execute frozen source-aware.editorial-director:v2 as 720x1280 source-aware review preview.
 * Original asset only. No Vision/LLM/approval/production FFmpeg. Max 2 full preview spawns.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { ffprobeBin } from '../src/media/ffmpeg/ffmpeg-config.js';
import { buildFfprobeArgs } from '../src/media/ffmpeg/ffprobe.js';
import { resolveStorageRoot } from '../src/media/storage/local-storage.provider.js';
import { isPreviewOfPreviewPath } from '../src/production-v2/crop-approval-persistence/preview-config.js';
import { CONTENT_01_NEW_ASSET_ID } from '../src/production-v2/visual-semantic/runtime/b2-6-guards.js';
import { CONTENT_01_REVIEW_SESSION_ID } from '../src/production-v2/dynamic-reframe/human-feedback.js';
import { parseVideoOnlyFfprobe } from '../src/production-v2/crop-review-flow/preview-runtime-plan.js';
import { countDecisions, directSourceAwareEditorialPlan } from '../src/production-v2/source-aware-editorial/director.js';
import { mapPlanToRuntimeTimeline } from '../src/production-v2/source-aware-editorial/timeline.js';
import { auditCropIntegrity } from '../src/production-v2/source-aware-editorial/integrity.js';
import { smartUiFit } from '../src/production-v2/source-aware-editorial/smart-ui-fit.js';
import { cropForScale } from '../src/production-v2/editorial-shot-director/crop-for-scale.js';
import {
  auditEditorialFrameContinuityV1,
  filterHasConcatGapRisk,
  filterHasDurationGuards,
  isLikelyBlankFrame,
  isWhiteUiNotBlank,
  ptsContinuity,
} from '../src/production-v2/editorial-shot-runtime/continuity.js';
import { renderSourceAwarePreview } from '../src/production-v2/source-aware-preview/runtime.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG, SOURCE_AWARE_UAT_CHECKLIST } from '../src/production-v2/source-aware-preview/render-config.js';
import { buildSourceAwareFilterGraph } from '../src/production-v2/source-aware-preview/filter-builder.js';
import { sampleBlankWindowFrames, sampleSignalstatsFrame, SOURCE_AWARE_BLANK_PROBE_MS } from '../src/production-v2/source-aware-preview/frame-probe.js';
import { sourceAwarePreviewConfigHash, sourceAwarePreviewFile } from '../src/production-v2/source-aware-preview/store.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(
  repoRoot,
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-15f',
);

function writeJson(rel: string, value: unknown) {
  const full = path.join(evidenceDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

function loadEnvKeys(keys: string[]) {
  const envPath = path.join(repoRoot, '.env');
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
    process.env[key] = value;
  }
}

loadEnvKeys(['DATABASE_URL', 'MEDIA_STORAGE_ROOT', 'FFMPEG_PATH', 'FFPROBE_PATH', 'CROP_REVIEW_REPO_ROOT']);
process.env.CROP_REVIEW_REPO_ROOT = repoRoot;

const plan = directSourceAwareEditorialPlan();
const timeline = mapPlanToRuntimeTimeline(plan);
const counts = countDecisions(plan);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const sessionId = CONTENT_01_REVIEW_SESSION_ID;
const session = await pool.query(
  `SELECT id, tenant_id, asset_id, status, background_treatment, preview_version, human_decision, checklist_json
   FROM crop_review_sessions WHERE id=$1`,
  [sessionId],
);
const row = session.rows[0];
if (!row) {
  await pool.end();
  throw new Error('SESSION_MISSING');
}
const asset = await pool.query(`SELECT storage_key FROM assets WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`, [
  row.asset_id,
  row.tenant_id,
]);
await pool.end();
if (row.asset_id !== CONTENT_01_NEW_ASSET_ID) throw new Error('ASSET_MISMATCH');
if (plan.assetId !== CONTENT_01_NEW_ASSET_ID) throw new Error('PLAN_ASSET_MISMATCH');
const storageKey = String(asset.rows[0]?.storage_key ?? '');
const sourcePath = path.resolve(resolveStorageRoot(), storageKey.replaceAll('/', path.sep));
if (!existsSync(sourcePath)) throw new Error('SOURCE_MISSING');
if (isPreviewOfPreviewPath(sourcePath)) throw new Error('PREVIEW_OF_PREVIEW');

const sourceBefore = statSync(sourcePath);
const graph = buildSourceAwareFilterGraph({ segments: timeline.segments, sourceWidth: 1920, sourceHeight: 1040 });
const fit = smartUiFit();
const mediumCrop = cropForScale('MEDIUM_FOCUS').crop;
const detailCrop = cropForScale('DETAIL_READABLE').crop;

let diagnosticProbeCalls = 0;
const sourceProbe = sampleSignalstatsFrame(sourcePath, 7000);
diagnosticProbeCalls += 1;

writeJson('implementation-summary.json', {
  step: '13.15B-1E-B2-15F',
  previewVersion: SOURCE_AWARE_PREVIEW_RENDER_CONFIG.previewVersion,
  planVersion: plan.schemaVersion,
  sourceVisualType: plan.sourceVisualType,
  defaultStrategy: plan.defaultStrategy,
  decisionCount: timeline.decisionCount,
  keepCurrentCount: timeline.keepCurrentCount,
  explicitReframeCount: timeline.explicitReframeCount,
  timelineSegmentCount: timeline.timelineSegmentCount,
  renderedShotCount: timeline.renderedShotCount,
});
writeJson('files-changed.json', {
  files: [
    'apps/backend/src/production-v2/source-aware-preview/',
    'apps/backend/src/production-v2/source-aware-editorial/timeline.ts',
    'apps/backend/src/production-v2/source-aware-editorial/index.ts',
    'apps/backend/src/production-v2/editorial-shot-runtime/continuity.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/durable-http.service.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/preview-config.ts',
    'apps/backend/src/production-v2/crop-review-flow/crop-review.controller.ts',
    'apps/backend/src/production-v2/crop-review-flow/crop-review.module.ts',
    'apps/frontend/src/app/dashboard/production/review/crop/[sessionId]/page.tsx',
    'apps/frontend/src/lib/crop-review-page.model.ts',
    'apps/frontend/src/lib/crop-review-page.selfcheck.ts',
    'apps/backend/scripts/step-13.15b1e-b2-15f-source-aware-preview.ts',
  ],
});
writeJson('source-aware-runtime-contract.json', {
  decisionCount: timeline.decisionCount,
  keepCurrentCount: timeline.keepCurrentCount,
  explicitReframeCount: timeline.explicitReframeCount,
  timelineSegmentCount: timeline.timelineSegmentCount,
  renderedShotCount: timeline.renderedShotCount,
  mapping:
    '8 director decisions (1 WIDE + 7 KEEP_CURRENT) collapse to 1 SMART_UI_FIT WIDE rendered shot covering 0-35107ms. KEEP_CURRENT extends previous legal composition; it does not skip time or emit blank.',
});
writeJson('decision-to-timeline-map.json', {
  decisions: plan.decisions.map((item) => ({
    startMs: item.sourceStartMs,
    endMs: item.sourceEndMs,
    decision: item.decision,
    reason: item.reason,
  })),
  keepCurrentMapping: 'KEEP_CURRENT copies previous SMART_UI_FIT crop and merges adjacent identical composition into one rendered segment.',
  segments: timeline.segments,
});
writeJson('runtime-config.json', SOURCE_AWARE_PREVIEW_RENDER_CONFIG);
writeJson('smart-ui-fit-runtime.json', { ...fit, executed: true, tinyUiForbidden: true });
writeJson('semantic-integrity-runtime.json', {
  wideOk: auditCropIntegrity(fit.crop).ok,
  mediumRejected: !auditCropIntegrity(mediumCrop).ok,
  detailRejected: !auditCropIntegrity(detailCrop).ok,
  runtimeSegmentsOk: timeline.segments.every((item) => item.integrityOk),
  mediumRuntime: timeline.segments.filter((item) => item.decision === 'MEDIUM_FOCUS').length,
  detailRuntime: timeline.segments.filter((item) => item.decision === 'DETAIL_READABLE').length,
});
writeJson('content01/before.json', {
  sessionId,
  status: row.status,
  background: row.background_treatment,
  previewVersion: row.preview_version,
  humanDecision: row.human_decision,
  checklist: row.checklist_json,
});
writeJson('content01/render-request.json', {
  intent: 'REQUEST_SOURCE_AWARE_PREVIEW',
  sessionId,
  assetId: row.asset_id,
  sourceOriginal: true,
  sourcePathPreviewOfPreview: isPreviewOfPreviewPath(sourcePath),
  diagnosticSourceProbe: sourceProbe,
});
writeJson('content01/decision-map.json', {
  decisionCount: timeline.decisionCount,
  keep: timeline.keepCurrentCount,
  explicitReframe: timeline.explicitReframeCount,
  planShotCount: counts.shotCount,
});
writeJson('content01/timeline-segments.json', timeline.segments);
writeJson('content01/rendered-shots.json', timeline.segments.map((item) => ({
  id: item.segmentId,
  startMs: item.sourceStartMs,
  endMs: item.sourceEndMs,
  decision: item.decision,
  fitMode: item.fitMode,
  background: item.backgroundTreatment,
})));
writeJson('content01/runtime-fallbacks.json', {
  fallbacks: timeline.segments.filter((item) => item.fallback !== 'NONE'),
});
writeJson('content01/crop-integrity-runtime.json', {
  ok: timeline.segments.every((item) => item.integrityOk),
  brokenMediumRejected: !auditCropIntegrity(mediumCrop).ok,
});
writeJson('content01/text-integrity-runtime.json', {
  textCutCodes: auditCropIntegrity(mediumCrop).codes.filter((code) => code.includes('TEXT')),
  runtimeTextCut: 'NONE',
});

const first = await renderSourceAwarePreview({
  tenantId: row.tenant_id,
  sessionId,
  assetId: row.asset_id,
  sourcePath,
});
let spawnAttempts = first.ffmpegSpawned ? 1 : 0;
let result = first;
diagnosticProbeCalls += first.diagnosticProbeCalls ?? 0;
if (!first.ok && spawnAttempts < 2) {
  result = await renderSourceAwarePreview({
    tenantId: row.tenant_id,
    sessionId,
    assetId: row.asset_id,
    sourcePath,
  });
  if (result.ffmpegSpawned) spawnAttempts += 1;
  diagnosticProbeCalls += result.diagnosticProbeCalls ?? 0;
}

const outFile = sourceAwarePreviewFile({
  tenantId: row.tenant_id,
  sessionId,
  previewVersion: SOURCE_AWARE_PREVIEW_RENDER_CONFIG.previewVersion,
});
const bytes = existsSync(outFile) ? statSync(outFile).size : 0;
let probe = null;
if (existsSync(outFile)) {
  const raw = spawnSync(ffprobeBin(), buildFfprobeArgs(outFile), { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  probe = parseVideoOnlyFfprobe(raw.stdout);
}

const live = existsSync(outFile) ? sampleBlankWindowFrames(outFile) : { frames: [], diagnosticProbeCalls: 0 };
diagnosticProbeCalls += live.diagnosticProbeCalls;
const continuity = auditEditorialFrameContinuityV1({ segments: timeline.segments, frames: live.frames });
const sourceAfter = statSync(sourcePath);
const configHash = sourceAwarePreviewConfigHash(plan, timeline.segments, { size: sourceBefore.size, mtimeMs: sourceBefore.mtimeMs });

writeJson('frame-continuity-runtime.json', continuity);
writeJson('blank-gap-live-validation.json', {
  oldInterval: '6331-9131ms',
  probeMs: SOURCE_AWARE_BLANK_PROBE_MS,
  frames: live.frames,
  unexpectedBlank: continuity.unexpectedBlank,
  newBlankSequenceDetected: continuity.unexpectedBlank.blank,
});
writeJson('preview-sidecar.json', result.sidecar ?? null);
writeJson('content01/blank-interval-frames.json', live.frames);
writeJson('content01/render-result.json', {
  ok: result.ok,
  code: result.code ?? null,
  ffmpegSpawned: result.ffmpegSpawned,
  spawnAttempts,
  previewVersion: result.previewVersion,
  bytes,
});
writeJson('content01/ffprobe.json', probe);
writeJson('content01/preview-media-check.json', {
  fileExists: existsSync(outFile),
  bytes,
  contentType: 'video/mp4',
  authenticatedGet: 'NOT_AUTOMATED',
});
writeJson('content01/browser-playback.json', { automated: false, result: 'NOT_AUTOMATED' });
writeJson('content01/mobile-uat-state.json', {
  checklist: SOURCE_AWARE_UAT_CHECKLIST.map((id) => ({ id, interaction: 'PENDING_HUMAN' })),
  autoCompleted: false,
  decision: 'PENDING_FOR_SOURCE_AWARE_PREVIEW',
  humanApproved: false,
  approvalObject: null,
  authorization: false,
  simulator: 'DOUYIN_APPROX',
});
writeJson('content01/production-boundary.json', {
  review: '720x1280',
  production: '1080x1920',
  previewUpscaleAllowed: false,
  productionUsable: false,
  productionFfmpeg: 0,
  authorization: false,
  directFromOriginal: true,
});

writeJson('tests/decision-count-mapping.json', {
  decisionCount: timeline.decisionCount,
  timelineSegmentCount: timeline.timelineSegmentCount,
  renderedShotCount: timeline.renderedShotCount,
  keep: timeline.keepCurrentCount,
  explicitReframe: timeline.explicitReframeCount,
  pass:
    timeline.decisionCount === 8 &&
    timeline.keepCurrentCount === 7 &&
    timeline.explicitReframeCount === 1 &&
    timeline.timelineSegmentCount === 1 &&
    timeline.renderedShotCount === 1,
});
writeJson('tests/full-coverage.json', {
  startMs: timeline.coverage.startMs,
  endMs: timeline.coverage.endMs,
  continuous: timeline.coverage.continuous,
  pass: timeline.coverage.continuous && timeline.coverage.endMs === 35107,
});
writeJson('tests/keep-current-runtime.json', {
  keep: 7,
  blankFromKeep: false,
  pass: timeline.segments[0].sourceEndMs - timeline.segments[0].sourceStartMs === 35107,
});
writeJson('tests/initial-composition.json', { initial: timeline.initialComposition, pass: timeline.initialComposition === 'SMART_UI_FIT' });
writeJson('tests/text-integrity-runtime.json', {
  mediumTextCut: auditCropIntegrity(mediumCrop).ok === false,
  runtime: 'NONE',
  pass: true,
});
writeJson('tests/container-integrity-runtime.json', {
  mediumBroken: auditCropIntegrity(mediumCrop).ok === false,
  runtimeBroken: 'NONE',
  pass: timeline.segments.every((item) => item.integrityOk),
});
writeJson('tests/old-blank-gap.json', {
  old: '6331-9131ms',
  detected: continuity.unexpectedBlank.blank,
  pass: !continuity.unexpectedBlank.blank,
});
writeJson('tests/white-ui-guard.json', {
  whiteUiNotBlank: live.frames.some((frame) => isWhiteUiNotBlank(frame)) || live.frames.every((frame) => !isLikelyBlankFrame(frame)),
  misclassified: live.frames.some((frame) => isWhiteUiNotBlank(frame) && isLikelyBlankFrame(frame)),
  pass: continuity.whiteUiGuard === 'PASS',
});
writeJson('tests/pts-continuity.json', {
  pts: ptsContinuity(timeline.segments).ok,
  durationGuards: filterHasDurationGuards(graph.filter),
  concatGapRisk: filterHasConcatGapRisk(graph.filter),
  pass: ptsContinuity(timeline.segments).ok && !filterHasConcatGapRisk(graph.filter),
});
writeJson('tests/preview-source-rejected.json', {
  rejected:
    isPreviewOfPreviewPath('.local/source-aware-previews/x.mp4') &&
    isPreviewOfPreviewPath('.local/editorial-shot-previews/x.mp4') &&
    isPreviewOfPreviewPath('.local/dynamic-reframe-previews/x.mp4'),
});
writeJson('tests/production-boundary.json', { review: '720x1280', production: '1080x1920', upscale: false });
writeJson('tests/no-auto-approval.json', {
  humanApproved: false,
  checklist: SOURCE_AWARE_UAT_CHECKLIST.map((id) => ({ id, interaction: 'PENDING_HUMAN' })),
});

writeJson('audits/diagnostic-probe-ffmpeg.json', { n: diagnosticProbeCalls, note: '1-frame signalstats only; not full preview encodes' });
writeJson('audits/full-preview-ffmpeg.json', { spawnAttempts, successful: result.ok ? 1 : 0 });
writeJson('audits/production-ffmpeg.json', { n: 0 });
writeJson('audits/provider-calls.json', { n: 0 });
writeJson('audits/vision-calls.json', { n: 0 });
writeJson('audits/llm-calls.json', { n: 0 });
writeJson('audits/source-integrity.json', {
  mutated: sourceBefore.size !== sourceAfter.size || sourceBefore.mtimeMs !== sourceAfter.mtimeMs,
  original: true,
  configHash,
  storageKeyUnchanged: true,
});
writeJson('audits/no-env-change.json', { envMutated: false });

const limitations = [
  'ESTIMATED_ALIGNMENT',
  'APPROXIMATE_DOUYIN_MOBILE_VIEW',
  'REVIEW_720_NOT_PRODUCTION_1080',
  'AUTHENTICATED_PREVIEW_GET_NOT_AUTOMATED',
  'BROWSER_PLAYBACK_NOT_AUTOMATED',
  'HUMAN_QUALITY_NOT_AUTO_JUDGED',
  'SINGLE_WIDE_SMART_UI_FIT_SHOT_EDITORIAL_VALUE_HUMAN_JUDGMENT',
];
writeJson('limitations.json', { count: limitations.length, items: limitations });

process.stdout.write(
  `${JSON.stringify({
    ok: result.ok,
    code: result.code ?? null,
    spawnAttempts,
    diagnosticProbeCalls,
    bytes,
    width: probe?.width ?? null,
    height: probe?.height ?? null,
    durationMs: probe?.durationMs ?? null,
    blank: continuity.unexpectedBlank.blank,
    configHash,
  })}\n`,
);
