import type { CropPreviewRenderPlanV1, CropReviewSessionV1 } from './review-flow.types.js';
import { SELECTABLE_BACKGROUNDS } from './review-flow.types.js';

export type PreviewGateResult = {
  ok: boolean;
  errors: string[];
  ruleIds: string[];
};

export function evaluatePreviewRenderGate(input: {
  session: CropReviewSessionV1;
  plan?: CropPreviewRenderPlanV1;
  assetBlocked: boolean;
  candidateEligible: boolean;
  geometryValid: boolean;
  hardBlocker: boolean;
}): PreviewGateResult {
  const errors: string[] = [];
  if (input.assetBlocked) errors.push('ASSET_BLOCKED');
  if (!input.candidateEligible) errors.push('CANDIDATE_INELIGIBLE');
  if (!input.geometryValid) errors.push('INVALID_GEOMETRY');
  if (input.hardBlocker) errors.push('HARD_BLOCKER');
  if (input.session.status === 'EXPIRED') errors.push('SESSION_EXPIRED');
  if (input.session.status === 'INVALIDATED') errors.push('SESSION_INVALIDATED');
  if (input.plan) {
    if (input.plan.productionUsable) errors.push('PREVIEW_MUST_NOT_BE_PRODUCTION_USABLE');
    if (!input.plan.previewOnly) errors.push('PREVIEW_ONLY_REQUIRED');
    if (input.plan.mode !== 'PREVIEW_REVIEW_ONLY') errors.push('INVALID_PREVIEW_MODE');
    if (input.plan.outputRef === `asset:${input.session.assetId}`) errors.push('SOURCE_OVERWRITE');
    if (!input.plan.outputRef.startsWith('review-preview/')) errors.push('OUTPUT_NOT_ISOLATED');
    if (input.plan.backgroundTreatment === 'UNRESOLVED' && input.session.backgroundTreatment !== 'UNRESOLVED') {
      errors.push('BACKGROUND_MISMATCH');
    }
  }
  return { ok: errors.length === 0, errors, ruleIds: ['PREVIEW_GATE_ELIGIBLE', 'PREVIEW_GATE_ISOLATED_OUTPUT', 'PREVIEW_GATE_NOT_PRODUCTION'] };
}

export function isSelectableBackground(value: string): boolean {
  return (SELECTABLE_BACKGROUNDS as readonly string[]).includes(value);
}
