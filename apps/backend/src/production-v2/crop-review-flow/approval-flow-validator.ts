import { HUMAN_REQUIRED_ITEMS, type CropReviewSessionV1, type HumanCropApprovalCommandV1 } from './review-flow.types.js';
import { CROP_HUMAN_APPROVAL_COMMAND_VERSION } from './review-flow.types.js';
import type { ReviewFlowContext } from './review-flow.types.js';
import { approveButtonState } from './ui-model.js';

export type HumanCropApprovalFlowValidatorV1 = {
  ok: boolean;
  code?: string;
  errors: string[];
};

export function validateHumanCropApprovalFlow(
  command: HumanCropApprovalCommandV1,
  session: CropReviewSessionV1,
  ctx: ReviewFlowContext,
): HumanCropApprovalFlowValidatorV1 {
  const errors: string[] = [];
  let code: string | undefined;
  const fail = (next: string) => {
    errors.push(next);
    code ??= next;
  };
  if (command.schemaVersion !== CROP_HUMAN_APPROVAL_COMMAND_VERSION) fail('INVALID_COMMAND_VERSION');
  if (command.explicitAction !== 'APPROVE') fail('NOT_EXPLICIT_APPROVE');
  if (command.approvalSource !== 'USER_UI_ACTION') fail('INVALID_APPROVAL_SOURCE');
  if (session.status === 'REJECTED') fail('SESSION_REJECTED');
  if (session.status === 'CHANGES_REQUESTED') fail('CHANGES_REQUESTED');
  if (session.status === 'EXPIRED') fail('SESSION_EXPIRED');
  if (session.status === 'INVALIDATED') fail('SESSION_INVALIDATED');
  if (command.previewVersion !== session.previewVersion || command.candidateVersion !== session.candidateVersion) fail('STALE_REVIEW_SESSION');
  if (command.reviewPacketVersion !== session.reviewPacketVersion) fail('STALE_REVIEW_PACKET');
  if (ctx.ineligible.some((item) => item.candidateId === command.candidateId)) fail('INELIGIBLE_CANDIDATE');
  if (command.candidateId !== session.candidateId) fail('CANDIDATE_MISMATCH');
  if (!ctx.eligible.some((item) => item.candidateId === command.candidateId)) fail('INELIGIBLE_CANDIDATE');
  if (session.backgroundTreatment === 'UNRESOLVED' || command.backgroundTreatmentSelection === 'UNRESOLVED') fail('UNRESOLVED_BACKGROUND');
  if (command.backgroundTreatmentSelection !== session.backgroundTreatment) fail('BACKGROUND_MISMATCH');
  if (session.previewStatus !== 'READY') fail('PREVIEW_NOT_READY');
  if (session.requiredChecklist.some((item) => HUMAN_REQUIRED_ITEMS.includes(item.id) && item.interaction !== 'CONFIRMED_HUMAN')) {
    fail('MISSING_HUMAN_CHECKLIST');
  }
  const gate = approveButtonState(session);
  if (!gate.enabled) fail(gate.reason);
  return { ok: errors.length === 0, code, errors };
}
