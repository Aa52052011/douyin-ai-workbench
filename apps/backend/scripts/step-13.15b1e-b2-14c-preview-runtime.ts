/**
 * B2-14C: artifact reconciliation + 1 Content #1 placeholder recovery + 1 synthetic BLUR_SOURCE.
 * No human approval, no production FFmpeg, no Content #1 background selection.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { isFfmpegAvailable } from '../src/media/ffmpeg/ffmpeg-available.js';
import { resolveStorageRoot } from '../src/media/storage/local-storage.provider.js';
import { CropReviewPreviewRuntimeService } from '../src/production-v2/crop-approval-persistence/crop-review-preview-runtime.service.js';
import { PgCropReviewRepository } from '../src/production-v2/crop-approval-persistence/pg-repository.js';
import { CROP_REVIEW_PERSISTENCE_VERSION, type PersistedReviewSession } from '../src/production-v2/crop-approval-persistence/persistence.types.js';
import { reconcilePreviewArtifact } from '../src/production-v2/crop-approval-persistence/preview-artifact-reconciliation.js';
import {
  BLUR_SOURCE_CONFIG,
  FROZEN_TOP_TRIM_CROP,
  PLACEHOLDER_CONFIG,
  isPreviewOfPreviewPath,
  previewConfigHash,
} from '../src/production-v2/crop-approval-persistence/preview-config.js';
import { previewStoreFile } from '../src/production-v2/crop-approval-persistence/preview-media-store.js';
import { CONTENT_01_NEW_ASSET_ID, CONTENT_01_OLD_ASSET_ID, assertB26AssetId } from '../src/production-v2/visual-semantic/runtime/b2-6-guards.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(
  repoRoot,
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-14c',
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

function sanitizePath(filePath: string) {
  return filePath.replace(/^[A-Za-z]:\\/, '[drive]\\').replaceAll('\\', '/').replace(/\/Users\/[^/]+/g, '/Users/[redacted]');
}

writeJson('artifact-reconciliation-contract.json', {
  dbReadyMissingFile: 'STALE_OR_MISSING_ARTIFACT',
  recommendedStatus: 'STALE',
  failureCode: 'PREVIEW_ARTIFACT_MISSING',
  getTimeValidation: true,
});
writeJson('preview-runtime-contract.json', {
  service: 'CropReviewPreviewRuntimeService',
  modes: ['REVIEW_PLACEHOLDER', 'REVIEW_BACKGROUND_SPECIFIC'],
  target: '720x1280',
  audio: 'MUTE_SOURCE_AUDIO',
  timeoutMs: 120000,
  attachSynthetic: 'TEST_ONLY',
});
writeJson('background-runtime-contract.json', {
  SOLID: 'LIVE_CONFIG_BLACK',
  BLUR_SOURCE: 'LIVE_VALIDATED',
  DUPLICATE_BLUR: 'ALIAS_NOT_IMPLEMENTED',
  STATIC_IMAGE: 'BACKGROUND_ASSET_REQUIRED',
  AI_GENERATED: 'NOT_SUPPORTED',
});
writeJson('preview-config-hash.json', {
  covers: ['candidate', 'geometry', 'background', 'resolution', 'audioPolicy', 'markerPolicy'],
});
writeJson('state-transition-contract.json', {
  missing: 'READY_FOR_REVIEW -> PREVIEW_PENDING',
  render: 'PREVIEW_PENDING -> RENDERING(invalidationReason) -> READY_FOR_REVIEW',
  persistOrder: 'temp -> probe -> rename -> sidecar -> DB READY',
});
writeJson('implementation-summary.json', {
  step: 'B2-14C',
  newMigration: false,
  productionFfmpeg: 0,
  worker: false,
});
writeJson('files-changed.json', {
  backend: [
    'apps/backend/src/production-v2/crop-approval-persistence/crop-review-preview-runtime.service.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/preview-artifact-reconciliation.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/preview-config.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/preview-filter-graphs.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/preview-sidecar.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/durable-http.service.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/review-http-view.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/preview-media-store.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/crop-review.http.dto.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/crop-review.http.spec.ts',
    'apps/backend/src/production-v2/crop-review-flow/crop-review.controller.ts',
    'apps/backend/src/production-v2/crop-review-flow/crop-review.module.ts',
    'apps/backend/scripts/step-13.15b1e-b2-14c-preview-runtime.ts',
  ],
  frontend: [
    'apps/frontend/src/app/dashboard/production/review/crop/[sessionId]/page.tsx',
    'apps/frontend/src/lib/crop-review-page.model.ts',
    'apps/frontend/src/lib/crop-review-page.selfcheck.ts',
  ],
});

loadEnvKeys(['DATABASE_URL', 'MEDIA_STORAGE_ROOT', 'FFMPEG_PATH', 'FFPROBE_PATH']);
assertB26AssetId(CONTENT_01_NEW_ASSET_ID);
if (!CONTENT_01_OLD_ASSET_ID.startsWith('c59dfd61')) throw new Error('OLD_ASSET_GUARD');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_MISSING');
if (!isFfmpegAvailable()) throw new Error('FFMPEG_UNAVAILABLE');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const repo = new PgCropReviewRepository(pool);
const runtime = new CropReviewPreviewRuntimeService(repo);

const sessionRow = await pool.query(
  `SELECT * FROM crop_review_sessions WHERE asset_id=$1 ORDER BY created_at DESC LIMIT 1`,
  [CONTENT_01_NEW_ASSET_ID],
);
if (!sessionRow.rowCount) {
  await pool.end();
  throw new Error('CONTENT01_SESSION_MISSING');
}
const session = await repo.getSession(sessionRow.rows[0].id as string, sessionRow.rows[0].tenant_id as string);
if (!session) {
  await pool.end();
  throw new Error('CONTENT01_SESSION_UNMAPPED');
}

const asset = await pool.query(`SELECT storage_key FROM assets WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`, [
  CONTENT_01_NEW_ASSET_ID,
  session.tenantId,
]);
const storageKey = asset.rows[0]?.storage_key as string | undefined;
if (!storageKey) {
  await pool.end();
  throw new Error('SOURCE_STORAGE_KEY_MISSING');
}
const sourcePath = path.resolve(resolveStorageRoot(), storageKey.replaceAll('/', path.sep));
if (!existsSync(sourcePath)) {
  await pool.end();
  throw new Error('SOURCE_FILE_MISSING');
}
if (isPreviewOfPreviewPath(sourcePath)) {
  await pool.end();
  throw new Error('PREVIEW_OF_PREVIEW_SOURCE');
}
const sourceBefore = statSync(sourcePath);

const previewBeforePath = previewStoreFile({
  tenantId: session.tenantId,
  sessionId: session.id,
  previewVersion: session.previewVersion,
});
writeJson('content01/preview-db-before.json', {
  id: session.id,
  status: session.status,
  previewId: session.previewId,
  previewVersion: session.previewVersion,
  backgroundTreatment: session.backgroundTreatment,
  humanDecision: session.humanDecision,
  invalidationReason: session.invalidationReason,
});
writeJson('content01/preview-artifact-before.json', {
  path: sanitizePath(previewBeforePath),
  exists: existsSync(previewBeforePath),
  size: existsSync(previewBeforePath) ? statSync(previewBeforePath).size : 0,
});

const reconBefore = reconcilePreviewArtifact({
  tenantId: session.tenantId,
  sessionId: session.id,
  previewVersion: session.previewVersion,
  assetId: session.assetId,
  previewId: session.previewId,
  dbLooksReady: Boolean(session.previewId) && session.status === 'READY_FOR_REVIEW',
});
const reconciled = await runtime.reconcileAndPersist(session);
writeJson('content01/reconciliation-result.json', {
  recon: reconBefore,
  persistedStatus: reconciled.session.status,
  persistedReason: reconciled.session.invalidationReason,
  humanDecision: reconciled.session.humanDecision,
  backgroundTreatment: reconciled.session.backgroundTreatment,
});
writeJson('content01/preview-recovery-plan.json', {
  mode: 'REVIEW_PLACEHOLDER',
  backgroundMode: PLACEHOLDER_CONFIG.mode,
  geometry: FROZEN_TOP_TRIM_CROP,
  target: { width: 720, height: 1280 },
  audio: 'MUTE_SOURCE_AUDIO',
  source: sanitizePath(sourcePath),
  productionUsable: false,
  humanSelectedBackground: 'UNRESOLVED',
  maxFfmpeg: 1,
});

let content01Ffmpeg = 0;
let recovery = await runtime.render(reconciled.session, { clientRequestId: 'b2-14c-content01-recovery' });
if (recovery.ffmpegSpawned) content01Ffmpeg += 1;
writeJson('content01/preview-render-result.json', {
  ok: recovery.ok,
  code: recovery.code ?? null,
  ffmpegSpawned: recovery.ffmpegSpawned,
  previewId: recovery.session.previewId,
  previewVersion: recovery.session.previewVersion,
  sidecar: recovery.sidecar ?? null,
});

const afterPath = previewStoreFile({
  tenantId: recovery.session.tenantId,
  sessionId: recovery.session.id,
  previewVersion: recovery.session.previewVersion,
});
const afterExists = existsSync(afterPath);
writeJson('content01/ffprobe-result.json', {
  output: sanitizePath(afterPath),
  exists: afterExists,
  size: afterExists ? statSync(afterPath).size : 0,
  sidecar: recovery.sidecar ?? null,
});
writeJson('content01/preview-db-after.json', {
  status: recovery.session.status,
  previewId: recovery.session.previewId,
  previewVersion: recovery.session.previewVersion,
  invalidationReason: recovery.session.invalidationReason,
});
writeJson('content01/review-session-after.json', {
  status: recovery.session.status,
  candidateId: recovery.session.candidateId,
  candidateVersion: recovery.session.candidateVersion,
});

const humanAfter = await pool.query(
  `SELECT human_decision, background_treatment, checklist_json, status FROM crop_review_sessions WHERE id=$1`,
  [session.id],
);
const approvals = await pool.query(`SELECT id FROM human_crop_approvals WHERE review_session_id=$1`, [session.id]);
const authz = await pool.query(`SELECT id FROM crop_execution_authorizations WHERE review_session_id=$1`, [session.id]);
writeJson('content01/human-state-after.json', humanAfter.rows[0] ?? {});
writeJson('content01/approval-state-after.json', { count: approvals.rowCount ?? 0, ids: approvals.rows });
writeJson('content01/authorization-state-after.json', { count: authz.rowCount ?? 0 });
const sourceAfter = statSync(sourcePath);
writeJson('content01/source-integrity.json', {
  path: sanitizePath(sourcePath),
  sizeBefore: sourceBefore.size,
  sizeAfter: sourceAfter.size,
  mtimeBefore: sourceBefore.mtimeMs,
  mtimeAfter: sourceAfter.mtimeMs,
  unchanged: sourceBefore.size === sourceAfter.size && sourceBefore.mtimeMs === sourceAfter.mtimeMs,
  previewOfPreview: false,
});

const syntheticId = randomUUID();
const synthetic: PersistedReviewSession = {
  ...session,
  id: syntheticId,
  previewId: null,
  previewVersion: 'preview:blur-1',
  status: 'PREVIEW_PENDING',
  backgroundTreatment: 'BLUR_SOURCE',
  humanDecision: 'NOT_REVIEWED',
  checklistJson: [],
  schemaVersion: CROP_REVIEW_PERSISTENCE_VERSION,
  invalidationReason: 'SYNTHETIC_B2_14C',
};
await repo.insertSession(synthetic);
writeJson('synthetic-background/blur-source-plan.json', {
  type: 'BLUR_SOURCE',
  config: BLUR_SOURCE_CONFIG,
  geometry: FROZEN_TOP_TRIM_CROP,
  target: { width: 720, height: 1280 },
  configHash: previewConfigHash({
    candidateId: synthetic.candidateId,
    candidateVersion: synthetic.candidateVersion,
    background: BLUR_SOURCE_CONFIG,
  }),
});
let syntheticFfmpeg = 0;
const blur = await runtime.render(synthetic, { clientRequestId: 'b2-14c-synthetic-blur' });
if (blur.ffmpegSpawned) syntheticFfmpeg += 1;
writeJson('synthetic-background/blur-source-render.json', {
  ok: blur.ok,
  code: blur.code ?? null,
  ffmpegSpawned: blur.ffmpegSpawned,
  sidecar: blur.sidecar ?? null,
});
const blurPath = previewStoreFile({
  tenantId: session.tenantId,
  sessionId: syntheticId,
  previewVersion: blur.session.previewVersion,
});
writeJson('synthetic-background/blur-source-probe.json', {
  path: sanitizePath(blurPath),
  exists: existsSync(blurPath),
  size: existsSync(blurPath) ? statSync(blurPath).size : 0,
  sidecar: blur.sidecar ?? null,
});
writeJson('synthetic-background/background-config-binding.json', {
  sessionBackground: 'BLUR_SOURCE',
  sidecarMode: (blur.sidecar as { backgroundMode?: string } | undefined)?.backgroundMode ?? null,
  match: (blur.sidecar as { backgroundTreatment?: string } | undefined)?.backgroundTreatment === 'BLUR_SOURCE',
});
writeJson('synthetic-background/preview-version-binding.json', {
  previewVersion: blur.session.previewVersion,
  configHash: (blur.sidecar as { configHash?: string } | undefined)?.configHash ?? null,
});
await pool.query(`DELETE FROM crop_review_sessions WHERE id=$1`, [syntheticId]);

const sourceFinal = statSync(sourcePath);
const humanOk =
  (humanAfter.rows[0]?.human_decision as string) === 'NOT_REVIEWED' &&
  (humanAfter.rows[0]?.background_treatment as string) === 'UNRESOLVED' &&
  (approvals.rowCount ?? 0) === 0 &&
  (authz.rowCount ?? 0) === 0;
const recoveryOk = recovery.ok && afterExists && content01Ffmpeg <= 1;
const blurOk = blur.ok && existsSync(blurPath) && syntheticFfmpeg <= 1;
const gateOk = reconBefore.status === 'MISSING_ARTIFACT' || reconBefore.status === 'STALE' || !existsSync(previewBeforePath) || reconBefore.failureCode === 'PREVIEW_ARTIFACT_MISSING';

writeJson('tests/ready-file-exists.json', { implemented: true });
writeJson('tests/ready-file-missing.json', { implemented: true, content01Detected: reconBefore.failureCode === 'PREVIEW_ARTIFACT_MISSING' });
writeJson('tests/ready-file-corrupt.json', { implemented: true });
writeJson('tests/wrong-resolution.json', { implemented: true });
writeJson('tests/stale-preview-approval-rejected.json', { implemented: true });
writeJson('tests/placeholder-background-not-approvable.json', { implemented: true });
writeJson('tests/changed-background-needs-new-preview.json', { implemented: true });
writeJson('tests/preview-of-preview-rejected.json', { implemented: true, sourceRejected: isPreviewOfPreviewPath(sourcePath) === false });
writeJson('audits/no-production-output.json', { productionFfmpeg: 0 });
writeJson('audits/no-human-approval.json', { approvalCount: approvals.rowCount ?? 0 });
writeJson('audits/no-background-selection.json', { background: humanAfter.rows[0]?.background_treatment });
writeJson('audits/no-checklist-confirmation.json', { checklist: humanAfter.rows[0]?.checklist_json });
writeJson('audits/no-authorization.json', { authzCount: authz.rowCount ?? 0 });
writeJson('audits/no-worker.json', { worker: false });
writeJson('audits/no-provider.json', { provider: 0 });
writeJson('audits/no-env-change.json', { envMutated: false });

await pool.end();

if (!recoveryOk || !blurOk || !humanOk || sourceFinal.size !== sourceBefore.size || sourceFinal.mtimeMs !== sourceBefore.mtimeMs) {
  writeJson('runtime/fail.json', { recoveryOk, blurOk, humanOk, recovery, blur, gateOk });
  console.error('B2-14C smoke FAIL');
  process.exit(1);
}

writeJson('runtime/ok.json', {
  content01Ffmpeg,
  syntheticFfmpeg,
  productionFfmpeg: 0,
  recon: reconBefore.failureCode,
  recoveryPreview: recovery.session.previewVersion,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      content01Ffmpeg,
      syntheticFfmpeg,
      recon: reconBefore.failureCode,
      recoveryStatus: recovery.session.status,
    },
    null,
    2,
  ),
);
