import type { HybridPackage } from '../visual-hybrid/hybrid-assembler.js';
import { geometryRef } from '../visual-hybrid/hybrid-provenance.js';
import type { SemanticCropCandidateV1 } from '../visual-crop-candidate/crop-candidate.types.js';
import type { AxisLabel, AxisMetric, ClaimSupportImpact, ComparisonAxis } from './comparison.types.js';
import { COMPARISON_RULE_IDS, COMPARISON_THRESHOLDS } from './thresholds.js';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function axisLabel(value: number, high = COMPARISON_THRESHOLDS.labelHighMin, medium = COMPARISON_THRESHOLDS.labelMediumMin): AxisLabel {
  if (value >= high) return 'HIGH';
  if (value >= medium) return 'MEDIUM';
  return 'LOW';
}

export function readabilityLabel(occupancy: number): AxisLabel {
  if (occupancy >= COMPARISON_THRESHOLDS.readabilityHighMin) return 'HIGH';
  if (occupancy >= COMPARISON_THRESHOLDS.readabilityMediumMin) return 'MEDIUM';
  return 'LOW';
}

function metric(axis: ComparisonAxis, value: number, ruleIds: string[], field: string, label?: AxisLabel): AxisMetric {
  const v = clamp01(value);
  return {
    axis,
    value: v,
    label: label ?? axisLabel(v),
    ruleIds,
    sourceRefs: [geometryRef(field, v.toFixed(4))],
  };
}

function worst(candidate: SemanticCropCandidateV1, key: 'evidenceCoverage' | 'productUiCoverage' | 'navigationCoverage' | 'textCoverage'): number {
  const frameValues = candidate.safety.perFrame
    .map((item) => {
      if (key === 'evidenceCoverage') return item.evidenceCoverage;
      if (key === 'productUiCoverage') return item.productUiCoverage;
      if (key === 'navigationCoverage') return item.navigationCoverage;
      return item.textCoverage;
    })
    .filter((item): item is number => item !== null);
  if (frameValues.length > 0) return Math.min(...frameValues);
  const fallback =
    key === 'evidenceCoverage'
      ? candidate.evidenceCoverage
      : key === 'productUiCoverage'
        ? candidate.productUiCoverage
        : key === 'navigationCoverage'
          ? candidate.navigationCoverage
          : candidate.textCoverage;
  return fallback ?? 0;
}

export function claimImpacts(pack: HybridPackage, candidate: SemanticCropCandidateV1): ClaimSupportImpact[] {
  return pack.cropInput.claimLinks.map((link) => {
    if (link.claimId === 'C5') {
      return { claimId: 'C5', status: 'NOT_APPLICABLE', coverage: null, ruleIds: [COMPARISON_RULE_IDS.CLAIM_C5_NA] };
    }
    if (link.claimId === 'C6') {
      return { claimId: 'C6', status: 'NOT_APPLICABLE', coverage: null, ruleIds: [COMPARISON_RULE_IDS.CLAIM_C6_NA] };
    }
    const coverage = worst(candidate, 'evidenceCoverage');
    if (!link.claimCritical) {
      return { claimId: link.claimId, status: 'NOT_APPLICABLE', coverage, ruleIds: [COMPARISON_RULE_IDS.CLAIM_C5_NA] };
    }
    const status =
      coverage >= COMPARISON_THRESHOLDS.claimPreservedMin
        ? 'PRESERVED'
        : coverage >= COMPARISON_THRESHOLDS.claimPartialMin
          ? 'PARTIALLY_DEGRADED'
          : 'SEVERELY_DEGRADED';
    return { claimId: link.claimId, status, coverage, ruleIds: [COMPARISON_RULE_IDS.WORST_FRAME] };
  });
}

export function claimSupportValue(impacts: readonly ClaimSupportImpact[]): number {
  const applicable = impacts.filter((item) => item.status !== 'NOT_APPLICABLE' && item.coverage !== null);
  if (applicable.length === 0) return 1;
  return Math.min(...applicable.map((item) => item.coverage ?? 0));
}

