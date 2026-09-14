import type { ComparisonAxis, DirectorCropOptionV1, ParetoSummaryV1 } from './comparison.types.js';
import { isDirectorEligible } from './eligibility.js';
import { COMPARISON_RULE_IDS, COMPARISON_THRESHOLDS, HARD_RELEVANT_AXES } from './thresholds.js';

function hardValue(option: DirectorCropOptionV1, axis: ComparisonAxis): number {
  switch (axis) {
    case 'SAFETY':
      return option.metrics.safety.value;
    case 'KEY_EVIDENCE_PRESERVATION':
      return option.metrics.keyEvidencePreservation.value;
    case 'CLAIM_SUPPORT':
      return option.metrics.claimSupport.value;
    case 'PRODUCT_UI_PRESERVATION':
      return option.metrics.productUiPreservation.value;
    case 'NAVIGATION_PRESERVATION':
      return option.metrics.navigationPreservation.value;
    case 'TEXT_PRESERVATION':
      return option.metrics.textPreservation.value;
    default:
      return 0;
  }
}

export function dominates(a: DirectorCropOptionV1, b: DirectorCropOptionV1): boolean {
  if (!isDirectorEligible(a.eligibility) || !isDirectorEligible(b.eligibility)) return false;
  if (a.hardViolations.length > b.hardViolations.length) return false;
  let better = false;
  for (const axis of HARD_RELEVANT_AXES) {
    const av = hardValue(a, axis);
    const bv = hardValue(b, axis);
    if (av + 1e-9 < bv) return false;
    if (av - bv >= COMPARISON_THRESHOLDS.dominanceDelta) better = true;
  }
  return better;
}

export function paretoSummary(options: readonly DirectorCropOptionV1[]): ParetoSummaryV1 {
  const eligible = options.filter((item) => isDirectorEligible(item.eligibility));
  const dominatedIds: string[] = [];
  const eligibleIds: string[] = [];
  for (const option of eligible) {
    const dominated = eligible.some((other) => other.candidateId !== option.candidateId && dominates(other, option));
    if (dominated) dominatedIds.push(option.candidateId);
    else eligibleIds.push(option.candidateId);
  }
  return { eligibleIds, dominatedIds, note: 'PARETO_FRONT_IS_NOT_FINAL_WINNER' };
}

export const PARETO_RULE = COMPARISON_RULE_IDS.PARETO_NOT_WINNER;
