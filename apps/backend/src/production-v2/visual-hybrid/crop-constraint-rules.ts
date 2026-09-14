import type { ClaimEvidenceAssessmentV1 } from '../visual-context/context.types.js';
import {
  RULE_CHROME_PREFER_EXCLUDE,
  RULE_LOCALHOST_PREFER_EXCLUDE,
  RULE_NAV_SHOULD_KEEP,
  RULE_NO_MUST_KEEP_UNVALIDATED_CLAIM,
  RULE_PRODUCT_SHOULD_KEEP,
  RULE_STALE_BLOCK,
} from './crop-geometry-facts.js';
import { contextRef, visionRef } from './hybrid-provenance.js';
import type {
  CropConstraintKind,
  CropConstraintRegion,
  HybridReasonCode,
  HybridRegionOverride,
  HybridVisualRegion,
} from './hybrid.types.js';

export function buildCropConstraints(input: {
  regions: readonly HybridVisualRegion[];
  usageStatus: string;
  blocked: boolean;
  claims: readonly ClaimEvidenceAssessmentV1[];
  overrides?: readonly HybridRegionOverride[];
}): CropConstraintRegion[] {
  const autoPublishUnsupported = input.claims.some((item) => item.claimId === 'C5' && item.support !== 'SUPPORTED');
  return input.regions.map((region) => {
    const type = region.semanticType ?? 'UNKNOWN';
    let kind: CropConstraintKind = 'INFORMATIONAL';
    const reasons: HybridReasonCode[] = [];
    const ruleIds: string[] = [];
    if (input.blocked) {
      kind = 'HARD_EXCLUDE';
      reasons.push('STALE_ASSET_BLOCK', 'MOCK_CONTAMINATION_BLOCK');
      ruleIds.push(RULE_STALE_BLOCK);
    } else if (type === 'BROWSER_CHROME' || type === 'OS_CHROME') {
      kind = 'PREFER_EXCLUDE';
      reasons.push('BROWSER_CHROME_PRESENT', 'PRESENTATION_NOISE_PREFER_EXCLUDE');
      ruleIds.push(RULE_CHROME_PREFER_EXCLUDE);
    } else if (type === 'LOCALHOST_REFERENCE') {
      kind = 'PREFER_EXCLUDE';
      reasons.push('LOCALHOST_PRESENT', 'PRESENTATION_NOISE_PREFER_EXCLUDE');
      ruleIds.push(RULE_LOCALHOST_PREFER_EXCLUDE);
    } else if (type === 'PRODUCT_UI') {
      kind = 'SHOULD_KEEP';
      reasons.push('PRODUCT_UI_RELEVANT', 'CURRENT_PRODUCT_EVIDENCE', 'EVIDENCE_REGION_SHOULD_KEEP');
      ruleIds.push(RULE_PRODUCT_SHOULD_KEEP);
    } else if (type === 'NAVIGATION' || type === 'CONTENT_PANEL') {
      kind = 'SHOULD_KEEP';
      reasons.push(type === 'NAVIGATION' ? 'NAVIGATION_EVIDENCE' : 'CONTENT_PANEL_EVIDENCE', 'EVIDENCE_REGION_SHOULD_KEEP');
      ruleIds.push(RULE_NAV_SHOULD_KEEP);
    } else if (type === 'TEXT_REGION' && region.flags.evidenceBearing) {
      kind = 'SHOULD_KEEP';
      reasons.push('TEXT_READABILITY_IMPORTANT');
    } else if (type === 'BUTTON_LIKE_REGION' && autoPublishUnsupported) {
      kind = 'INFORMATIONAL';
      reasons.push('CLAIM_NOT_SUPPORTED');
      ruleIds.push(RULE_NO_MUST_KEEP_UNVALIDATED_CLAIM);
    }
    const override = input.overrides?.find((item) => item.regionId === region.id || item.semanticType === type);
    if (override && !input.blocked) {
      if (override.kind === 'FORCE_KEEP_REGION') kind = 'MUST_KEEP';
      if (override.kind === 'FORCE_EXCLUDE_REGION') kind = 'PREFER_EXCLUDE';
      if (override.kind === 'CONFIRM_PRESENTATION_NOISE') kind = 'PREFER_EXCLUDE';
    }
    if (input.blocked && override?.kind === 'FORCE_KEEP_REGION') {
      kind = 'HARD_EXCLUDE';
      ruleIds.push(RULE_STALE_BLOCK);
    }
    return {
      regionId: region.id,
      semanticType: type,
      kind,
      reasons,
      sourceRefs: [...region.sourceRefs, contextRef('usage', input.usageStatus)],
      ruleIds,
    };
  });
}

export function constraintOfType(constraints: readonly CropConstraintRegion[], type: string): CropConstraintKind | 'NONE' {
  const match = constraints.find((item) => item.semanticType === type);
  return match?.kind ?? 'NONE';
}
