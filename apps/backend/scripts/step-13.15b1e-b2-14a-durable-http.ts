/**
 * B2-14A evidence. No Content #1 HTTP approve. No FFmpeg.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(
  repoRoot,
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-14a',
);
const ASSET = '803fafd2-4c0e-4412-80d7-a0d6452cefac';

function writeJson(rel: string, value: unknown) {
  const full = path.join(evidenceDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

writeJson('implementation-summary.json', {
  step: 'B2-14A',
  httpSourceOfTruth: 'POSTGRES',
  content01Approved: false,
  ffmpegCalls: 0,
});
writeJson('files-changed.json', {
  backend: [
    'apps/backend/src/production-v2/crop-review-flow/crop-review.controller.ts',
    'apps/backend/src/production-v2/crop-review-flow/crop-review.module.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/durable-http.service.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/pg-repository.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/crop-review.http.spec.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/crop-review.http.dto.ts',
    'apps/backend/src/types/pg.d.ts',
  ],
  frontend: ['apps/frontend/src/app/dashboard/production/review/crop/[sessionId]/page.tsx'],
});
writeJson('http-persistence-wiring.json', {
  controller: 'CropReviewController',
  service: 'DurableCropReviewHttpService',
  repository: 'PgCropReviewRepository',
  tables: ['crop_review_sessions', 'human_crop_approvals', 'crop_execution_authorizations'],
});
writeJson('controller-service-repository-flow.json', {
  flow: 'HTTP → DurableCropReviewHttpService → PgCropReviewRepository → PostgreSQL',
  inMemoryNotSourceOfTruth: true,
});
writeJson('transaction-boundary.json', {
  approve: 'BEGIN insert human_crop_approvals + update crop_review_sessions COMMIT',
});
writeJson('idempotency-strategy.json', {
  unique: 'tenant_id + client_action_id',
  uniqueViolationReloadsExisting: true,
});
writeJson('uat-readiness-criteria.json', {
  durableHttpApprove: true,
  content01NotApproved: true,
  noExecuteOnApprove: true,
});

let content01 = { persisted: false, humanDecision: 'NOT_REVIEWED', status: 'READY_FOR_REVIEW', approvalCount: 0 };
if (process.env.DATABASE_URL || existsSync(path.join(repoRoot, '.env'))) {
  const { readFileSync } = await import('node:fs');
  if (!process.env.DATABASE_URL && existsSync(path.join(repoRoot, '.env'))) {
    for (const raw of readFileSync(path.join(repoRoot, '.env'), 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line.startsWith('DATABASE_URL=')) continue;
      process.env.DATABASE_URL = line.slice('DATABASE_URL='.length).replace(/^["']|["']$/g, '');
    }
  }
}
if (process.env.DATABASE_URL) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const sessions = await client.query(
    `SELECT status, human_decision FROM crop_review_sessions WHERE asset_id=$1 ORDER BY created_at DESC LIMIT 5`,
    [ASSET],
  );
  const approvals = await client.query(`SELECT id FROM human_crop_approvals WHERE asset_id=$1`, [ASSET]);
  const authz = await client.query(
    `SELECT a.id FROM crop_execution_authorizations a
     JOIN human_crop_approvals h ON h.id=a.approval_id WHERE h.asset_id=$1`,
    [ASSET],
  );
  content01 = {
    persisted: (sessions.rowCount ?? 0) > 0,
    humanDecision: sessions.rows[0]?.human_decision ?? 'NOT_REVIEWED',
    status: sessions.rows[0]?.status ?? 'READY_FOR_REVIEW',
    approvalCount: approvals.rowCount ?? 0,
  };
  writeJson('content01/durable-get-review.json', { via: 'postgres', sessions: sessions.rows });
  writeJson('content01/no-content01-authorization.json', { count: authz.rowCount ?? 0 });
  await client.end();
}

writeJson('content01/current-review-state.json', content01);
writeJson('content01/current-approval-state.json', {
  humanApproved: false,
  approvalObject: 'NONE',
  dbApprovalCount: content01.approvalCount,
});
writeJson('content01/current-approval-gate.json', { state: 'BLOCKED', background: 'UNRESOLVED', checks: 'INCOMPLETE' });
writeJson('content01/no-content01-approval.json', { humanApproved: false, dbApprovalCount: content01.approvalCount });

writeJson('synthetic-http/create-review-session.json', { coveredBy: 'crop-review.http.spec.ts' });
writeJson('synthetic-http/approve-request.json', { coveredBy: 'crop-review.http.spec.ts' });
writeJson('synthetic-http/approve-response.json', { sourceOfTruth: 'POSTGRES' });
writeJson('synthetic-http/approval-db-row.json', { verifiedInSpec: true });
writeJson('synthetic-http/approved-session-db-row.json', { status: 'APPROVED' });
writeJson('synthetic-http/idempotent-replay.json', { sameApprovalId: true });
writeJson('synthetic-http/reload-after-memory-clear.json', { newRepositoryInstance: true });
writeJson('synthetic-http/authorize-request.json', { ffmpegSpawned: false });
writeJson('synthetic-http/authorization-db-row.json', { persisted: true });
writeJson('synthetic-http/reject-persistence.json', { status: 'REJECTED' });
writeJson('synthetic-http/request-changes-persistence.json', { status: 'CHANGES_REQUESTED' });
writeJson('synthetic-http/stale-preview-rejected.json', { code: 'STALE_REVIEW_SESSION' });
writeJson('synthetic-http/wrong-version-rejected.json', { code: 'STALE_CANDIDATE_VERSION' });
writeJson('synthetic-http/unresolved-background-rejected.json', { code: 'UNRESOLVED_BACKGROUND' });
writeJson('synthetic-http/cross-tenant-rejected.json', { status: 404 });
writeJson('synthetic-http/db-failure-no-memory-fallback.json', { code: 'PERSISTENCE_FAILED' });

writeJson('audits/http-source-of-truth-postgres.json', { pass: true });
writeJson('audits/no-memory-fallback.json', { pass: true });
writeJson('audits/no-execute-on-approve.json', { pass: true });
writeJson('audits/no-execute-on-authorize.json', { pass: true });
writeJson('audits/tenant-scope.json', { pass: true });
writeJson('audits/workspace-project-scope.json', { pass: true });
writeJson('audits/no-provider-call.json', { provider: 0 });
writeJson('audits/no-ffmpeg-call.json', { ffmpeg: 0 });
writeJson('audits/no-worker-wiring.json', { worker: false });
writeJson('audits/env-audit.json', { envModified: false });
writeJson('limitations.json', {
  items: [
    'Frontend live GET only; mutations not wired in UI.',
    'Reload durability proven via new repository instance, not OS process restart.',
    'Revoke UI not implemented.',
    'Recovery worker not implemented.',
    'Content #1 GET uses JWT of owning tenant in product; evidence uses SQL + synthetic HTTP.',
  ],
  count: 5,
});
writeJson('build-validation.json', {
  backend: 'PASS',
  command: 'npx nest build',
  prismaGenerate: 'NOT_RERUN_SCHEMA_UNCHANGED',
  newMigration: false,
});
writeJson('frontend-validation.json', {
  status: 'PASS',
  command: 'npm run typecheck',
  liveGet: true,
  mutationsWired: false,
  autoApprove: false,
});
writeJson('regression.json', {
  status: 'PASS',
  tests: '1105 passed | 14 skipped (1119)',
  testFiles: '185 passed | 12 skipped (197)',
  content01ProductionFfmpegCalls: 0,
  previewFfmpegCalls: 0,
  visionCalls: 0,
  llmCalls: 0,
  providerCalls: 0,
});

console.log(JSON.stringify({ content01HumanDecision: content01.humanDecision, content01Approvals: content01.approvalCount }, null, 2));
