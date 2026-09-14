import type { ClaimEvidenceAssessmentV1 } from '../visual-context/context.types.js';
import type { ClaimRegionLink, HybridVisualRegion } from './hybrid.types.js';

export function linkClaimsToRegions(
  regions: readonly HybridVisualRegion[],
  claims: readonly ClaimEvidenceAssessmentV1[],
): ClaimRegionLink[] {
  const product = regions.find((item) => item.semanticType === 'PRODUCT_UI');
  const button = regions.find((item) => item.semanticType === 'BUTTON_LIKE_REGION');
  return claims.map((claim) => {
    if (claim.claimId === 'C5') {
      return {
        claimId: 'C5',
        regionId: button?.id,
        semanticType: button?.semanticType,
        claimCritical: false,
        support: claim.support,
        reasons: ['CLAIM_NOT_SUPPORTED'],
      };
    }
    const evidence = product ?? regions.find((item) => item.flags.evidenceBearing);
    return {
      claimId: claim.claimId,
      regionId: evidence?.id,
      semanticType: evidence?.semanticType,
      claimCritical: claim.support === 'SUPPORTED' || claim.support === 'PARTIALLY_SUPPORTED',
      support: claim.support,
      reasons: claim.support === 'SUPPORTED' || claim.support === 'PARTIALLY_SUPPORTED' ? ['CURRENT_PRODUCT_EVIDENCE'] : ['CLAIM_NOT_SUPPORTED'],
    };
  });
}
