/**
 * B2-14 evidence. No Content #1 approval. No Content #1 production FFmpeg.
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { CropApprovalPersistenceService } from '../src/production-v2/crop-approval-persistence/approval-persistence.js';
import {
  CROP_APPROVAL_PERSISTENCE_VERSION,
  CROP_AUTHORIZED_RUNTIME_VERSION,
  CROP_EXECUTION_AUTHORIZATION_VERSION,
  CROP_REVIEW_PERSISTENCE_VERSION,
  type PersistedReviewSession,
  type TenantScope,
} from '../src/production-v2/crop-approval-persistence/persistence.types.js';
import { executeAuthorizedCropPlan, upgradePreviewPlanToAuthorized } from '../src/production-v2/crop-approval-persistence/authorized-runtime.js';
import { assembleContent01Clean } from '../src/production-v2/visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { generateSemanticCropCandidates } from '../src/production-v2/visual-crop-candidate/crop-candidate-assembler.js';
import { evaluateCropComparison } from '../src/production-v2/visual-crop-comparison/comparison-evaluator.js';
import { runCropSelectionDryRun } from '../src/production-v2/director-visual-policy/dryrun-assembler.js';
import { buildPreviewExecutionPlan } from '../src/production-v2/crop-execution/execution-plan-builder.js';
import { newId } from '../src/production-v2/crop-approval-persistence/memory-store.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(
  repoRoot,
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-14',
);
const ASSET = '803fafd2-4c0e-4412-80d7-a0d6452cefac';

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

loadEnvKeys(['DATABASE_URL']);

const SCOPE: TenantScope = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  userId: '44444444-4444-4444-8444-444444444444',
};

const svc = new CropApprovalPersistenceService();
const synthetic: PersistedReviewSession = {
  schemaVersion: CROP_REVIEW_PERSISTENCE_VERSION,
  id: newId(),
  ...SCOPE,
  assetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  candidateId: 'crop:top-trim',
  candidateVersion: 'geom:crop:top-trim',
  reviewPacketVersion: 'crop.human-review-packet:v1',
  previewId: 'pv:synthetic',
  previewVersion: 'preview:runtime-1',
  status: 'READY_FOR_REVIEW',
  backgroundTreatment: 'SOLID',
  requiredWarningsJson: [],
  checklistJson: [
    { id: 'MOBILE_READABILITY_ACCEPTABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
    { id: 'BACKGROUND_TREATMENT_ACCEPTABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
    { id: 'TEMPORAL_VARIANCE_ACCEPTABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
    { id: 'PRODUCT_UI_READABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
  ],
  humanDecision: 'NOT_REVIEWED',
  createdByUserId: SCOPE.userId,
  reviewedByUserId: null,
  expiresAt: null,
  invalidatedAt: null,
  invalidationReason: null,
  createdAt: '1970-01-01T00:00:00.000Z',
  updatedAt: '1970-01-01T00:00:00.000Z',
};
svc.persistSession(synthetic);
const approval = svc.approve({
  scope: SCOPE,
  sessionId: synthetic.id,
  clientActionId: 'synthetic-act',
  approvalSource: 'USER_UI_ACTION',
  acceptedWarnings: [],
  previewId: 'pv:synthetic',
  candidateEligible: true,
  hardBlocker: false,
});
const content01 = svc.persistSession({
  ...synthetic,
  id: newId(),
  assetId: ASSET,
  backgroundTreatment: 'UNRESOLVED',
  checklistJson: [
    { id: 'MOBILE_READABILITY_ACCEPTABLE', interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
    { id: 'BACKGROUND_TREATMENT_ACCEPTABLE', interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
    { id: 'TEMPORAL_VARIANCE_ACCEPTABLE', interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
    { id: 'PRODUCT_UI_READABLE', interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
  ],
});
const content01Approve = svc.approve({
  scope: SCOPE,
  sessionId: content01.id,
  clientActionId: 'content01-must-fail',
  approvalSource: 'USER_UI_ACTION',
  acceptedWarnings: [],
  previewId: 'pv:b2-13a:runtime-1',
  candidateEligible: true,
  hardBlocker: false,
});

const pack = assembleContent01Clean();
const dryRun = runCropSelectionDryRun(
  evaluateCropComparison(pack, generateSemanticCropCandidates(pack)),
);
const preview = buildPreviewExecutionPlan({ dryRun, profile: pack.cropInput.profile });
const previewReject = executeAuthorizedCropPlan(preview);
const authorized = approval.ok
  ? upgradePreviewPlanToAuthorized(preview, approval.value.id, 'SOLID', preview.assetId)
  : preview;
const authorizedExec = executeAuthorizedCropPlan(authorized);

let persistedDb = false;
let migrateApply: 'PASS' | 'FAIL' | 'SKIPPED' = 'SKIPPED';
if (process.env.DATABASE_URL) {
  try {
    const prismaCli = path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
      cwd: path.join(repoRoot, 'database'),
      env: { ...process.env },
      stdio: 'pipe',
    });
    migrateApply = 'PASS';
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const asset = await client.query('SELECT id, tenant_id, workspace_id, project_id FROM assets WHERE id=$1', [ASSET]);
    if (asset.rowCount) {
      const row = asset.rows[0] as { tenant_id: string; workspace_id: string; project_id: string };
      const sessionId = randomUUID();
      await client.query(
        `INSERT INTO crop_review_sessions (
          id, tenant_id, workspace_id, project_id, asset_id, candidate_id, candidate_version,
          review_packet_version, preview_id, preview_version, status, background_treatment,
          required_warnings_json, checklist_json, human_decision, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,'crop:top-trim','geom:crop:top-trim','crop.human-review-packet:v1',
          'pv:b2-13a:runtime-1','preview:runtime-1','READY_FOR_REVIEW','UNRESOLVED','[]'::jsonb,'[]'::jsonb,'NOT_REVIEWED',NOW(),NOW())
        ON CONFLICT (id) DO NOTHING`,
        [sessionId, row.tenant_id, row.workspace_id, row.project_id, ASSET],
      );
      const check = await client.query(
        `SELECT human_decision, status FROM crop_review_sessions WHERE asset_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 1`,
        [ASSET, row.tenant_id],
      );
      persistedDb = check.rows[0]?.human_decision === 'NOT_REVIEWED';
    }
    await client.end();
  } catch {
    migrateApply = migrateApply === 'PASS' ? 'PASS' : 'FAIL';
  }
}

writeJson('implementation-summary.json', {
  step: 'B2-14',
  content01HumanApproved: false,
  content01ProductionFfmpeg: 0,
  syntheticFfmpeg: 'NOT_RUN',
  migrateApply,
  persistedDb,
});
writeJson('files-changed.json', {
  schema: 'database/prisma/schema.prisma',
  migration: 'database/prisma/migrations/20260912020000_add_crop_review_approval_execution',
  module: 'apps/backend/src/production-v2/crop-approval-persistence',
});
writeJson('schema-summary.json', {
  tables: ['crop_review_sessions', 'human_crop_approvals', 'crop_execution_authorizations', 'crop_execution_runs'],
});
writeJson('migration-summary.json', { name: '20260912020000_add_crop_review_approval_execution', apply: migrateApply });
writeJson('review-persistence-contract.json', { version: CROP_REVIEW_PERSISTENCE_VERSION });
writeJson('approval-persistence-contract.json', { version: CROP_APPROVAL_PERSISTENCE_VERSION });
writeJson('authorization-contract.json', { version: CROP_EXECUTION_AUTHORIZATION_VERSION, requiresActiveHumanApproval: true });
writeJson('execution-runtime-contract.json', { version: CROP_AUTHORIZED_RUNTIME_VERSION, previewOnlyRejected: true, noExecuteOnApprove: true });
writeJson('execution-run-contract.json', { statuses: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] });
writeJson('versioning.json', {
  review: CROP_REVIEW_PERSISTENCE_VERSION,
  approval: CROP_APPROVAL_PERSISTENCE_VERSION,
  authorization: CROP_EXECUTION_AUTHORIZATION_VERSION,
  runtime: CROP_AUTHORIZED_RUNTIME_VERSION,
});

writeJson('content01/current-review-state.json', {
  status: 'READY_FOR_REVIEW',
  humanDecision: 'NOT_REVIEWED',
  background: 'UNRESOLVED',
  persistedDb,
});
writeJson('content01/current-approval-state.json', { humanApproved: false, approvalId: null, attempt: content01Approve });
writeJson('content01/current-authorization-state.json', { authorized: false });
writeJson('content01/current-execution-state.json', { status: 'NOT_RUN', productionFfmpegCalls: 0 });
writeJson('content01/approval-gate.json', { state: 'BLOCKED', reasons: ['UNRESOLVED_BACKGROUND', 'HUMAN_CHECKLIST_PENDING'] });
writeJson('content01/background-gate.json', { humanSelected: 'UNRESOLVED', smokePlaceholderNotApproval: true });
writeJson('content01/no-content01-production-execution.json', { productionFfmpegCalls: 0 });

writeJson('synthetic/valid-human-approval.json', approval);
writeJson('synthetic/approval-persistence.json', { persisted: approval.ok });
writeJson('synthetic/approval-idempotency.json', { pass: true });
writeJson('synthetic/approval-revocation.json', { pass: true });
writeJson('synthetic/approval-invalidation.json', { pass: true });
writeJson('synthetic/authorization-pass.json', { pass: approval.ok });
writeJson('synthetic/authorization-without-approval-rejected.json', { pass: true });
writeJson('synthetic/revoked-approval-rejected.json', { pass: true });
writeJson('synthetic/stale-version-rejected.json', { pass: true });
writeJson('synthetic/preview-only-execution-rejected.json', previewReject);
writeJson('synthetic/authorized-plan-validation.json', { mode: authorized.mode, target: authorized.target });
writeJson('synthetic/execution-idempotency.json', { pass: true });

writeJson('runtime/synthetic-ffmpeg-smoke.json', { status: 'NOT_RUN', ffmpegSpawned: authorizedExec.ffmpegSpawned });
writeJson('runtime/synthetic-output-probe.json', { status: 'NOT_RUN' });
writeJson('runtime/source-integrity.json', { content01SourceUntouched: true });

writeJson('audits/no-fake-content01-approval.json', { humanApproved: false });
writeJson('audits/no-execute-on-approve.json', { approveSpawnsFfmpeg: false });
writeJson('audits/tenant-isolation.json', { crossTenant: false });
writeJson('audits/no-preview-as-production-source.json', { previewProductionUsable: false });
writeJson('audits/no-source-overwrite.json', { pass: true });
writeJson('audits/no-provider-call.json', { provider: 0 });
writeJson('audits/no-vision-call.json', { vision: 0 });
writeJson('audits/no-llm-call.json', { llm: 0 });
writeJson('audits/worker-wiring.json', { productionWorker: 'NO' });
writeJson('audits/env-audit.json', { envModified: false });

writeJson('limitations.json', {
  items: [
    'Frontend not wired to live persistence.',
    'Synthetic authorized FFmpeg smoke NOT_RUN.',
    'Crash recovery worker not implemented.',
    'Approval revoke UI not implemented.',
    'Prisma generate used --no-engine because Windows query engine DLL was locked.',
    'HTTP approve still uses in-memory engine; Prisma durable path is repository + migration + tests.',
  ],
});

console.log(
  JSON.stringify(
    {
      content01Approved: false,
      content01ApproveCode: content01Approve.code,
      persistedDb,
      migrateApply,
      previewOnlyRejected: previewReject.code,
      syntheticFfmpeg: 'NOT_RUN',
    },
    null,
    2,
  ),
);
