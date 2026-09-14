import type { CropCandidateGenerationResultV1, SemanticCropCandidateV1 } from '../visual-crop-candidate/crop-candidate.types.js';
import type { DirectorEligibility } from './comparison.types.js';
import { COMPARISON_RULE_IDS } from './thresholds.js';

export function eligibilityOf(candidate: SemanticCropCandidateV1, generationBlocked: boolean): DirectorEligibility {
  if (generationBlocked || candidate.status === 'BLOCKED') return 'BLOCKED';
  if (candidate.status === 'UNSAFE') return 'INELIGIBLE';
  if (candidate.status === 'VALID_WITH_WARNINGS') return 'ELIGIBLE_WITH_WARNINGS';
  return 'ELIGIBLE';
}

export function isDirectorEligible(eligibility: DirectorEligibility): boolean {
  return eligibility === 'ELIGIBLE' || eligibility === 'ELIGIBLE_WITH_WARNINGS';
}

export function generationIsBlocked(result: CropCandidateGenerationResultV1): boolean {
  return result.generationStatus === 'BLOCKED_BY_ASSET_USAGE';
}

export const ELIGIBILITY_RULES = {
  VALID: 'ELIGIBLE',
  VALID_WITH_WARNINGS: 'ELIGIBLE_WITH_WARNINGS',
  UNSAFE: 'INELIGIBLE',
  BLOCKED: 'BLOCKED',
  ruleIds: [COMPARISON_RULE_IDS.ELIGIBILITY, COMPARISON_RULE_IDS.UNSAFE_INELIGIBLE, COMPARISON_RULE_IDS.BLOCKED_NEVER],
} as const;