export function buildAxisMetrics(pack: HybridPackage, candidate: SemanticCropCandidateV1): DirectorMetrics {
  const evidence = worst(candidate, 'evidenceCoverage');
  const product = worst(candidate, 'productUiCoverage');
  const nav = worst(candidate, 'navigationCoverage');
  const text = worst(candidate, 'textCoverage');
  const browser = candidate.safety.aggregate.browserMax ?? candidate.browserChromeCoverage ?? 0;
  const chromeExclusion = 1 - clamp01(browser);
  const occupancy = candidate.sourceOccupancy;
  const impacts = claimImpacts(pack, candidate);
  const hasVariance = candidate.riskSignals.some((item) => item.code === 'TEMPORAL_REGION_VARIANCE');
  const temporalRaw = candidate.safety.perFrame.every((item) => item.violations.length === 0) ? 0.8 : 0.4;
  const temporalValue = hasVariance ? Math.min(temporalRaw, COMPARISON_THRESHOLDS.temporalVarianceCap) : temporalRaw;
  const safetyValue = candidate.status === 'VALID' ? 1 : candidate.status === 'VALID_WITH_WARNINGS' ? 0.6 : 0;
  const padPenalty = candidate.padRequired ? COMPARISON_THRESHOLDS.presentationPadPenalty : 0;
  const presentation = clamp01(chromeExclusion - padPenalty);

  return {
    keyEvidencePreservation: metric('KEY_EVIDENCE_PRESERVATION', evidence, [COMPARISON_RULE_IDS.WORST_FRAME], 'evidenceMin'),
    productUiPreservation: metric('PRODUCT_UI_PRESERVATION', product, [COMPARISON_RULE_IDS.WORST_FRAME], 'productUiMin'),
    navigationPreservation: metric('NAVIGATION_PRESERVATION', nav, [COMPARISON_RULE_IDS.WORST_FRAME], 'navigationMin'),
    textPreservation: metric('TEXT_PRESERVATION', text, [COMPARISON_RULE_IDS.WORST_FRAME], 'textMin'),
    browserChromeExclusion: metric('BROWSER_CHROME_EXCLUSION', chromeExclusion, [COMPARISON_RULE_IDS.CHROME_EXCLUSION], 'chromeExclusion'),
    sourceRetention: metric('SOURCE_RETENTION', candidate.retainedAreaRatio, [COMPARISON_RULE_IDS.NO_MUTATION], 'retainedAreaRatio'),
    outputOccupancy: metric('OUTPUT_OCCUPANCY', occupancy, [COMPARISON_RULE_IDS.READABILITY_PROXY], 'occupancy'),
    mobileReadability: metric(
      'MOBILE_READABILITY',
      occupancy,
      [COMPARISON_RULE_IDS.READABILITY_PROXY],
      'occupancy',
      readabilityLabel(occupancy),
    ),
    temporalStability: metric(
      'TEMPORAL_STABILITY',
      temporalValue,
      [COMPARISON_RULE_IDS.TEMPORAL_CAP],
      'temporal',
      temporalValue >= COMPARISON_THRESHOLDS.labelHighMin
        ? 'HIGH'
        : temporalValue >= COMPARISON_THRESHOLDS.labelMediumMin
          ? 'MEDIUM'
          : 'LOW',
    ),
    claimSupport: metric('CLAIM_SUPPORT', claimSupportValue(impacts), [COMPARISON_RULE_IDS.WORST_FRAME], 'claimSupport'),
    presentationCleanliness: metric('PRESENTATION_CLEANLINESS', presentation, [COMPARISON_RULE_IDS.HARD_OVER_PRESENTATION], 'presentation'),
    safety: metric('SAFETY', safetyValue, [COMPARISON_RULE_IDS.ELIGIBILITY], 'safetyStatus'),
    claimImpacts: impacts,
    hasTemporalVariance: hasVariance,
  };
}

export type DirectorMetrics = {
  keyEvidencePreservation: AxisMetric;
  productUiPreservation: AxisMetric;
  navigationPreservation: AxisMetric;
  textPreservation: AxisMetric;
  browserChromeExclusion: AxisMetric;
  sourceRetention: AxisMetric;
  outputOccupancy: AxisMetric;
  mobileReadability: AxisMetric;
  temporalStability: AxisMetric;
  claimSupport: AxisMetric;
  presentationCleanliness: AxisMetric;
  safety: AxisMetric;
  claimImpacts: ClaimSupportImpact[];
  hasTemporalVariance: boolean;
};
