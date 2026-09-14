import { deriveFlags, RULE_IDS } from './context-rules.js';
import type {
  AssetUsageAssessmentV1,
  ContextReasonCode,
  ProjectContextEvaluationInput,
  ProjectContextEvaluationV1,
  Repairability,
} from './context.types.js';
import { ASSET_USAGE_SCHEMA_VERSION, VISUAL_CONTEXT_SCHEMA_VERSION } from './context.types.js';
import type { AssetUsageAssessment } from '../visual-semantic/contracts/context-usage.types.js';

function unique(codes: ContextReasonCode[]): ContextReasonCode[] {
  return [...new Set(codes)];
}

export function assessAssetUsage(
  input: ProjectContextEvaluationInput,
  evaluation: ProjectContextEvaluationV1,
): AssetUsageAssessmentV1 {
  const flags = deriveFlags(input);
  const reasons: ContextReasonCode[] = [];
  const constraints: string[] = [];
  let status: AssetUsageAssessment = 'UNKNOWN';
  let repairability: Repairability = 'UNKNOWN';
  const triggered = [...evaluation.triggeredRules];

  if (flags.privacyBlocker) {
    status = 'DO_NOT_USE';
    reasons.push('PRIVACY_BLOCKER');
    repairability = 'NOT_REPAIRABLE';
    triggered.push(RULE_IDS.PRIVACY);
  } else if (flags.rightsBlocker) {
    status = 'DO_NOT_USE';
    reasons.push('RIGHTS_BLOCKER');
    repairability = 'NOT_REPAIRABLE';
    triggered.push(RULE_IDS.RIGHTS);
  } else if (flags.truthHardBlock) {
    status = 'DO_NOT_USE';
    reasons.push('STALE_HUMAN_CONFIRMED', 'MOCK_CONTAMINATION_HUMAN_CONFIRMED', 'TRUTH_RISK');
    repairability = 'NOT_REPAIRABLE';
    triggered.push(RULE_IDS.TRUTH_STALE_MOCK, RULE_IDS.OVERRIDE_CANNOT_BYPASS);
  } else if (flags.forceAvoid) {
    status = 'AVOID';
    reasons.push('TRUTH_RISK');
    repairability = 'UNKNOWN';
  } else if (evaluation.freshness.status === 'STALE' && input.truthConstraints.mustUseRealProductEvidence) {
    status = 'DO_NOT_USE';
    reasons.push('STALE_HUMAN_CONFIRMED', 'TRUTH_RISK');
    repairability = 'NOT_REPAIRABLE';
  } else if (evaluation.relevance.status === 'UNRELATED' || evaluation.evidenceValue.status === 'NONE') {
    status = 'AVOID';
    reasons.push(...evaluation.evidenceValue.reasons, ...evaluation.relevance.reasons);
    repairability = 'NOT_REPAIRABLE';
  } else if (flags.oldEmptyHome || flags.emptyState) {
    status = 'LIMITED';
    reasons.push(flags.oldEmptyHome ? 'OLD_EMPTY_HOME_LIMITATION' : 'EMPTY_STATE_LIMITATION');
    constraints.push('SHORT_USE_ONLY');
    repairability = 'SHORT_USE_ONLY';
    triggered.push(RULE_IDS.EMPTY_STATE);
  } else if (evaluation.evidenceValue.status === 'LOW') {
    status = 'LIMITED';
    reasons.push(...evaluation.evidenceValue.reasons);
    repairability = 'SHORT_USE_ONLY';
  } else if (flags.forcePreferred) {
    status = 'PREFERRED';
    reasons.push('CURRENT_PROJECT_ASSET');
    repairability = flags.browserChrome ? 'CROP_FIXABLE' : 'UNKNOWN';
  } else if (
    evaluation.relevance.status === 'HIGH' &&
    evaluation.freshness.status === 'CURRENT' &&
    evaluation.evidenceValue.status === 'HIGH' &&
    (evaluation.misleadingRisk.level === 'NONE' || evaluation.misleadingRisk.level === 'LOW')
  ) {
    status = flags.localhost ? 'USABLE' : 'PREFERRED';
    reasons.push('CURRENT_PRODUCT_UI', 'REAL_PRODUCT_EVIDENCE');
    if (flags.browserChrome) {
      reasons.push('BROWSER_CHROME_PRESENT', 'PRESENTATION_LIMITATION_ONLY');
      constraints.push('BROWSER_CHROME');
      repairability = 'CROP_FIXABLE';
    } else {
      repairability = 'UNKNOWN';
    }
    if (flags.localhost) {
      reasons.push('LOCALHOST_PRESENT');
      constraints.push('LOCALHOST_REFERENCE');
      repairability = 'MASK_FIXABLE';
    }
  } else if (evaluation.relevance.status === 'HIGH' || evaluation.relevance.status === 'MEDIUM') {
    status = 'USABLE';
    reasons.push(...evaluation.relevance.reasons);
    if (flags.publishOps) {
      reasons.push('PUBLISH_PAGE_UNVALIDATED_CAPABILITY');
      constraints.push('CLAIM_SCOPED_USE_ONLY');
      repairability = 'UNKNOWN';
    }
    if (flags.productInfoChat) {
      repairability = 'SHORT_USE_ONLY';
      constraints.push('SHORT_USE_ONLY');
    }
  } else if (evaluation.relevance.status === 'LOW') {
    status = 'AVOID';
    reasons.push(...evaluation.relevance.reasons);
  }

  return {
    schemaVersion: ASSET_USAGE_SCHEMA_VERSION,
    assetId: input.assetFacts.assetId,
    status,
    reasons: unique(reasons),
    constraints,
    repairability,
    evidenceRefs: evaluation.sourceRefs,
    contextVersion: VISUAL_CONTEXT_SCHEMA_VERSION,
    triggeredRules: [...new Set(triggered)],
    humanOverrideApplied: input.overrides.map((item) => item.kind),
    finalShotDecision: false,
  };
}
