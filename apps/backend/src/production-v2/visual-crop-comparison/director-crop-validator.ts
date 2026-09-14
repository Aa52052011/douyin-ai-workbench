import type { CropCandidateComparativeEvaluationV1, DirectorContractValidationResult, DirectorCropDecisionV1 } from './comparison.types.js';
import { DIRECTOR_OBJECTIVES } from './comparison.types.js';
import { isDirectorEligible } from './eligibility.js';
import { COMPARISON_RULE_IDS } from './thresholds.js';

export function validateDirectorCropDecision(
  evaluation: CropCandidateComparativeEvaluationV1,
  decision: DirectorCropDecisionV1,
): DirectorContractValidationResult {
  const errors: string[] = [];
  const ruleIds: string[] = [COMPARISON_RULE_IDS.CONTRACT_ELIGIBLE_ONLY];

  if (!evaluation.decisionAllowed) {
    errors.push('DECISION_NOT_ALLOWED_FOR_BLOCKED_ASSET');
    ruleIds.push(COMPARISON_RULE_IDS.CONTRACT_NO_BLOCKED);
    return { ok: false, errors, ruleIds };
  }

  if (!DIRECTOR_OBJECTIVES.includes(decision.objective)) {
    errors.push('INVALID_OBJECTIVE');
  }

  if (!decision.rationale?.text?.trim()) {
    errors.push('MISSING_RATIONALE');
    ruleIds.push(COMPARISON_RULE_IDS.CONTRACT_RATIONALE);
  }
  if (!decision.rationale?.sourceRefs?.length) {
    errors.push('MISSING_RATIONALE_SOURCE_REFS');
    ruleIds.push(COMPARISON_RULE_IDS.CONTRACT_RATIONALE);
  }

  if (decision.selectedCandidateId === 'REQUEST_NEW_CANDIDATE') {
    return { ok: errors.length === 0, errors, ruleIds };
  }

  const option = evaluation.candidates.find((item) => item.candidateId === decision.selectedCandidateId);
  if (!option) {
    errors.push('UNKNOWN_CANDIDATE');
    ruleIds.push(COMPARISON_RULE_IDS.CONTRACT_KNOWN_ID);
    return { ok: false, errors, ruleIds };
  }
  if (option.eligibility === 'BLOCKED') {
    errors.push('BLOCKED_CANDIDATE_NOT_SELECTABLE');
    ruleIds.push(COMPARISON_RULE_IDS.CONTRACT_NO_BLOCKED);
  }
  if (option.eligibility === 'INELIGIBLE' || option.safetyStatus === 'UNSAFE') {
    errors.push('UNSAFE_OR_INELIGIBLE_NOT_SELECTABLE');
    ruleIds.push(COMPARISON_RULE_IDS.CONTRACT_NO_UNSAFE);
  }
  if (!isDirectorEligible(option.eligibility)) {
    errors.push('SELECTED_NOT_IN_ELIGIBLE_POOL');
  }
  if (!evaluation.directorEligibleOptions.some((item) => item.candidateId === decision.selectedCandidateId)) {
    errors.push('SELECTED_NOT_IN_DIRECTOR_ELIGIBLE_OPTIONS');
  }

  const knownIds = new Set(evaluation.candidates.map((item) => item.candidateId));
  for (const id of decision.rejectedAlternatives) {
    if (!knownIds.has(id)) errors.push(`REJECTED_UNKNOWN:${id}`);
  }
  const tradeoffKeys = new Set(evaluation.tradeoffs.map((item) => `${item.optionA}|${item.optionB}|${item.axis}`));
  for (const id of decision.acceptedTradeoffs) {
    if (!tradeoffKeys.has(id) && !evaluation.tradeoffs.some((item) => item.axis === id || `${item.optionA}:${item.optionB}:${item.axis}` === id)) {
      errors.push(`UNKNOWN_TRADEOFF:${id}`);
    }
  }

  return { ok: errors.length === 0, errors, ruleIds };
}

export function mockEligibleDecision(evaluation: CropCandidateComparativeEvaluationV1): DirectorCropDecisionV1 | null {
  const option = evaluation.directorEligibleOptions[0];
  if (!option) return null;
  const rejected = evaluation.directorEligibleOptions.filter((item) => item.candidateId !== option.candidateId).map((item) => item.candidateId);
  const tradeoff = evaluation.tradeoffs[0];
  const tradeoffId = tradeoff ? `${tradeoff.optionA}:${tradeoff.optionB}:${tradeoff.axis}` : 'SOURCE_RETENTION';
  return {
    schemaVersion: evaluation.directorContractVersion,
    selectedCandidateId: option.candidateId,
    rationale: {
      text: `Contract fixture only. Would consider ${option.candidateId} using evidence/safety metrics; not a production decision.`,
      tradeoffIds: [tradeoffId],
      metricAxes: ['KEY_EVIDENCE_PRESERVATION', 'SAFETY'],
      claimImpactRefs: option.claimSupportImpact.map((item) => item.claimId),
      safetyRefs: option.hardViolations,
      sourceRefs: option.provenance.sourceRefs,
    },
    objective: 'BALANCED',
    acceptedTradeoffs: [tradeoffId],
    rejectedAlternatives: rejected,
    evidenceRefs: option.provenance.sourceRefs,
    ruleRefs: option.provenance.ruleIds,
    confidence: 'LOW',
    requiresDynamicReframe: false,
    requiresHumanReview: evaluation.humanReviewRecommended,
    decisionBoundary: 'FIXTURE_NOT_PERFORMED_IN_B2_10',
  };
}
