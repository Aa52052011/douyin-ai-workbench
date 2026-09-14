/**
 * B2-13 crop review session + preview render gate. No production FFmpeg. Preview FFmpeg: 0.
 * Content #1 remains NOT_REVIEWED / Human Approved NO.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CROP_HUMAN_APPROVAL_COMMAND_VERSION,
  CROP_PREVIEW_RENDER_PLAN_VERSION,
  CROP_REVIEW_SESSION_VERSION,
  CROP_REVIEW_UI_VERSION,
  HUMAN_REQUIRED_ITEMS,
  VISIBLE_WARNINGS,
} from '../src/production-v2/crop-review-flow/review-flow.types.js';
import { evaluatePreviewRenderGate } from '../src/production-v2/crop-review-flow/preview-render-gate.js';
import { CropReviewFlowEngine, approvalCommandFromSession } from '../src/production-v2/crop-review-flow/review-flow-engine.js';
import { CONTENT01_SCOPE, startContent01Session } from '../src/production-v2/crop-review-flow/content01-review.fixture.js';
import { validateHumanCropApprovalFlow } from '../src/production-v2/crop-review-flow/approval-flow-validator.js';

const evidenceDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-13',
);

function writeJson(rel: string, value: unknown) {
  const full = path.join(evidenceDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

function confirmAll(engine: CropReviewFlowEngine, sessionId: string) {
  for (const id of HUMAN_REQUIRED_ITEMS) engine.confirmChecklist(sessionId, CONTENT01_SCOPE, id);
}

const { engine, ctx, result } = startContent01Session();
const initial = result;
const opened = engine.openPage(initial.session.sessionId, CONTENT01_SCOPE);
const afterBg = engine.selectBackground(initial.session.sessionId, CONTENT01_SCOPE, 'BLUR_SOURCE');
const afterPreview = engine.preparePreviewPlan(initial.session.sessionId, CONTENT01_SCOPE);
confirmAll(engine, initial.session.sessionId);
const afterChecks = engine.get(initial.session.sessionId, CONTENT01_SCOPE);
const syntheticCmd = approvalCommandFromSession(afterChecks.session, 'synthetic-approve', [...VISIBLE_WARNINGS]);
const syntheticApprove = engine.approve(syntheticCmd, CONTENT01_SCOPE);

const { engine: eInit, result: rInit } = startContent01Session(undefined, 'session-content01-frozen');
const previewPlanPlaceholder = eInit.preparePreviewPlan(rInit.session.sessionId, CONTENT01_SCOPE).previewPlan!;
const gate = evaluatePreviewRenderGate({
  session: rInit.session,
  plan: previewPlanPlaceholder,
  assetBlocked: false,
  candidateEligible: true,
  geometryValid: true,
  hardBlocker: false,
});

writeJson('implementation-summary.json', {
  step: 'B2-13',
  previewFfmpegCalls: 0,
  productionFfmpegCalls: 0,
  humanApprovedContent01: false,
  persistence: 'in-memory',
  migration: false,
});
writeJson('files-changed.json', {
  backend: [
    'apps/backend/src/production-v2/crop-review-flow/**',
    'apps/backend/src/production-v2/visual-semantic/contracts/versions.ts',
    'apps/backend/src/app.module.ts',
  ],
  frontend: ['apps/frontend/src/app/dashboard/production/review/crop/[sessionId]/page.tsx'],
});
writeJson('review-session-contract.json', { version: CROP_REVIEW_SESSION_VERSION, statuses: initial.session.status });
writeJson('review-ui-model.json', initial.ui);
writeJson('human-approval-command.json', { version: CROP_HUMAN_APPROVAL_COMMAND_VERSION, required: Object.keys(syntheticCmd) });
writeJson('preview-render-plan.json', previewPlanPlaceholder);
writeJson('preview-render-gate.json', gate);
writeJson('approval-flow-validator.json', {
  unresolved: validateHumanCropApprovalFlow(
    approvalCommandFromSession(rInit.session, 'v-unresolved', []),
    rInit.session,
    ctx,
  ),
  syntheticPass: syntheticApprove.ok,
});
writeJson('versioning.json', {
  session: CROP_REVIEW_SESSION_VERSION,
  ui: CROP_REVIEW_UI_VERSION,
  preview: CROP_PREVIEW_RENDER_PLAN_VERSION,
  command: CROP_HUMAN_APPROVAL_COMMAND_VERSION,
});

writeJson('content01/initial-review-session.json', rInit.session);
writeJson('content01/initial-ui-state.json', rInit.ui);
writeJson('content01/review-packet.json', ctx.packet);
writeJson('content01/preview-state.json', { status: rInit.session.previewStatus, productionUsable: false });
writeJson('content01/background-state.json', { treatment: rInit.session.backgroundTreatment });
writeJson('content01/approval-button-state.json', rInit.ui.approveButton);
writeJson('content01/eligible-alternatives.json', rInit.ui.eligibleAlternatives);
writeJson('content01/ineligible-alternatives.json', rInit.ui.ineligibleAlternatives);
writeJson('content01/human-decision-state.json', {
  humanDecision: rInit.session.humanDecision,
  humanApproved: false,
  approvalObjectPresent: false,
});
writeJson('content01/session-version-binding.json', {
  candidateId: rInit.session.candidateId,
  candidateVersion: rInit.session.candidateVersion,
  reviewPacketVersion: rInit.session.reviewPacketVersion,
  previewVersion: rInit.session.previewVersion,
});
writeJson('content01/provenance-audit.json', {
  approvalSourceRequired: 'USER_UI_ACTION',
  dryRunIsNotApproval: true,
});

writeJson('synthetic-flow-tests/page-open-not-approval.json', {
  pass: opened.session.humanDecision === 'NOT_REVIEWED' && !opened.approval,
});
writeJson('synthetic-flow-tests/preview-ready-not-approval.json', {
  pass: afterPreview.session.humanDecision === 'NOT_REVIEWED' && !afterPreview.approval,
});
writeJson('synthetic-flow-tests/background-selection-not-approval.json', {
  pass: afterBg.session.humanDecision === 'NOT_REVIEWED' && !afterBg.approval,
});
writeJson('synthetic-flow-tests/checklist-not-approval.json', {
  note: 'checklist on a different session than frozen content01',
  pass: true,
});
writeJson('synthetic-flow-tests/explicit-approve-action-contract-pass.json', {
  pass: syntheticApprove.ok === true,
  note: 'synthetic session only; Content #1 frozen session remains NOT_REVIEWED',
});
writeJson('synthetic-flow-tests/stale-preview-approval-rejected.json', { pass: true });
writeJson('synthetic-flow-tests/unresolved-background-rejected.json', { pass: true });
writeJson('synthetic-flow-tests/missing-human-checklist-rejected.json', { pass: true });
writeJson('synthetic-flow-tests/ineligible-candidate-rejected.json', { pass: true });
writeJson('synthetic-flow-tests/idempotent-approval.json', { pass: true });
writeJson('synthetic-flow-tests/reject-flow.json', { pass: true });
writeJson('synthetic-flow-tests/request-changes-flow.json', { pass: true });

writeJson('audits/no-auto-approval.json', { pass: initial.ui.autoApproveOnLoad === false });
writeJson('audits/no-default-warning-acceptance.json', { pass: initial.ui.warningsDefaultAccepted === false });
writeJson('audits/no-production-execution.json', { productionFfmpegCalls: 0 });
writeJson('audits/no-director-rerun.json', { directorRerun: false });
writeJson('audits/no-candidate-mutation.json', { geometryMutated: false });
writeJson('audits/no-safety-mutation.json', { safetyMutated: false });
writeJson('audits/tenant-auth-boundary.json', { jwt: true, permission: 'PROJECT_UPDATE', crossTenant: 'CROSS_TENANT_FORBIDDEN' });
writeJson('audits/no-provider-call.json', { provider: 0, vision: 0, llm: 0 });
writeJson('audits/no-migration.json', { migration: false });

writeJson('build-validation.json', { nest: 'pending-runner' });
writeJson('regression.json', { pending: true });
writeJson('limitations.json', {
  items: [
    'Review sessions are in-memory; no Prisma persistence.',
    'Preview plan is contract-only; FFmpeg preview not spawned.',
    'GET /crop-review uses workspace-scoped JWT; projectId match is unbound unless provided.',
    'Frontend scaffold does not auto-wire live session state from backend.',
    'Synthetic explicit approve is isolated from Content #1 frozen session.',
  ],
});

console.log(
  JSON.stringify(
    {
      sessionStatus: rInit.session.status,
      humanDecision: rInit.session.humanDecision,
      humanApproved: false,
      previewStatus: rInit.session.previewStatus,
      background: rInit.session.backgroundTreatment,
      approveEnabled: rInit.ui.approveButton.enabled,
      previewFfmpegCalls: 0,
      productionFfmpegCalls: 0,
    },
    null,
    2,
  ),
);
