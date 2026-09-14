import type { FitMode, NormalizedRect, Rect } from '../visual/geometry/types.js';
import type { CropConstraintKind, HybridSourceRef } from '../visual-hybrid/hybrid.types.js';

export const SEMANTIC_CROP_CANDIDATE_VERSION = 'semantic.crop-candidate:v1' as const;
export const CROP_SAFETY_VERSION = 'crop.safety:v1' as const;

export const CROP_CANDIDATE_STRATEGIES = [
  'CONTAIN',
  'CENTER_COVER',
  'SAFE_REGION',
  'TOP_TRIM',
  'UI_FOCUS',
  'CUSTOM_SEMANTIC',
] as const;
export type CropCandidateStrategy = (typeof CROP_CANDIDATE_STRATEGIES)[number];

export const CROP_CANDIDATE_STATUSES = ['VALID', 'VALID_WITH_WARNINGS', 'UNSAFE', 'BLOCKED'] as const;
export type CropCandidateStatus = (typeof CROP_CANDIDATE_STATUSES)[number];

export const CROP_GENERATION_STATUSES = ['READY', 'PARTIAL', 'BLOCKED_BY_ASSET_USAGE'] as const;
export type CropGenerationStatus = (typeof CROP_GENERATION_STATUSES)[number];

export const CROP_SAFETY_GROUPS = ['SAFE', 'WARNING', 'UNSAFE'] as const;
export type CropSafetyGroup = (typeof CROP_SAFETY_GROUPS)[number];

export const CROP_RISK_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type CropRiskSeverity = (typeof CROP_RISK_SEVERITIES)[number];

export const CROP_POSITIVE_SIGNALS = [
  'BROWSER_CHROME_EXCLUDED',
  'KEY_EVIDENCE_PRESERVED',
  'PRODUCT_IDENTITY_PRESERVED',
  'TEXT_PRESERVED',
  'HIGH_SEMANTIC_COVERAGE',
] as const;
export type CropPositiveSignal = (typeof CROP_POSITIVE_SIGNALS)[number];

export const CROP_CANDIDATE_RISK_CODES = [
  'TEXT_CUTOFF_RISK',
  'PRODUCT_IDENTITY_LOSS_RISK',
  'EVIDENCE_LOSS_RISK',
  'BROWSER_CHROME_INCLUDED',
  'LOCALHOST_INCLUDED',
  'READABILITY_LOSS',
  'LOW_OCCUPANCY',
  'MOBILE_LEGIBILITY_RISK',
  'LOW_RETAINED_AREA',
  'SEMANTIC_REGION_CONFLICT',
  'TRUTH_RISK',
  'TEMPORAL_REGION_VARIANCE',
  'STATIC_CROP_INSUFFICIENT',
] as const;
export type CropCandidateRiskCode = (typeof CROP_CANDIDATE_RISK_CODES)[number];

export const STATIC_CROP_ASSESSMENTS = [
  'SAFE_STATIC_CROP_AVAILABLE',
  'STATIC_CROP_WITH_WARNINGS',
  'STATIC_CROP_INSUFFICIENT',
  'NOT_EVALUATED',
] as const;
export type StaticCropAssessment = (typeof STATIC_CROP_ASSESSMENTS)[number];

export type CropThresholdConfigV1 = {
  mustKeepMin: number;
  shouldKeepMin: number;
  productUiEnvelopeMin: number;
  claimCriticalMin: number;
  claimCriticalSevereMax: number;
  textCriticalMin: number;
  textNormalMin: number;
  browserChromePreferredMax: number;
  hardExcludeMaxIncluded: number;
  occupancyReadabilityWarnMax: number;
  retainedAreaEvidenceWarnMax: number;
  iouDedupMin: number;
  maxCandidates: number;
};

export type RegionCoverage = {
  regionId: string;
  semanticType?: string;
  coverage: number;
  frameId?: string;
};

export type ConstraintCoverageResult = {
  regionId: string;
  semanticType?: string;
  kind: CropConstraintKind;
  coverage: number;
  satisfied: boolean;
  hard: boolean;
  ruleIds: string[];
};

export type CandidateRiskSignal = {
  code: CropCandidateRiskCode;
  severity: CropRiskSeverity;
  summary: string;
  ruleIds: string[];
  sourceRefs: HybridSourceRef[];
};

export type CandidateExplanation = {
  whyGenerated: string;
  preserved: string[];
  lost: string[];
  risks: string[];
  safetyWhy: string;
};

