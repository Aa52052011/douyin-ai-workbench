import type { HybridSourceRef } from '../visual-hybrid/hybrid.types.js';
import type { CropCandidateStatus, CropCandidateStrategy, CropPositiveSignal, SemanticCropCandidateV1 } from '../visual-crop-candidate/crop-candidate.types.js';
import type { FitMode, NormalizedRect } from '../visual/geometry/types.js';

export const CROP_COMPARISON_VERSION = 'crop.comparison:v1' as const;
export const DIRECTOR_CROP_CONTRACT_VERSION = 'director.crop-contract:v1' as const;

export const DIRECTOR_ELIGIBILITY = ['ELIGIBLE', 'ELIGIBLE_WITH_WARNINGS', 'INELIGIBLE', 'BLOCKED'] as const;
export type DirectorEligibility = (typeof DIRECTOR_ELIGIBILITY)[number];

export const COMPARISON_AXES = [
  'SAFETY',
  'KEY_EVIDENCE_PRESERVATION',
  'PRODUCT_UI_PRESERVATION',
  'NAVIGATION_PRESERVATION',
  'TEXT_PRESERVATION',
  'BROWSER_CHROME_EXCLUSION',
  'SOURCE_RETENTION',
  'OUTPUT_OCCUPANCY',
  'MOBILE_READABILITY',
  'TEMPORAL_STABILITY',
  'CLAIM_SUPPORT',
  'PRESENTATION_CLEANLINESS',
] as const;
export type ComparisonAxis = (typeof COMPARISON_AXES)[number];

export const AXIS_LABELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type AxisLabel = (typeof AXIS_LABELS)[number];

export const CLAIM_IMPACT_STATUSES = ['PRESERVED', 'PARTIALLY_DEGRADED', 'SEVERELY_DEGRADED', 'NOT_APPLICABLE'] as const;
export type ClaimImpactStatus = (typeof CLAIM_IMPACT_STATUSES)[number];

export const SOFT_TRADEOFFS = [
  'LOW_OCCUPANCY',
  'LETTERBOX_REQUIRED',
  'LETTERBOX_OR_BACKGROUND_REQUIRED',
  'BROWSER_CHROME_REMAINS',
  'LOCALHOST_REMAINS',
  'SAMPLED_TEMPORAL_VARIANCE',
  'NONCRITICAL_TEXT_LOSS',
  'LOW_SOURCE_RETENTION',
  'MOBILE_READABILITY_WARNING',
  'PAD_REQUIRED',
] as const;
export type SoftTradeoffCode = (typeof SOFT_TRADEOFFS)[number];

export const DIRECTOR_OBJECTIVES = [
  'EVIDENCE_FIRST',
  'READABILITY_FIRST',
  'CLEAN_PRESENTATION',
  'BALANCED',
  'CLAIM_FOCUS',
  'SOURCE_PRESERVATION',
] as const;
export type DirectorObjective = (typeof DIRECTOR_OBJECTIVES)[number];

export const STATIC_DYNAMIC_SUITABILITY = [
  'STATIC_SUITABLE',
  'STATIC_WITH_WARNINGS',
  'DYNAMIC_MAY_HELP',
  'DYNAMIC_LIKELY_REQUIRED',
  'BLOCKED',
] as const;
export type StaticDynamicSuitability = (typeof STATIC_DYNAMIC_SUITABILITY)[number];

export const HUMAN_REVIEW_TRIGGERS = [
  'ALL_ELIGIBLE_HAVE_WARNINGS',
  'STATIC_CROP_WARNINGS',
  'SAMPLED_SEMANTIC_PRECISION',
  'HIGH_TEMPORAL_VARIANCE',
  'CRITICAL_CLAIM_AMBIGUITY',
  'PRIVACY_RIGHTS_UNRESOLVED',
] as const;
export type HumanReviewTrigger = (typeof HUMAN_REVIEW_TRIGGERS)[number];

export type AxisMetric = {
  axis: ComparisonAxis;
  value: number;
  label: AxisLabel;
  ruleIds: string[];
  sourceRefs: HybridSourceRef[];
};

