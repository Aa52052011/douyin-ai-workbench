import type { HybridPackage } from '../visual-hybrid/hybrid-assembler.js';
import { geometryRef } from '../visual-hybrid/hybrid-provenance.js';
import type { CropCandidateGenerationResultV1, SemanticCropCandidateV1 } from '../visual-crop-candidate/crop-candidate.types.js';
import { buildAxisMetrics } from './comparison-axes.js';
import {
  COMPARISON_AXES,
  CROP_COMPARISON_VERSION,
  DIRECTOR_CROP_CONTRACT_VERSION,
  type ComparisonAxis,
  type CropCandidateComparativeEvaluationV1,
  type DirectorCropOptionV1,
  type HumanReviewTrigger,
  type SoftTradeoffCode,
  type StaticDynamicSuitability,
} from './comparison.types.js';
import { eligibilityOf, generationIsBlocked, isDirectorEligible } from './eligibility.js';
import { paretoSummary } from './pareto.js';
import { COMPARISON_RULE_IDS } from './thresholds.js';
import { buildTradeoffs } from './tradeoff.js';

const STRATEGY_ORDER: Record<string, number> = {
  CONTAIN: 0,
  CENTER_COVER: 1,
  SAFE_REGION: 2,
  TOP_TRIM: 3,
  UI_FOCUS: 4,
  CUSTOM_SEMANTIC: 5,
};

const ELIGIBILITY_ORDER: Record<DirectorCropOptionV1['eligibility'], number> = {
  ELIGIBLE: 0,
  ELIGIBLE_WITH_WARNINGS: 1,
  INELIGIBLE: 2,
  BLOCKED: 3,
};

const VARIANT_ORDER: Record<string, number> = { BALANCED: 0, WIDE_SAFE: 1, TIGHT: 2 };

function softTradeoffs(candidate: SemanticCropCandidateV1): SoftTradeoffCode[] {
  const codes: SoftTradeoffCode[] = [];
  if (candidate.padRequired) {
    codes.push('PAD_REQUIRED', 'LETTERBOX_REQUIRED', 'LETTERBOX_OR_BACKGROUND_REQUIRED');
  }
  if (candidate.sourceOccupancy < 0.4) codes.push('LOW_OCCUPANCY', 'MOBILE_READABILITY_WARNING');
  if ((candidate.browserChromeCoverage ?? 0) > 0.05) codes.push('BROWSER_CHROME_REMAINS');
  if ((candidate.safety.metrics.localhostCoverage ?? 0) > 0.05) codes.push('LOCALHOST_REMAINS');
  if (candidate.riskSignals.some((item) => item.code === 'TEMPORAL_REGION_VARIANCE')) codes.push('SAMPLED_TEMPORAL_VARIANCE');
  if (candidate.retainedAreaRatio < 0.4) codes.push('LOW_SOURCE_RETENTION');
  if (candidate.riskSignals.some((item) => item.code === 'TEXT_CUTOFF_RISK')) codes.push('NONCRITICAL_TEXT_LOSS');
  return [...new Set(codes)];
}

