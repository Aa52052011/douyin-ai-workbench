import type { AxisLabel, AxisMetric, ComparisonAxis, CropCandidateComparativeEvaluationV1, DirectorCropOptionV1 } from '../../visual-crop-comparison/comparison.types.js';
import { COMPARISON_AXES, CROP_COMPARISON_VERSION, DIRECTOR_CROP_CONTRACT_VERSION } from '../../visual-crop-comparison/comparison.types.js';

function metric(axis: ComparisonAxis, value: number, label: AxisLabel): AxisMetric {
  return { axis, value, label, ruleIds: ['SYNTHETIC'], sourceRefs: [] };
}

function option(partial: {
  candidateId: string;
  strategy: DirectorCropOptionV1['strategy'];
  variant?: DirectorCropOptionV1['variant'];
  eligibility?: DirectorCropOptionV1['eligibility'];
  safetyStatus?: DirectorCropOptionV1['safetyStatus'];
  evidence: number;
  claim?: number;
  readability: number;
  readabilityLabel: AxisLabel;
  temporal?: number;
  chrome?: number;
  source?: number;
  presentation?: number;
  padRequired?: boolean;
}): DirectorCropOptionV1 {
  const claim = partial.claim ?? partial.evidence;
  return {
    candidateId: partial.candidateId,
    strategy: partial.strategy,
    variant: partial.variant,
    fitMode: partial.padRequired === false ? 'COVER' : 'CONTAIN',
    sourceRect: { x: 0, y: 0, width: 1, height: 1 },
    safetyStatus: partial.safetyStatus ?? 'VALID_WITH_WARNINGS',
    eligibility: partial.eligibility ?? 'ELIGIBLE_WITH_WARNINGS',
    metrics: {
      keyEvidencePreservation: metric('KEY_EVIDENCE_PRESERVATION', partial.evidence, partial.evidence >= 0.8 ? 'HIGH' : partial.evidence >= 0.5 ? 'MEDIUM' : 'LOW'),
      productUiPreservation: metric('PRODUCT_UI_PRESERVATION', partial.evidence, 'HIGH'),
      navigationPreservation: metric('NAVIGATION_PRESERVATION', partial.evidence, 'HIGH'),
      textPreservation: metric('TEXT_PRESERVATION', partial.evidence, 'HIGH'),
      browserChromeExclusion: metric('BROWSER_CHROME_EXCLUSION', partial.chrome ?? 0.5, 'MEDIUM'),
      sourceRetention: metric('SOURCE_RETENTION', partial.source ?? 0.8, 'HIGH'),
      outputOccupancy: metric('OUTPUT_OCCUPANCY', partial.readability, partial.readabilityLabel),
      mobileReadability: metric('MOBILE_READABILITY', partial.readability, partial.readabilityLabel),
      temporalStability: metric('TEMPORAL_STABILITY', partial.temporal ?? 0.55, 'MEDIUM'),
      claimSupport: metric('CLAIM_SUPPORT', claim, claim >= 0.8 ? 'HIGH' : claim >= 0.5 ? 'MEDIUM' : 'LOW'),
      presentationCleanliness: metric('PRESENTATION_CLEANLINESS', partial.presentation ?? partial.chrome ?? 0.5, 'MEDIUM'),
      safety: metric('SAFETY', 0.6, 'MEDIUM'),
    },
    risks: [],
    positiveSignals: [],
    hardViolations: [],
    softTradeoffs: partial.padRequired ? ['PAD_REQUIRED'] : [],
    claimSupportImpact: [{ claimId: 'C1', status: partial.evidence >= 0.8 ? 'PRESERVED' : 'SEVERELY_DEGRADED', coverage: partial.evidence, ruleIds: [] }],
    perFrameSummary: { worstFrameId: 'f0', evidenceMin: partial.evidence, violationCount: 0 },
    explanation: { whyEligible: 'synthetic', strengths: [], weaknesses: [], preserved: [], sacrificed: [], claimImpact: 'C1', temporalRisk: 'none' },
    padRequired: Boolean(partial.padRequired),
    provenance: { sourceRefs: [{ kind: 'CONTEXT_EVALUATION', sourceType: 'SYSTEM_FACT', sourceId: partial.candidateId, field: 'synthetic', valueSummary: partial.candidateId }], ruleIds: ['SYNTHETIC'] },
  };
}

