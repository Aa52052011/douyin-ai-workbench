import type { CropCandidateComparativeEvaluationV1 } from '../visual-crop-comparison/comparison.types.js';
import { isDirectorEligible } from '../visual-crop-comparison/eligibility.js';
import { APPROVAL_SOURCES, FORBIDDEN_APPROVAL_SOURCES, type HumanApprovalValidationResult, type HumanApprovedCropDecisionV1 } from './human-approval.types.js';
import type { ReviewChecklistItem } from './review.types.js';

export const APPROVAL_RULES = {
  SOURCE: 'APPROVAL_SOURCE_MUST_BE_HUMAN',
  HUMAN_FLAG: 'APPROVAL_REQUIRES_APPROVED_BY_HUMAN',
  ELIGIBLE: 'APPROVAL_CANDIDATE_MUST_BE_ELIGIBLE',
  NO_UNSAFE: 'APPROVAL_CANNOT_OVERRIDE_UNSAFE',
  NO_BLOCKED: 'APPROVAL_CANNOT_OVERRIDE_BLOCKED_ASSET',
  CHECKLIST: 'APPROVAL_CHECKLIST_HARD_FAIL_BLOCKS',
  HARD_BLOCK: 'APPROVAL_CANNOT_OVERRIDE_PRIVACY_RIGHTS_TRUTH',
  FIELDS: 'APPROVAL_REQUIRES_TIMESTAMP_CANDIDATE_VERSION',
} as const;

export function validateHumanApprovedCropDecision(input: {
  approval: HumanApprovedCropDecisionV1;
  evaluation: CropCandidateComparativeEvaluationV1;
  checklist?: ReviewChecklistItem[];
  hardBlocks?: string[];
}): HumanApprovalValidationResult {
  const errors: string[] = [];
  const ruleIds = [...Object.values(APPROVAL_RULES)];
  const { approval, evaluation } = input;

  if (!evaluation.decisionAllowed) {
    errors.push('ASSET_BLOCKED');
  }
  if (!APPROVAL_SOURCES.includes(approval.approvalSource as (typeof APPROVAL_SOURCES)[number])) {
    errors.push('INVALID_OR_FORBIDDEN_APPROVAL_SOURCE');
  }
  if ((FORBIDDEN_APPROVAL_SOURCES as readonly string[]).includes(approval.approvalSource)) {
    errors.push(`FORBIDDEN_SOURCE:${approval.approvalSource}`);
  }
  if (!approval.approvedByHuman) errors.push('APPROVED_BY_HUMAN_FALSE');
  if (!approval.approvedAt) errors.push('MISSING_APPROVED_AT');
  if (!approval.approvedCandidateId) errors.push('MISSING_CANDIDATE_ID');
  if (!approval.decisionVersion) errors.push('MISSING_DECISION_VERSION');

  const option = evaluation.candidates.find((item) => item.candidateId === approval.approvedCandidateId);
  if (!option) errors.push('UNKNOWN_CANDIDATE');
  else {
    if (!isDirectorEligible(option.eligibility) || option.safetyStatus === 'UNSAFE') errors.push('INELIGIBLE_OR_UNSAFE');
    if (option.eligibility === 'BLOCKED') errors.push('BLOCKED_CANDIDATE');
  }
  if (input.checklist?.some((item) => item.status === 'FAIL' && (item.id === 'NO_TRUTH_MISREPRESENTATION' || item.id === 'NO_PRIVACY_RIGHTS_BLOCKER'))) {
    errors.push('CHECKLIST_HARD_FAIL');
  }
  if (input.hardBlocks && input.hardBlocks.length > 0) errors.push('HARD_BLOCK_PRESENT');
  if (approval.hardBlockOverrideAttempt) errors.push('HARD_BLOCK_OVERRIDE_FORBIDDEN');

  return { ok: errors.length === 0, errors, ruleIds };
}