export type ClaimSupportImpact = {
  claimId: string;
  status: ClaimImpactStatus;
  coverage: number | null;
  ruleIds: string[];
};

export type DirectorCropOptionV1 = {
  candidateId: string;
  strategy: CropCandidateStrategy;
  variant?: SemanticCropCandidateV1['variant'];
  fitMode: FitMode;
  sourceRect: NormalizedRect;
  safetyStatus: CropCandidateStatus;
  eligibility: DirectorEligibility;
  metrics: {
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
  };
  risks: string[];
  positiveSignals: CropPositiveSignal[];
  hardViolations: string[];
  softTradeoffs: SoftTradeoffCode[];
  claimSupportImpact: ClaimSupportImpact[];
  perFrameSummary: {
    worstFrameId: string | null;
    evidenceMin: number | null;
    violationCount: number;
  };
  explanation: {
    whyEligible: string;
    strengths: string[];
    weaknesses: string[];
    preserved: string[];
    sacrificed: string[];
    claimImpact: string;
    temporalRisk: string;
  };
  padRequired: boolean;
  provenance: { sourceRefs: HybridSourceRef[]; ruleIds: string[] };
};

export type CropTradeoffV1 = {
  optionA: string;
  optionB: string;
  axis: ComparisonAxis;
  winnerOnAxis: string | 'TIE';
  magnitude: number;
  explanation: string;
  sourceRefs: HybridSourceRef[];
  ruleIds: string[];
};

export type ParetoSummaryV1 = {
  eligibleIds: string[];
  dominatedIds: string[];
  note: 'PARETO_FRONT_IS_NOT_FINAL_WINNER';
};

export type CropCandidateComparativeEvaluationV1 = {
  schemaVersion: typeof CROP_COMPARISON_VERSION;
  directorContractVersion: typeof DIRECTOR_CROP_CONTRACT_VERSION;
  assetId: string;
  candidates: DirectorCropOptionV1[];
  directorEligibleOptions: DirectorCropOptionV1[];
  excludedCandidates: Array<{ candidateId: string; eligibility: DirectorEligibility; reason: string }>;
  comparisonAxes: ComparisonAxis[];
  matrix: Array<{ candidateId: string; axes: Record<ComparisonAxis, { value: number; label: AxisLabel }> }>;
  paretoSummary: ParetoSummaryV1;
  tradeoffs: CropTradeoffV1[];
  unresolvedQuestions: string[];
  staticDynamicSuitability: StaticDynamicSuitability;
  dynamicReframeSignal: 'NOT_REQUIRED' | 'MAY_BENEFIT_FROM_DYNAMIC_REFRAME' | 'DYNAMIC_LIKELY_REQUIRED';
  humanReviewTriggers: HumanReviewTrigger[];
  humanReviewRecommended: boolean;
  recommendationBoundary: {
    defaultObjectiveHint: 'BALANCED';
    evidenceFirstBias: true;
    selectedCandidateId: 'NOT_SELECTED';
    bestCandidate: false;
    rank: false;
  };
  decisionAllowed: boolean;
  currentDecision: 'NOT_PERFORMED';
  winner: 'NOT_SELECTED';
  finalFitMode: 'NOT_SELECTED';
  provenance: { ruleIds: string[] };
};

export type DirectorCropDecisionV1 = {
  schemaVersion: typeof DIRECTOR_CROP_CONTRACT_VERSION;
  selectedCandidateId: string | 'REQUEST_NEW_CANDIDATE';
  rationale: {
    text: string;
    tradeoffIds: string[];
    metricAxes: ComparisonAxis[];
    claimImpactRefs: string[];
    safetyRefs: string[];
    sourceRefs: HybridSourceRef[];
  };
  objective: DirectorObjective;
  acceptedTradeoffs: string[];
  rejectedAlternatives: string[];
  evidenceRefs: HybridSourceRef[];
  ruleRefs: string[];
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  requiresDynamicReframe?: boolean;
  requiresHumanReview?: boolean;
  decisionBoundary: string;
};

export type DirectorContractValidationResult = {
  ok: boolean;
  errors: string[];
  ruleIds: string[];
};