function toOption(pack: HybridPackage, candidate: SemanticCropCandidateV1, generationBlocked: boolean): DirectorCropOptionV1 {
  const eligibility = eligibilityOf(candidate, generationBlocked);
  const metricsBundle = buildAxisMetrics(pack, candidate);
  const { claimImpacts, hasTemporalVariance, ...metrics } = metricsBundle;
  const eligible = isDirectorEligible(eligibility);
  return {
    candidateId: candidate.candidateId,
    strategy: candidate.strategy,
    variant: candidate.variant,
    fitMode: candidate.fitMode,
    sourceRect: { ...candidate.sourceRect },
    safetyStatus: candidate.status,
    eligibility,
    metrics,
    risks: candidate.riskSignals.map((item) => item.code),
    positiveSignals: [...candidate.positiveSignals],
    hardViolations: [...candidate.safety.hardViolations],
    softTradeoffs: softTradeoffs(candidate),
    claimSupportImpact: claimImpacts,
    perFrameSummary: {
      worstFrameId: candidate.safety.aggregate.worstFrameId,
      evidenceMin: candidate.safety.aggregate.evidenceMin,
      violationCount: candidate.safety.aggregate.violationCount,
    },
    explanation: {
      whyEligible: eligible
        ? `B2-9 ${candidate.status} maps to ${eligibility}`
        : `B2-9 ${candidate.status} maps to ${eligibility}; excluded from Director pool`,
      strengths: candidate.positiveSignals,
      weaknesses: candidate.riskSignals.map((item) => item.code),
      preserved: candidate.explanation.preserved,
      sacrificed: candidate.explanation.lost,
      claimImpact: claimImpacts.map((item) => `${item.claimId}:${item.status}`).join(',') || 'none',
      temporalRisk: hasTemporalVariance ? 'SAMPLED_TEMPORAL_VARIANCE' : 'NO_VARIANCE_SIGNAL',
    },
    padRequired: candidate.padRequired,
    provenance: {
      sourceRefs: [...candidate.provenance.sourceRefs, geometryRef('b2-9-status', candidate.status)],
      ruleIds: [...candidate.provenance.ruleIds, COMPARISON_RULE_IDS.ELIGIBILITY, COMPARISON_RULE_IDS.NO_MUTATION],
    },
  };
}

function displaySort(a: DirectorCropOptionV1, b: DirectorCropOptionV1): number {
  return (
    ELIGIBILITY_ORDER[a.eligibility] - ELIGIBILITY_ORDER[b.eligibility] ||
    (STRATEGY_ORDER[a.strategy] ?? 9) - (STRATEGY_ORDER[b.strategy] ?? 9) ||
    (VARIANT_ORDER[a.variant ?? 'BALANCED'] ?? 0) - (VARIANT_ORDER[b.variant ?? 'BALANCED'] ?? 0) ||
    a.candidateId.localeCompare(b.candidateId)
  );
}

function suitability(generation: CropCandidateGenerationResultV1, blocked: boolean): StaticDynamicSuitability {
  if (blocked) return 'BLOCKED';
  if (generation.staticCropAssessment === 'STATIC_CROP_INSUFFICIENT') return 'DYNAMIC_LIKELY_REQUIRED';
  if (generation.staticCropAssessment === 'SAFE_STATIC_CROP_AVAILABLE') return 'STATIC_SUITABLE';
  if (generation.staticCropAssessment === 'STATIC_CROP_WITH_WARNINGS') return 'STATIC_WITH_WARNINGS';
  return 'STATIC_WITH_WARNINGS';
}

