import type { FitMode, NormalizedRect } from '../visual/geometry/types.js';
import type { AssetUsageAssessmentV1, ClaimEvidenceAssessmentV1, ContextEvidenceRef, ProjectContextEvaluationV1 } from '../visual-context/context.types.js';

export const HYBRID_SCHEMA_VERSION = 'visual.hybrid:v1' as const;
export const SEMANTIC_CROP_INPUT_VERSION = 'semantic.crop-input:v1' as const;

export const HYBRID_SOURCE_KINDS = [
  'DETERMINISTIC_FACT',
  'VISION_OBSERVATION',
  'CONTEXT_EVALUATION',
  'HUMAN_FACT',
  'DERIVED_RELATIONSHIP',
] as const;
export type HybridSourceKind = (typeof HYBRID_SOURCE_KINDS)[number];

export const HYBRID_STATUS = ['READY', 'PARTIAL', 'BLOCKED'] as const;
export type HybridStatus = (typeof HYBRID_STATUS)[number];

export const CROP_CONSTRAINT_KINDS = [
  'MUST_KEEP',
  'SHOULD_KEEP',
  'AVOID_CROP',
  'PREFER_EXCLUDE',
  'HARD_EXCLUDE',
  'INFORMATIONAL',
] as const;
export type CropConstraintKind = (typeof CROP_CONSTRAINT_KINDS)[number];

export const HYBRID_CONFLICT_TYPES = [
  'GEOMETRY_SEMANTIC_CONFLICT',
  'SEMANTIC_CONTEXT_CONFLICT',
  'HUMAN_SEMANTIC_CONFLICT',
  'USAGE_REGION_CONFLICT',
  'TRUTH_REGION_CONFLICT',
] as const;
export type HybridConflictType = (typeof HYBRID_CONFLICT_TYPES)[number];

export const CROP_RISK_CODES = [
  'TEXT_CUTOFF_RISK',
  'PRODUCT_IDENTITY_LOSS',
  'EVIDENCE_LOSS',
  'BROWSER_CHROME_INCLUDED',
  'LOCALHOST_INCLUDED',
  'READABILITY_LOSS',
  'LOW_RETAINED_AREA',
  'SEMANTIC_REGION_CONFLICT',
  'TRUTH_RISK',
] as const;
export type CropRiskCode = (typeof CROP_RISK_CODES)[number];

export const HYBRID_REASON_CODES = [
  'PRODUCT_UI_RELEVANT',
  'CURRENT_PRODUCT_EVIDENCE',
  'BROWSER_CHROME_PRESENT',
  'LOCALHOST_PRESENT',
  'NAVIGATION_EVIDENCE',
  'CONTENT_PANEL_EVIDENCE',
  'TEXT_READABILITY_IMPORTANT',
  'EVIDENCE_REGION_SHOULD_KEEP',
  'PRESENTATION_NOISE_PREFER_EXCLUDE',
  'STALE_ASSET_BLOCK',
  'MOCK_CONTAMINATION_BLOCK',
  'CLAIM_NOT_SUPPORTED',
  'LOW_RETAINED_AREA_RISK',
  'TEXT_CUTOFF_RISK',
  'PRODUCT_IDENTITY_LOSS_RISK',
] as const;
export type HybridReasonCode = (typeof HYBRID_REASON_CODES)[number];

export const HYBRID_PRECEDENCE = [
  'SAFETY_PRIVACY_RIGHTS',
  'TRUTH',
  'HUMAN_FACTUAL_CONFIRMATION',
  'CONTEXT_EVALUATION',
  'VISION_SEMANTIC',
  'DETERMINISTIC_GEOMETRY',
  'CREATIVE_PREFERENCE',
] as const;

export const AVAILABLE_FIT_MODES: FitMode[] = ['CONTAIN', 'COVER', 'CUSTOM'];
export const AVAILABLE_CROP_STRATEGIES = ['NONE', 'CENTER', 'SAFE_REGION', 'TOP_TRIM_CANDIDATE', 'UI_FOCUS', 'CUSTOM'] as const;

export type HybridSourceRef = ContextEvidenceRef & { kind: HybridSourceKind };