function evaluation(assetId: string, candidates: DirectorCropOptionV1[], extras?: Partial<CropCandidateComparativeEvaluationV1>): CropCandidateComparativeEvaluationV1 {
  const directorEligibleOptions = candidates.filter((item) => item.eligibility === 'ELIGIBLE' || item.eligibility === 'ELIGIBLE_WITH_WARNINGS');
  return {
    schemaVersion: CROP_COMPARISON_VERSION,
    directorContractVersion: DIRECTOR_CROP_CONTRACT_VERSION,
    assetId,
    candidates,
    directorEligibleOptions,
    excludedCandidates: candidates.filter((item) => item.eligibility === 'INELIGIBLE' || item.eligibility === 'BLOCKED').map((item) => ({ candidateId: item.candidateId, eligibility: item.eligibility, reason: item.eligibility })),
    comparisonAxes: [...COMPARISON_AXES],
    matrix: [],
    paretoSummary: { eligibleIds: directorEligibleOptions.map((item) => item.candidateId), dominatedIds: [], note: 'PARETO_FRONT_IS_NOT_FINAL_WINNER' },
    tradeoffs: directorEligibleOptions.length >= 2
      ? [{ optionA: directorEligibleOptions[0].candidateId, optionB: directorEligibleOptions[1].candidateId, axis: 'KEY_EVIDENCE_PRESERVATION', winnerOnAxis: 'TIE', magnitude: 0, explanation: 'synthetic', sourceRefs: directorEligibleOptions[0].provenance.sourceRefs, ruleIds: ['SYNTHETIC'] }]
      : [],
    unresolvedQuestions: [],
    staticDynamicSuitability: 'STATIC_WITH_WARNINGS',
    dynamicReframeSignal: 'MAY_BENEFIT_FROM_DYNAMIC_REFRAME',
    humanReviewTriggers: ['STATIC_CROP_WARNINGS', 'SAMPLED_SEMANTIC_PRECISION'],
    humanReviewRecommended: true,
    recommendationBoundary: { defaultObjectiveHint: 'BALANCED', evidenceFirstBias: true, selectedCandidateId: 'NOT_SELECTED', bestCandidate: false, rank: false },
    decisionAllowed: true,
    currentDecision: 'NOT_PERFORMED',
    winner: 'NOT_SELECTED',
    finalFitMode: 'NOT_SELECTED',
    provenance: { ruleIds: [] },
    ...extras,
  };
}

export function fixtureEvidenceOverCleanliness(): CropCandidateComparativeEvaluationV1 {
  return evaluation('synthetic-evidence', [
    option({ candidateId: 'clean-low-evidence', strategy: 'TOP_TRIM', evidence: 0.2, readability: 0.8, readabilityLabel: 'HIGH', chrome: 1, presentation: 1 }),
    option({ candidateId: 'chrome-but-complete', strategy: 'SAFE_REGION', evidence: 0.95, readability: 0.5, readabilityLabel: 'MEDIUM', chrome: 0.4, presentation: 0.4 }),
  ]);
}

export function fixtureReadabilityTiebreak(): CropCandidateComparativeEvaluationV1 {
  return evaluation('synthetic-readability', [
    option({ candidateId: 'low-read', strategy: 'CONTAIN', evidence: 0.9, readability: 0.3, readabilityLabel: 'LOW', temporal: 0.55, chrome: 0.5 }),
    option({ candidateId: 'med-read', strategy: 'SAFE_REGION', evidence: 0.9, readability: 0.55, readabilityLabel: 'MEDIUM', temporal: 0.55, chrome: 0.5 }),
  ]);
}

export function fixtureRequestNewCandidate(): CropCandidateComparativeEvaluationV1 {
  return evaluation('synthetic-request-new', [
    option({ candidateId: 'weak-a', strategy: 'CONTAIN', evidence: 0.2, readability: 0.1, readabilityLabel: 'LOW' }),
    option({ candidateId: 'weak-b', strategy: 'TOP_TRIM', evidence: 0.1, readability: 0.1, readabilityLabel: 'LOW' }),
  ]);
}

export function fixtureUnsafeCannotWin(): CropCandidateComparativeEvaluationV1 {
  return evaluation('synthetic-unsafe', [
    option({
      candidateId: 'unsafe-pretty',
      strategy: 'CENTER_COVER',
      evidence: 0.99,
      readability: 0.9,
      readabilityLabel: 'HIGH',
      chrome: 1,
      eligibility: 'INELIGIBLE',
      safetyStatus: 'UNSAFE',
    }),
    option({ candidateId: 'ok-but-plain', strategy: 'SAFE_REGION', evidence: 0.8, readability: 0.5, readabilityLabel: 'MEDIUM', chrome: 0.4 }),
  ]);
}

export function fixtureTemporalTiebreak(): CropCandidateComparativeEvaluationV1 {
  return evaluation('synthetic-temporal', [
    option({ candidateId: 'less-stable', strategy: 'TOP_TRIM', evidence: 0.9, readability: 0.55, readabilityLabel: 'MEDIUM', temporal: 0.4, chrome: 0.7 }),
    option({ candidateId: 'more-stable', strategy: 'SAFE_REGION', evidence: 0.9, readability: 0.55, readabilityLabel: 'MEDIUM', temporal: 0.7, chrome: 0.7 }),
  ]);
}
