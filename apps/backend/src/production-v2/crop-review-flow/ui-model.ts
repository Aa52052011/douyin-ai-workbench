import { CROP_REVIEW_UI_VERSION, SELECTABLE_BACKGROUNDS, type CropReviewSessionV1, type CropReviewUiModelV1, type ReviewFlowContext } from './review-flow.types.js';

export function approveButtonState(session: CropReviewSessionV1): { enabled: boolean; reason: string } {
  if (session.status === 'APPROVED') return { enabled: false, reason: 'ALREADY_APPROVED' };
  if (session.status === 'REJECTED') return { enabled: false, reason: 'SESSION_REJECTED' };
  if (session.status === 'CHANGES_REQUESTED') return { enabled: false, reason: 'CHANGES_REQUESTED' };
  if (session.status === 'EXPIRED' || session.status === 'INVALIDATED') return { enabled: false, reason: session.status };
  if (session.backgroundTreatment === 'UNRESOLVED') return { enabled: false, reason: 'BACKGROUND_UNRESOLVED' };
  if (session.previewStatus !== 'READY') return { enabled: false, reason: `PREVIEW_${session.previewStatus}` };
  const pending = session.requiredChecklist.filter((item) => item.kind === 'HUMAN_CONFIRM_REQUIRED' && item.interaction !== 'CONFIRMED_HUMAN');
  if (pending.length) return { enabled: false, reason: 'HUMAN_CHECKLIST_PENDING' };
  if (session.status !== 'READY_FOR_REVIEW') return { enabled: false, reason: `STATUS_${session.status}` };
  return { enabled: true, reason: 'GATES_PASSED' };
}

export function buildReviewUiModel(session: CropReviewSessionV1, ctx: ReviewFlowContext): CropReviewUiModelV1 {
  const button = approveButtonState(session);
  return {
    schemaVersion: CROP_REVIEW_UI_VERSION,
    sessionId: session.sessionId,
    assetSummary: { assetId: session.assetId },
    candidateStrategy: ctx.packet.dryRunStrategy ?? session.candidateId,
    previewMediaRef: session.previewId ? `preview-ref:${session.previewId}` : null,
    geometrySummary: ctx.packet.geometry,
    evidencePreservation: ctx.packet.evidenceSummary.evidence,
    mobileReadability: ctx.packet.evidenceSummary.readability,
    temporalStability: ctx.packet.evidenceSummary.temporal,
    browserChromeExclusion: ctx.packet.evidenceSummary.chromeExclusion,
    paddingBackgroundRequirement: Boolean(ctx.packet.backgroundRequirement),
    warnings: session.warnings,
    reviewChecklist: session.requiredChecklist,
    backgroundSelector: { value: session.backgroundTreatment, suggested: SELECTABLE_BACKGROUNDS, defaultSelected: false },
    approveButton: button,
    rejectEnabled: session.humanDecision === 'NOT_REVIEWED',
    requestChangesEnabled: session.humanDecision === 'NOT_REVIEWED',
    eligibleAlternatives: ctx.eligible.map((item) => ({ candidateId: item.candidateId, strategy: item.strategy, variant: item.variant })),
    ineligibleAlternatives: ctx.ineligible,
    autoApproveOnLoad: false,
    warningsDefaultAccepted: false,
  };
}