export type SemanticObservationLite = {
  type: string;
  frameId: string;
  confidence?: number;
  region?: NormalizedRect;
  uncertaintyLevel?: string;
};

export type GeometryProfile = {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
};

export type HybridRegionFlags = {
  mustKeep?: true;
  avoidCrop?: true;
  presentationNoise?: true;
  truthSensitive?: true;
  privacySensitive?: true;
  evidenceBearing?: true;
  developerContext?: true;
};

export type HybridVisualRegion = {
  id: string;
  semanticType?: string;
  rect?: NormalizedRect;
  frameIds: string[];
  sourceRefs: HybridSourceRef[];
  confidence?: number;
  uncertainty?: string;
  persistence?: 'sampled';
  role?: string;
  flags: HybridRegionFlags;
};

export type HybridVisualConflict = {
  type: HybridConflictType;
  summary: string;
  sourceRefs: HybridSourceRef[];
  ruleIds: string[];
};

export type CropConstraintRegion = {
  regionId: string;
  semanticType?: string;
  kind: CropConstraintKind;
  reasons: HybridReasonCode[];
  sourceRefs: HybridSourceRef[];
  ruleIds: string[];
};

export type CropRiskSignal = {
  code: CropRiskCode;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  appliesTo: string;
  reasons: HybridReasonCode[];
  sourceRefs: HybridSourceRef[];
  ruleIds: string[];
};

export type GeometryCandidateSummary = {
  id: string;
  type: 'CENTER' | 'CONTAIN' | 'SAFE_GEOMETRY' | 'TOP_TRIM_CANDIDATE';
  fitMode: FitMode;
  retainedAreaRatio: number;
  outputOccupancy: number;
  source: 'DETERMINISTIC_FACT';
  note: 'NOT_FINAL_DIRECTOR_SELECTION';
};

export type ClaimRegionLink = {
  claimId: string;
  regionId?: string;
  semanticType?: string;
  claimCritical: boolean;
  support: ClaimEvidenceAssessmentV1['support'];
  reasons: HybridReasonCode[];
};

export type HybridTemporalSummary = {
  frameIds: string[];
  precision: 'sampled';
  notFrameAccurate: true;
};

export type HybridVisualAnalysisResultV1 = {
  schemaVersion: typeof HYBRID_SCHEMA_VERSION;
  assetId: string;
  status: HybridStatus;
  productionEligibility: 'ALLOWED' | 'BLOCKED';
  sourceSummary: {
    deterministic: boolean;
    semantic: boolean;
    context: boolean;
    human: boolean;
  };
  contextEvaluation: ProjectContextEvaluationV1;
  usageAssessment: AssetUsageAssessmentV1;
  regions: HybridVisualRegion[];
  temporalSummary: HybridTemporalSummary;
  conflicts: HybridVisualConflict[];
  warnings: string[];
  limitations: string[];
  provenance: { precedence: typeof HYBRID_PRECEDENCE };
  finalShotDecision: 'NOT_PERFORMED';
  finalCropDecision: 'NOT_PERFORMED';
};

export type SemanticCropInputAssemblyV1 = {
  schemaVersion: typeof SEMANTIC_CROP_INPUT_VERSION;
  assetId: string;
  status: HybridStatus;
  profile: GeometryProfile;
  geometryCandidates: GeometryCandidateSummary[];
  availableFitModes: FitMode[];
  availableStrategies: typeof AVAILABLE_CROP_STRATEGIES;
  constraints: CropConstraintRegion[];
  risks: CropRiskSignal[];
  claimLinks: ClaimRegionLink[];
  winner: 'NOT_SELECTED';
  finalFitMode: 'NOT_SELECTED';
};

export type HybridRegionOverride = {
  kind: 'FORCE_KEEP_REGION' | 'FORCE_EXCLUDE_REGION' | 'CONFIRM_PRESENTATION_NOISE';
  regionId?: string;
  semanticType?: string;
};

export type HybridAssemblyInput = {
  geometry: GeometryProfile;
  observations: SemanticObservationLite[];
  contextEvaluation: ProjectContextEvaluationV1;
  usageAssessment: AssetUsageAssessmentV1;
  claims: ClaimEvidenceAssessmentV1[];
  regionOverrides?: HybridRegionOverride[];
};
