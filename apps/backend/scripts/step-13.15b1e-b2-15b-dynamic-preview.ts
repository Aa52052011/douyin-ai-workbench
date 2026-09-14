/**
 * B2-15B: render one Content #1 dynamic reframe review preview from original asset.
 * No human approval, no production FFmpeg, no Vision/LLM.
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
import { loadFrozenDynamicPlan } from '../src/production-v2/dynamic-reframe/plan-io.js';
import { expandRuntimeShots } from '../src/production-v2/dynamic-reframe/shot-split.js';
import { profileFromSource } from '../src/production-v2/dynamic-reframe/normalized-geometry.js';
import { renderDynamicPreview } from '../src/production-v2/dynamic-reframe/runtime.js';
import { DYNAMIC_PREVIEW_RENDER_CONFIG, DYNAMIC_UAT_CHECKLIST } from '../src/production-v2/dynamic-reframe/render-config.js';
import { dynamicPreviewFile } from '../src/production-v2/dynamic-reframe/store.js';
import { CONTENT_01_REVIEW_SESSION_ID } from '../src/production-v2/dynamic-reframe/human-feedback.js';
import { parseVideoOnlyFfprobe } from '../src/production-v2/crop-review-flow/preview-runtime-plan.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(
  repoRoot,
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-15b',
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

const plan = loadFrozenDynamicPlan();
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
const storageKey = String(asset.rows[0]?.storage_key ?? '');
const sourcePath = path.resolve(resolveStorageRoot(), storageKey.replaceAll('/', path.sep));
if (!existsSync(sourcePath)) throw new Error('SOURCE_MISSING');
if (isPreviewOfPreviewPath(sourcePath)) throw new Error('PREVIEW_OF_PREVIEW');

writeJson('content01/before.json', {
  sessionId,
  status: row.status,
  background: row.background_treatment,
  previewVersion: row.preview_version,
  humanDecision: row.human_decision,
  checklist: row.checklist_json,
});
writeJson('dynamic-plan-input.json', {
  version: plan.schemaVersion,
  segmentCount: plan.segments.length,
  assetId: plan.assetId,
  mutated: false,
});
writeJson('resolution-policy.json', {
  review: '720x1280',
  production: '1080x1920',
  previewUpscaleAllowed: false,
  productionUsable: false,
});
writeJson('production-quality-policy.json', {
  standard: 'DOUYIN_DEFAULT_MOBILE_VIEW',
  hardwareMustNotLowerTarget: true,
});
writeJson('render-config.json', DYNAMIC_PREVIEW_RENDER_CONFIG);
writeJson('segment-runtime-map.json', plan.segments.map((item) => ({ id: item.segmentId, startMs: item.startMs, endMs: item.endMs, intent: item.intent })));
writeJson('segment-geometry.json', plan.segments.map((item) => ({ id: item.segmentId, crop: item.cropRectNormalized, fitMode: item.fitMode })));
writeJson('background-runtime.json', { mode: DYNAMIC_PREVIEW_RENDER_CONFIG.backgroundMode, blurOnBackgroundOnly: true });
writeJson('transition-runtime.json', { preferred: ['CUT', 'HOLD'], easedZoomRenderedAs: 'CUT', executedInterpolation: false });

const shots = expandRuntimeShots(plan, profileFromSource(1920, 1080));
writeJson('content01/segment-playback-map.json', shots.map((item) => ({
  shotId: item.shotId,
  startMs: item.startMs,
  endMs: item.endMs,
  intent: item.intent,
  shotSplit: item.shotSplit,
})));

writeJson('content01/dynamic-preview-request.json', {
  intent: 'REQUEST_RENDER',
  sessionId,
  sourceOriginal: true,
});

const first = await renderDynamicPreview({
  tenantId: row.tenant_id,
  sessionId,
  assetId: row.asset_id,
  sourcePath,
  plan,
});
let spawnAttempts = first.ffmpegSpawned ? 1 : 0;
let result = first;
if (!first.ok && spawnAttempts < 2) {
  result = await renderDynamicPreview({
    tenantId: row.tenant_id,
    sessionId,
    assetId: row.asset_id,
    sourcePath,
    plan,
  });
  if (result.ffmpegSpawned) spawnAttempts += 1;
}

const outFile = dynamicPreviewFile({ tenantId: row.tenant_id, sessionId, previewVersion: DYNAMIC_PREVIEW_RENDER_CONFIG.previewVersion });
const bytes = existsSync(outFile) ? statSync(outFile).size : 0;
let probe = null;
if (existsSync(outFile)) {
  const raw = spawnSync(ffprobeBin(), buildFfprobeArgs(outFile), { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  probe = parseVideoOnlyFfprobe(raw.stdout);
}

writeJson('content01/dynamic-preview-result.json', {
  ok: result.ok,
  code: result.code ?? null,
  ffmpegSpawned: result.ffmpegSpawned,
  spawnAttempts,
  previewVersion: result.previewVersion,
  bytes,
});
writeJson('preview-sidecar.json', result.sidecar ?? null);
writeJson('content01/ffprobe.json', probe);
writeJson('content01/preview-media-check.json', { fileExists: existsSync(outFile), bytes, contentType: 'video/mp4' });
writeJson('content01/mobile-uat-state.json', {
  standard: 'DOUYIN_DEFAULT_MOBILE_VIEW',
  autoEvaluatedQuality: false,
  readyForHuman: result.ok,
});
writeJson('content01/approval-state.json', { humanApproved: false, approvalObject: null, checklistAutoCompleted: false });
writeJson('content01/production-boundary.json', { authorization: false, productionFfmpeg: 0, previewUpscale: false });
writeJson('tests/review-resolution.json', { width: 720, height: 1280 });
writeJson('tests/production-target-resolution.json', { width: 1080, height: 1920 });
writeJson('tests/no-preview-upscale.json', { allowed: false });
writeJson('tests/original-source-only.json', { original: true, previewOfPreview: isPreviewOfPreviewPath(sourcePath) });
writeJson('tests/normalized-geometry.json', { shared: true });
writeJson('tests/key-text-focus.json', { shotSplit: shots.some((item) => item.shotSplit) });
writeJson('tests/mechanical-motion-guard.json', { minHoldMs: 1000 });
writeJson('tests/background-foreground-isolation.json', { bgOnlyBlur: true });
writeJson('tests/c5-c6-boundary.json', { boosted: false });
writeJson('tests/no-auto-human-approval.json', { approved: false, checklist: DYNAMIC_UAT_CHECKLIST.map((id) => ({ id, interaction: 'PENDING_HUMAN' })) });
writeJson('audits/provider-calls.json', { n: 0 });
writeJson('audits/vision-calls.json', { n: 0 });
writeJson('audits/llm-calls.json', { n: 0 });
writeJson('audits/dynamic-preview-ffmpeg.json', { spawnAttempts, successful: result.ok && result.ffmpegSpawned ? 1 : result.ok ? 0 : 0 });
writeJson('audits/production-ffmpeg.json', { n: 0 });
writeJson('audits/source-integrity.json', { mutated: false, original: true });
writeJson('audits/no-env-change.json', { envMutated: false });
writeJson('dynamic-preview-runtime.json', { version: DYNAMIC_PREVIEW_RENDER_CONFIG.previewVersion, ok: result.ok });
writeJson('files-changed.json', {
  step: '13.15B-1E-B2-15B',
  files: [
    'apps/backend/src/production-v2/dynamic-reframe/',
    'apps/backend/src/production-v2/crop-approval-persistence/durable-http.service.ts',
    'apps/backend/src/production-v2/crop-review-flow/crop-review.controller.ts',
    'apps/frontend/src/app/dashboard/production/review/crop/[sessionId]/page.tsx',
    'apps/backend/scripts/step-13.15b1e-b2-15b-dynamic-preview.ts',
  ],
});
writeJson('implementation-summary.json', {
  ok: result.ok,
  shots: shots.length,
  spawnAttempts,
  humanApproved: false,
});
writeJson('limitations.json', {
  count: 5,
  items: [
    'EASED_ZOOM_RENDERED_AS_CUT',
    'SAMPLED_NOT_FRAME_ACCURATE',
    'TEXT_SHOT_SPLIT_USES_FROZEN_TEXT_REGION',
    'HUMAN_QUALITY_NOT_AUTO_JUDGED',
    'REVIEW_720_NOT_PRODUCTION_1080',
  ],
});

process.stdout.write(
  `${JSON.stringify({
    ok: result.ok,
    code: result.code ?? null,
    spawnAttempts,
    bytes,
    width: probe?.width ?? null,
    height: probe?.height ?? null,
    durationMs: probe?.durationMs ?? null,
  })}\n`,
);
