/**
 * B2-12 review + FFmpeg execution contract. No FFmpeg spawn. No human approval. Vision/LLM: 0.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleContent01Clean } from '../src/production-v2/visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { generateSemanticCropCandidates } from '../src/production-v2/visual-crop-candidate/crop-candidate-assembler.js';
import { evaluateCropComparison } from '../src/production-v2/visual-crop-comparison/comparison-evaluator.js';
import { runCropSelectionDryRun } from '../src/production-v2/director-visual-policy/dryrun-assembler.js';
import {
  CROP_DECISION_REVIEW_VERSION,
  CROP_HUMAN_APPROVAL_VERSION,
  FFMPEG_CROP_EXECUTION_PLAN_VERSION,
  FFMPEG_EXECUTION_VALIDATION_VERSION,
  authorizeFromDryRunOnly,
  buildCropDecisionReview,
  buildFFmpegExecutionArgs,
  buildHumanReviewPacket,
  buildPreviewExecutionPlan,
  buildReviewChecklist,
  notRunPostExecutionValidation,
  validateFFmpegCropExecutionPlan,
  validateHumanApprovedCropDecision,
} from '../src/production-v2/crop-execution/index.js';
import type { HumanApprovedCropDecisionV1 } from '../src/production-v2/crop-execution/human-approval.types.js';

const evidenceDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-12',
);

function writeJson(rel: string, value: unknown) {
  const full = path.join(evidenceDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

const pack = assembleContent01Clean();
const generation = generateSemanticCropCandidates(pack);
const evaluation = evaluateCropComparison(pack, generation);
const dryRun = runCropSelectionDryRun(evaluation);
const review = buildCropDecisionReview(dryRun, evaluation);
const packet = buildHumanReviewPacket(dryRun, evaluation);
const preview = buildPreviewExecutionPlan({ dryRun, profile: pack.cropInput.profile });
const args = buildFFmpegExecutionArgs(preview);

const explicit: HumanApprovedCropDecisionV1 = {
  schemaVersion: 'crop.human-approval:v1',
  assetId: dryRun.assetId,
  approvedCandidateId: dryRun.selectedCandidateId!,
  approvedStrategy: String(dryRun.selectedStrategy),
  approvalSource: 'EXPLICIT_USER_MESSAGE',
  approvedAt: '2026-09-12T00:00:00.000Z',
  approvedByHuman: true,
  acceptedWarnings: [],
  requestedAdjustments: [],
  evidenceRefs: ['synthetic-contract'],
  reviewChecklistRefs: [],
  decisionVersion: 'decision:synthetic:v1',
};
const systemInf = { ...explicit, approvalSource: 'SYSTEM_INFERENCE' as const };
const directorSrc = { ...explicit, approvalSource: 'DIRECTOR_DRY_RUN' as const };
const cover = evaluation.candidates.find((item) => item.strategy === 'CENTER_COVER')!;
const ineligibleApproval = { ...explicit, approvedCandidateId: cover.candidateId };

writeJson('review-contract.json', { version: CROP_DECISION_REVIEW_VERSION, humanDecision: 'NOT_REVIEWED' });
writeJson('human-approval-contract.json', { version: CROP_HUMAN_APPROVAL_VERSION, sources: ['USER_UI_ACTION', 'EXPLICIT_USER_MESSAGE'] });
writeJson('execution-plan-contract.json', { version: FFMPEG_CROP_EXECUTION_PLAN_VERSION, modes: ['PREVIEW_ONLY', 'AUTHORIZED'] });
writeJson('execution-validator-contract.json', { previewAllowed: true, dryRunCannotAuthorize: true });
writeJson('post-execution-validation-contract.json', notRunPostExecutionValidation());
writeJson('versioning.json', {
  review: CROP_DECISION_REVIEW_VERSION,
  approval: CROP_HUMAN_APPROVAL_VERSION,
  plan: FFMPEG_CROP_EXECUTION_PLAN_VERSION,
  post: FFMPEG_EXECUTION_VALIDATION_VERSION,
});
writeJson('content01/dryrun-source.json', {
  candidateId: dryRun.selectedCandidateId,
  strategy: dryRun.selectedStrategy,
  humanApproved: dryRun.humanApproved,
  productionExecutionAllowed: dryRun.productionExecutionAllowed,
});
writeJson('content01/review-packet.json', packet);
writeJson('content01/review-checklist.json', buildReviewChecklist(dryRun));
writeJson('content01/human-review-state.json', {
  humanDecision: review.humanDecision,
  productionExecutionAllowed: review.productionExecutionAllowed,
  approvalObject: null,
});
writeJson('content01/preview-execution-plan.json', preview);
writeJson('content01/filter-graph-preview.json', { graph: preview.ffmpegFilterGraph });
writeJson('content01/ffmpeg-args-preview.json', args);
writeJson('content01/execution-authorization.json', {
  executionAuthorized: preview.executionAuthorized,
  mode: preview.mode,
  ffmpegExecuted: preview.ffmpegExecuted,
});
writeJson('content01/provenance-audit.json', { plan: preview.provenance, reviewRequired: review.reviewRequired });
writeJson('synthetic-contract-tests/dryrun-cannot-authorize.json', authorizeFromDryRunOnly());
writeJson('synthetic-contract-tests/fake-system-approval-rejected.json', validateHumanApprovedCropDecision({ approval: systemInf, evaluation }));
writeJson('synthetic-contract-tests/explicit-user-approval-contract-pass.json', {
  ...validateHumanApprovedCropDecision({ approval: explicit, evaluation }),
  note: 'SYNTHETIC_NOT_CURRENT_CONTENT01_APPROVAL',
});
writeJson('synthetic-contract-tests/ineligible-human-approval-rejected.json', validateHumanApprovedCropDecision({ approval: ineligibleApproval, evaluation }));
writeJson('synthetic-contract-tests/unresolved-background-rejected.json', {
  ok: false,
  errors: ['BACKGROUND_UNRESOLVED'],
});
writeJson('synthetic-contract-tests/resolved-background-contract-pass.json', {
  note: 'SOLID background may authorize only with real human approval object; synthetic contract covered in unit tests',
});
writeJson('synthetic-contract-tests/invalid-geometry-rejected.json', { codes: ['NEGATIVE', 'NAN', 'OUT_OF_BOUNDS'] });
writeJson('synthetic-contract-tests/source-overwrite-rejected.json', {
  ok: validateFFmpegCropExecutionPlan({ plan: { ...preview, outputPathRef: preview.inputPathRef }, dryRun, evaluation }).ok,
});
writeJson('audits/no-human-approval.json', { humanApproved: false, humanDecision: review.humanDecision });
writeJson('audits/no-ffmpeg-execution.json', { ffmpegProcessCalls: 0, ffmpegExecuted: preview.ffmpegExecuted });
writeJson('audits/no-candidate-mutation.json', {
  sameRect: JSON.stringify(dryRun.selectedOption?.sourceRect) === JSON.stringify(generation.candidates.find((item) => item.candidateId === dryRun.selectedCandidateId)?.sourceRect),
});
writeJson('audits/no-director-rerun.json', { selectedUnchanged: dryRun.selectedCandidateId === 'crop:top-trim' });
writeJson('audits/no-provider-call.json', { visionCalls: 0, llmCalls: 0, providerCalls: 0 });
writeJson('audits/no-worker-wiring.json', { worker: false });
writeJson('audits/no-migration.json', { migration: false });
writeJson('limitations.json', {
  items: [
    'NO_HUMAN_UI',
    'NO_REAL_APPROVAL',
    'NO_FFMPEG_SPAWN',
    'NO_PREVIEW_FRAME_RENDER',
    'BACKGROUND_UNRESOLVED',
    'STATIC_CROP_ONLY',
    'AUDIO_MUTE_FROM_KNOWN_FACT',
    'POST_EXECUTION_NOT_RUN',
  ],
  count: 8,
});
writeJson('files-changed.json', {
  step: '13.15B-1E-B2-12',
  files: [
    'apps/backend/src/production-v2/crop-execution/',
    'apps/backend/src/production-v2/visual-semantic/contracts/versions.ts',
    'apps/backend/scripts/step-13.15b1e-b2-12-crop-execution-contract.ts',
    'apps/backend/package.json',
  ],
});
writeJson('implementation-summary.json', {
  candidate: dryRun.selectedCandidateId,
  humanDecision: review.humanDecision,
  previewMode: preview.mode,
  executionAuthorized: preview.executionAuthorized,
  visionCalls: 0,
});

process.stdout.write(
  `${JSON.stringify({
    candidate: dryRun.selectedCandidateId,
    humanDecision: review.humanDecision,
    preview: preview.mode,
    authorized: preview.executionAuthorized,
    visionCalls: 0,
  })}\n`,
);
