import type { CropCandidateComparativeEvaluationV1 } from '../visual-crop-comparison/comparison.types.js';
import type { CropSelectionDryRunResultV1 } from '../director-visual-policy/policy.types.js';
import { assertNoNonUniformStretch } from './ffmpeg-filter-builder.js';
import { validateHumanApprovedCropDecision } from './human-approval-validator.js';
import type { HumanApprovedCropDecisionV1 } from './human-approval.types.js';
import type { FFmpegCropExecutionPlanV1, PlanValidationResult } from './execution-plan.types.js';
import type { ReviewChecklistItem } from './review.types.js';
import { assertPixelCrop } from './pixel-align.js';

export function validateFFmpegCropExecutionPlan(input: {
  plan: FFmpegCropExecutionPlanV1;
  dryRun: CropSelectionDryRunResultV1;
  evaluation: CropCandidateComparativeEvaluationV1;
  approval?: HumanApprovedCropDecisionV1 | null;
  checklist?: ReviewChecklistItem[];
}): PlanValidationResult {
  const errors: string[] = [];
  const ruleIds = [
    'PLAN_TARGET_1080x1920',
    'PLAN_NO_STRETCH',
    'PLAN_NO_SOURCE_OVERWRITE',
    'PLAN_GEOMETRY',
    'PLAN_AUTHORIZATION',
    'PLAN_BACKGROUND',
    'PLAN_AUDIO',
  ];
  const { plan } = input;
  if (plan.target.width !== 1080 || plan.target.height !== 1920 || plan.target.aspectRatio !== '9:16') errors.push('INVALID_TARGET');
  if (plan.inputPathRef === plan.outputPathRef) errors.push('SOURCE_OVERWRITE');
  if (plan.scale.mode !== 'UNIFORM') errors.push('NON_UNIFORM_SCALE_MODE');
  if (plan.audioPolicy !== 'MUTE_SOURCE_AUDIO') errors.push('INVALID_AUDIO_POLICY');
  if (plan.trim !== 'NONE') errors.push('TRIM_NOT_ALLOWED');
  if (plan.crop) {
    try {
      assertPixelCrop(plan.crop, plan.source.width, plan.source.height);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'GEOMETRY');
    }
  }
  try {
    assertNoNonUniformStretch(plan);
  } catch {
    errors.push('NON_UNIFORM_STRETCH');
  }
  const needsPad = Boolean(plan.pad?.enabled || input.dryRun.requiresBackgroundTreatment);
  if (plan.mode === 'PREVIEW_ONLY') {
    if (plan.executionAuthorized) errors.push('PREVIEW_CANNOT_BE_AUTHORIZED');
    if (plan.productionExecutionAllowed) errors.push('PREVIEW_CANNOT_ALLOW_PRODUCTION');
    if (plan.approvedDecisionRef) errors.push('PREVIEW_MUST_NOT_CLAIM_APPROVAL_REF');
  }
  if (plan.mode === 'AUTHORIZED') {
    if (!input.approval) errors.push('AUTHORIZED_REQUIRES_HUMAN_APPROVAL_OBJECT');
    else {
      const approval = validateHumanApprovedCropDecision({
        approval: input.approval,
        evaluation: input.evaluation,
        checklist: input.checklist,
      });
      if (!approval.ok) errors.push(...approval.errors.map((item) => `APPROVAL:${item}`));
      if (input.approval.approvedCandidateId !== input.dryRun.selectedCandidateId) {
        const option = input.evaluation.candidates.find((item) => item.candidateId === input.approval?.approvedCandidateId);
        if (!option || option.safetyStatus === 'UNSAFE' || option.eligibility === 'INELIGIBLE') {
          errors.push('AUTHORIZED_INELIGIBLE_CANDIDATE');
        }
      }
    }
    if (needsPad && (!plan.pad || plan.pad.backgroundTreatment === 'UNRESOLVED')) {
      errors.push('BACKGROUND_UNRESOLVED');
    }
    if (!plan.approvedDecisionRef) errors.push('MISSING_APPROVED_DECISION_REF');
    if (!plan.executionAuthorized) errors.push('AUTHORIZED_FLAG_FALSE');
  }
  if (plan.ffmpegExecuted || plan.outputFileCreated) errors.push('PLAN_MUST_NOT_CLAIM_EXECUTION');
  return { ok: errors.length === 0, errors, ruleIds };
}

export function authorizeFromDryRunOnly(): PlanValidationResult {
  return {
    ok: false,
    errors: ['DRY_RUN_CANNOT_AUTHORIZE', 'MISSING_HUMAN_APPROVAL'],
    ruleIds: ['PLAN_AUTHORIZATION'],
  };
}