export type PerFrameSafetyMetrics = {
  frameId: string;
  productUiCoverage: number | null;
  navigationCoverage: number | null;
  textCoverage: number | null;
  browserCoverage: number | null;
  evidenceCoverage: number | null;
  violations: string[];
  warnings: string[];
};

export type AggregateSafetyMetrics = {
  productUiMin: number | null;
  navigationMin: number | null;
  textMin: number | null;
  evidenceMin: number | null;
  browserMax: number | null;
  medianEvidence: number | null;
  worstFrameId: string | null;
  violationCount: number;
};

export type CropSafetyValidationResultV1 = {
  schemaVersion: typeof CROP_SAFETY_VERSION;
  candidateId: string;
  status: CropCandidateStatus;
  hardViolations: string[];
  warnings: string[];
  preservedRegions: RegionCoverage[];
  lostRegions: RegionCoverage[];
  partiallyCutRegions: RegionCoverage[];
  metrics: {
    retainedAreaRatio: number;
    sourceOccupancy: number;
    productUiCoverage: number | null;
    navigationCoverage: number | null;
    textCoverage: number | null;
    evidenceCoverage: number | null;
    browserChromeCoverage: number | null;
    localhostCoverage: number | null;
  };
  perFrame: PerFrameSafetyMetrics[];
  aggregate: AggregateSafetyMetrics;
  safetyGroup: CropSafetyGroup;
  safetyPrecision: 'SAMPLED';
  ruleIds: string[];
  sourceRefs: HybridSourceRef[];
};

export type SemanticCropCandidateV1 = {
  schemaVersion: typeof SEMANTIC_CROP_CANDIDATE_VERSION;
  candidateId: string;
  strategy: CropCandidateStrategy;
  variant?: 'TIGHT' | 'BALANCED' | 'WIDE_SAFE';
  fitMode: FitMode;
  sourceRect: NormalizedRect;
  pixelRect: Rect;
  outputRect: { width: number; height: number };
  normalizedCropRect: NormalizedRect;
  retainedAreaRatio: number;
  sourceOccupancy: number;
  padRequired: boolean;
  aspectHandling: 'CROP_TO_ASPECT' | 'PAD_TO_ASPECT' | 'ALREADY_MATCHES';
  semanticCoverage: number | null;
  evidenceCoverage: number | null;
  textCoverage: number | null;
  productUiCoverage: number | null;
  navigationCoverage: number | null;
  browserChromeCoverage: number | null;
  constraintResults: ConstraintCoverageResult[];
  riskSignals: CandidateRiskSignal[];
  positiveSignals: CropPositiveSignal[];
  explanation: CandidateExplanation;
  generatedFrom: 'geometry' | 'semantic' | 'constraint';
  provenance: { sourceRefs: HybridSourceRef[]; ruleIds: string[] };
  status: CropCandidateStatus;
  safety: CropSafetyValidationResultV1;
  safetyPrecision: 'SAMPLED';
  notFrameAccurate: true;
  winner: false;
  selected: false;
};

export type CropCandidateGenerationResultV1 = {
  schemaVersion: typeof SEMANTIC_CROP_CANDIDATE_VERSION;
  safetySchemaVersion: typeof CROP_SAFETY_VERSION;
  assetId: string;
  generationStatus: CropGenerationStatus;
  skipReason?: string;
  candidates: SemanticCropCandidateV1[];
  skippedStrategies: Array<{ strategy: CropCandidateStrategy; reason: string }>;
  deduped: Array<{ droppedId: string; keptId: string; iou: number }>;
  temporalVariance: boolean;
  staticCropAssessment: StaticCropAssessment;
  safetyPrecision: 'SAMPLED';
  displayOrder: 'SAFE_THEN_WARNING_THEN_UNSAFE';
  winner: 'NOT_SELECTED';
  finalFitMode: 'NOT_SELECTED';
  directorDecision: 'NOT_PERFORMED';
  ffmpegExecuted: false;
};

export type CropCandidateDraft = Omit<
  SemanticCropCandidateV1,
  | 'safety'
  | 'status'
  | 'riskSignals'
  | 'positiveSignals'
  | 'constraintResults'
  | 'semanticCoverage'
  | 'evidenceCoverage'
  | 'textCoverage'
  | 'productUiCoverage'
  | 'navigationCoverage'
  | 'browserChromeCoverage'
> & {
  riskSignals?: CandidateRiskSignal[];
  positiveSignals?: CropPositiveSignal[];
  constraintResults?: ConstraintCoverageResult[];
};

export class CropRectValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CropRectValidationError';
    this.code = code;
  }
}