export function evaluateCropComparison(
  pack: HybridPackage,
  generation: CropCandidateGenerationResultV1,
): CropCandidateComparativeEvaluationV1 {
  const blocked = generationIsBlocked(generation) || pack.hybrid.productionEligibility === 'BLOCKED';
  const options = generation.candidates.map((item) => toOption(pack, item, blocked)).sort(displaySort);
  const directorEligibleOptions = options.filter((item) => isDirectorEligible(item.eligibility));
  const excludedCandidates = options
    .filter((item) => !isDirectorEligible(item.eligibility))
    .map((item) => ({
      candidateId: item.candidateId,
      eligibility: item.eligibility,
      reason: item.safetyStatus === 'UNSAFE' ? 'B2_9_UNSAFE' : item.eligibility,
    }));

  const humanReviewTriggers: HumanReviewTrigger[] = [];
  if (blocked) {
    /* blocked asset: no review of crop choice */
  } else {
    if (directorEligibleOptions.length > 0 && directorEligibleOptions.every((item) => item.eligibility === 'ELIGIBLE_WITH_WARNINGS')) {
      humanReviewTriggers.push('ALL_ELIGIBLE_HAVE_WARNINGS');
    }
    if (generation.staticCropAssessment === 'STATIC_CROP_WITH_WARNINGS') humanReviewTriggers.push('STATIC_CROP_WARNINGS');
    if (generation.safetyPrecision === 'SAMPLED') humanReviewTriggers.push('SAMPLED_SEMANTIC_PRECISION');
    if (generation.temporalVariance) humanReviewTriggers.push('HIGH_TEMPORAL_VARIANCE');
  }

  const matrix = options.map((item) => ({
    candidateId: item.candidateId,
    axes: Object.fromEntries(
      COMPARISON_AXES.map((axis) => {
        const metric = metricFor(item, axis);
        return [axis, { value: metric.value, label: metric.label }];
      }),
    ) as CropCandidateComparativeEvaluationV1['matrix'][number]['axes'],
  }));

  const staticDynamicSuitability = suitability(generation, blocked);
  return {
    schemaVersion: CROP_COMPARISON_VERSION,
    directorContractVersion: DIRECTOR_CROP_CONTRACT_VERSION,
    assetId: pack.hybrid.assetId,
    candidates: options,
    directorEligibleOptions,
    excludedCandidates,
    comparisonAxes: [...COMPARISON_AXES],
    matrix,
    paretoSummary: paretoSummary(options),
    tradeoffs: blocked ? [] : buildTradeoffs(options),
    unresolvedQuestions: blocked
      ? ['ASSET_PRODUCTION_BLOCKED']
      : ['NO_STATIC_CROP_WITHOUT_WARNINGS', 'SAMPLED_PRECISION_NOT_FRAME_ACCURATE'],
    staticDynamicSuitability,
    dynamicReframeSignal:
      staticDynamicSuitability === 'DYNAMIC_LIKELY_REQUIRED'
        ? 'DYNAMIC_LIKELY_REQUIRED'
        : staticDynamicSuitability === 'STATIC_WITH_WARNINGS'
          ? 'MAY_BENEFIT_FROM_DYNAMIC_REFRAME'
          : 'NOT_REQUIRED',
    humanReviewTriggers,
    humanReviewRecommended: humanReviewTriggers.length > 0,
    recommendationBoundary: {
      defaultObjectiveHint: 'BALANCED',
      evidenceFirstBias: true,
      selectedCandidateId: 'NOT_SELECTED',
      bestCandidate: false,
      rank: false,
    },
    decisionAllowed: !blocked,
    currentDecision: 'NOT_PERFORMED',
    winner: 'NOT_SELECTED',
    finalFitMode: 'NOT_SELECTED',
    provenance: { ruleIds: Object.values(COMPARISON_RULE_IDS) },
  };
}

function metricFor(option: DirectorCropOptionV1, axis: ComparisonAxis) {
  switch (axis) {
    case 'SAFETY':
      return option.metrics.safety;
    case 'KEY_EVIDENCE_PRESERVATION':
      return option.metrics.keyEvidencePreservation;
    case 'PRODUCT_UI_PRESERVATION':
      return option.metrics.productUiPreservation;
    case 'NAVIGATION_PRESERVATION':
      return option.metrics.navigationPreservation;
    case 'TEXT_PRESERVATION':
      return option.metrics.textPreservation;
    case 'BROWSER_CHROME_EXCLUSION':
      return option.metrics.browserChromeExclusion;
    case 'SOURCE_RETENTION':
      return option.metrics.sourceRetention;
    case 'OUTPUT_OCCUPANCY':
      return option.metrics.outputOccupancy;
    case 'MOBILE_READABILITY':
      return option.metrics.mobileReadability;
    case 'TEMPORAL_STABILITY':
      return option.metrics.temporalStability;
    case 'CLAIM_SUPPORT':
      return option.metrics.claimSupport;
    case 'PRESENTATION_CLEANLINESS':
      return option.metrics.presentationCleanliness;
  }
}
