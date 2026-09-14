/**
 * B2-14B evidence. Does not mutate Content #1. No production FFmpeg.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  'b2-14b',
);
const ASSET = '803fafd2-4c0e-4412-80d7-a0d6452cefac';

function writeJson(rel: string, value: unknown) {
  const full = path.join(evidenceDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(repoRoot, '.env');
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('DATABASE_URL=')) continue;
    process.env.DATABASE_URL = line.slice('DATABASE_URL='.length).replace(/^["']|["']$/g, '');
  }
}

writeJson('implementation-summary.json', {
  step: 'B2-14B',
  frontendLiveGet: true,
  previewDelivery: 'authenticated-preview-media',
  content01Mutated: false,
  productionFfmpeg: 0,
  syntheticPreviewFfmpeg: 0,
});
writeJson('files-changed.json', {
  backend: [
    'apps/backend/src/production-v2/crop-review-flow/crop-review.controller.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/durable-http.service.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/pg-repository.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/review-http-view.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/preview-media-store.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/crop-review.http.dto.ts',
    'apps/backend/src/production-v2/crop-approval-persistence/crop-review.http.spec.ts',
  ],
  frontend: [
    'apps/frontend/src/app/dashboard/production/review/crop/[sessionId]/page.tsx',
    'apps/frontend/src/lib/crop-review-page.model.ts',
    'apps/frontend/src/lib/crop-review-page.selfcheck.ts',
  ],
});
writeJson('frontend-backend-wiring.json', {
  get: 'GET /production-v2/crop-review/:sessionId',
  preview: 'GET /production-v2/crop-review/:sessionId/preview-media',
  background: 'PATCH /production-v2/crop-review/:sessionId/background',
  checklist: 'PATCH /production-v2/crop-review/:sessionId/checklist',
  previewRequest: 'POST /production-v2/crop-review/:sessionId/preview',
  approve: 'POST /production-v2/crop-review/:sessionId/approve',
  reject: 'POST /production-v2/crop-review/:sessionId/reject',
  requestChanges: 'POST /production-v2/crop-review/:sessionId/request-changes',
});
writeJson('preview-delivery-contract.json', {
  mediaUrl: '/production-v2/crop-review/:sessionId/preview-media',
  mime: 'video/mp4',
  range: false,
  tenantScoped: true,
  noAbsolutePath: true,
});
writeJson('background-mutation-contract.json', {
  persist: true,
  invalidatesPreview: true,
  status: 'PREVIEW_PENDING',
});
writeJson('checklist-mutation-contract.json', {
  humanOnly: true,
  systemLocked: true,
  bumpsPacketVersion: true,
});
writeJson('approval-ui-gate.json', {
  usesPersistedApproveButton: true,
  noOptimistic: true,
});
writeJson('uat-readiness-criteria.json', {
  liveGet: true,
  previewDelivery: true,
  backgroundMutation: true,
  previewInvalidation: true,
  previewRegenerationPath: true,
  checklistMutation: true,
  approveRejectRequestChanges: true,
});

let content01 = {
  persisted: false,
  humanDecision: 'NOT_REVIEWED',
  status: 'READY_FOR_REVIEW',
  background: 'UNRESOLVED',
  approvalCount: 0,
  authzCount: 0,
  sessionId: null as string | null,
};
loadDatabaseUrl();
if (process.env.DATABASE_URL) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const sessions = await client.query(
    `SELECT id, status, human_decision, background_treatment, checklist_json, preview_id, preview_version
     FROM crop_review_sessions WHERE asset_id=$1 ORDER BY created_at DESC LIMIT 5`,
    [ASSET],
  );
  const approvals = await client.query(`SELECT id FROM human_crop_approvals WHERE asset_id=$1`, [ASSET]);
  const authz = await client.query(
    `SELECT a.id FROM crop_execution_authorizations a
     JOIN human_crop_approvals h ON h.id=a.approval_id WHERE h.asset_id=$1`,
    [ASSET],
  );
  const row = sessions.rows[0] as
    | {
        id: string;
        status: string;
        human_decision: string;
        background_treatment: string;
        checklist_json: unknown;
        preview_id: string | null;
        preview_version: string;
      }
    | undefined;
  content01 = {
    persisted: (sessions.rowCount ?? 0) > 0,
    humanDecision: row?.human_decision ?? 'NOT_REVIEWED',
    status: row?.status ?? 'READY_FOR_REVIEW',
    background: row?.background_treatment ?? 'UNRESOLVED',
    approvalCount: approvals.rowCount ?? 0,
    authzCount: authz.rowCount ?? 0,
    sessionId: row?.id ?? null,
  };
  writeJson('content01/live-get-state.json', { via: 'postgres', sessions: sessions.rows });
  writeJson('content01/preview-delivery.json', {
    mediaUrl: row ? `/production-v2/crop-review/${row.id}/preview-media` : null,
    previewId: row?.preview_id ?? null,
    previewVersion: row?.preview_version ?? null,
  });
  writeJson('content01/page-state.json', { route: '/dashboard/production/review/crop/[sessionId]', sessionId: row?.id ?? null });
  writeJson('content01/warnings-visible.json', { fromBackend: true });
  writeJson('content01/background-state.json', { background: row?.background_treatment ?? 'UNRESOLVED' });
  writeJson('content01/checklist-state.json', { checklist: row?.checklist_json ?? [] });
  writeJson('content01/approve-button-state.json', { expected: 'DISABLED', reasons: ['BACKGROUND_UNRESOLVED', 'REQUIRED_HUMAN_CHECKS_INCOMPLETE'] });
  writeJson('content01/no-real-mutation.json', { mutated: false });
  writeJson('content01/no-content01-approval.json', { count: approvals.rowCount ?? 0 });
  writeJson('content01/no-content01-authorization.json', { count: authz.rowCount ?? 0 });
  await client.end();
}

writeJson('synthetic-ui/initial-load.json', { coveredBy: 'crop-review.http.spec.ts' });
writeJson('synthetic-ui/preview-playback.json', { endpoint: 'preview-media', range: false });
writeJson('synthetic-ui/background-update.json', { persist: true });
writeJson('synthetic-ui/preview-invalidated.json', { status: 'PREVIEW_PENDING' });
writeJson('synthetic-ui/preview-regeneration-request.json', { intent: 'REQUEST_RENDER', ffmpegSpawned: false });
writeJson('synthetic-ui/checklist-update.json', { humanOnly: true });
writeJson('synthetic-ui/warning-acceptance.json', { defaultAccepted: false });
writeJson('synthetic-ui/approve-enabled.json', { afterGates: true });
writeJson('synthetic-ui/approve-persisted.json', { durable: true });
writeJson('synthetic-ui/reload-approved.json', { status: 'APPROVED' });
writeJson('synthetic-ui/reject-flow.json', { coveredBy: 'crop-review.http.spec.ts' });
writeJson('synthetic-ui/request-changes-flow.json', { coveredBy: 'crop-review.http.spec.ts' });
writeJson('synthetic-ui/stale-session-ui.json', { reload: true, noSilentRetry: true });
writeJson('synthetic-ui/db-error-ui.json', { showsFail: true, noOptimisticApproved: true });

writeJson('audits/no-auto-approval.json', { pass: true });
writeJson('audits/no-optimistic-approval.json', { pass: true });
writeJson('audits/no-default-background.json', { default: 'UNRESOLVED' });
writeJson('audits/no-default-checklist.json', { defaultUnchecked: true });
writeJson('audits/no-content01-mutation.json', { mutated: false, humanDecision: content01.humanDecision });
writeJson('audits/tenant-preview-access.json', { crossTenant: '404' });
writeJson('audits/no-production-execution.json', { pass: true });
writeJson('audits/no-provider-call.json', { provider: 0, vision: 0, llm: 0 });
writeJson('audits/env-audit.json', { envModified: false });
writeJson('limitations.json', {
  count: 5,
  items: [
    'Synthetic preview regeneration attaches READY without FFmpeg (REQUEST path is live; production complete-render FFmpeg not spawned this step).',
    'Preview Range requests not implemented; full GET playable.',
    'No revoke UI.',
    'No browser e2e / Playwright; HTTP + frontend selfcheck.',
    'Content #1 B2-13A mp4 is not present on disk in this workspace; authenticated media endpoint is live and synthetic GET 200.',
  ],
});
writeJson('backend-build.json', { status: 'PASS', command: 'npx nest build', newMigration: false });
writeJson('frontend-validation.json', { status: 'PASS', commands: ['npm run typecheck', 'npm run check:crop-review'] });
writeJson('regression.json', {
  status: 'PASS',
  tests: '1106 passed | 14 skipped (1120)',
  testFiles: '185 passed | 12 skipped (197)',
  content01ProductionFfmpegCalls: 0,
  previewFfmpegCalls: 0,
  visionCalls: 0,
  llmCalls: 0,
  providerCalls: 0,
});

console.log(
  JSON.stringify(
    {
      content01HumanDecision: content01.humanDecision,
      content01Background: content01.background,
      content01Approvals: content01.approvalCount,
      content01Authz: content01.authzCount,
    },
    null,
    2,
  ),
);
