import type { HybridSourceRef } from '../visual-hybrid/hybrid.types.js';
import type { AxisLabel, DirectorCropOptionV1, HumanReviewTrigger } from '../visual-crop-comparison/comparison.types.js';

export const DIRECTOR_VISUAL_POLICY_VERSION = 'production.director-visual-policy:v1' as const;
export const CROP_SELECTION_DRYRUN_VERSION = 'crop.selection-dryrun:v1' as const;

export const POLICY_RULE_IDS = {
  FILTER_INELIGIBLE: 'DIRECTOR_FILTER_INELIGIBLE',
  PROTECT_CLAIM: 'DIRECTOR_PROTECT_CLAIM_EVIDENCE',
  PROTECT_EVIDENCE: 'DIRECTOR_PROTECT_EVIDENCE',
  EVIDENCE_FLOOR: 'DIRECTOR_EVIDENCE_FLOOR',
  READABILITY_FLOOR: 'DIRECTOR_READABILITY_FLOOR',
  READABILITY_PREFERENCE: 'DIRECTOR_READABILITY_PREFERENCE',
  TEMPORAL_CAUTION: 'DIRECTOR_TEMPORAL_CAUTION',
  PRESENTATION_PREFERENCE: 'DIRECTOR_PRESENTATION_PREFERENCE',
  SOURCE_RETENTION_TIEBREAK: 'DIRECTOR_SOURCE_RETENTION_TIEBREAK',
  LEXICAL_TIEBREAK: 'DIRECTOR_LEXICAL_TIEBREAK',
  REQUEST_NEW: 'DIRECTOR_REQUEST_NEW_CANDIDATE',
  C5_IGNORED: 'DIRECTOR_C5_DOES_NOT_INFLUENCE_SELECTION',
  NO_EXECUTION: 'DIRECTOR_NO_PRODUCTION_EXECUTION',
  NO_HUMAN_APPROVAL: 'DIRECTOR_HUMAN_APPROVAL_NOT_PERFORMED',
  BLOCKED_ASSET: 'DIRECTOR_BLOCKED_BY_ASSET_USAGE',
} as const;

export type DirectorPolicyTraceEntry = {
  ruleId: string;
  affectedCandidates: string[];
  outcome: string;
  evidenceRefs: HybridSourceRef[];
};

export type RejectedEligibleAlternative = {
  candidateId: string;
  strategy: string;
  variant?: string;
  reasons: string[];
};

export type CropSelectionDryRunResultV1 = {
  schemaVersion: typeof CROP_SELECTION_DRYRUN_VERSION;
  policyVersion: typeof DIRECTOR_VISUAL_POLICY_VERSION;
  assetId: string;
  objective: 'BALANCED';
  objectiveBias: 'EVIDENCE_FIRST';
  selectionType: 'SYSTEM_DRY_RUN_SELECTION';
  decisionAllowed: boolean;
  selectedCandidateId: string | null;
  selectedStrategy: string | 'REQUEST_NEW_CANDIDATE' | 'BLOCKED_BY_ASSET_USAGE';
  decision: 'SELECTED' | 'REQUEST_NEW_CANDIDATE' | 'BLOCKED_BY_ASSET_USAGE';
  selectedOption: DirectorCropOptionV1 | null;
  rationale: {
    primaryReasons: string[];
    acceptedTradeoffs: string[];
    rejectedAlternatives: RejectedEligibleAlternative[];
    ineligibleBaselines: Array<{ candidateId: string; reason: 'INELIGIBLE_BY_B2_9_SAFETY' }>;
    comparisonRefs: string[];
    text: string;
  };
  humanReview: {
    recommended: boolean;
    requiredBeforeProduction: boolean;
    reasons: HumanReviewTrigger[];
  };
  humanApproved: false;
  productionExecutionAllowed: false;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  temporalCaution: true;
  requiresBackgroundTreatment: boolean | null;
  dynamicReframeSignal: 'NONE' | 'MAY_BENEFIT_FROM_DYNAMIC_REFRAME' | 'REQUEST_DYNAMIC_REFRAME';
  policyTrace: DirectorPolicyTraceEntry[];
  contractValidation: { ok: boolean; errors: string[] };
  provenance: { ruleIds: string[] };
};

export const POLICY_FLOORS = {
  evidenceMin: 0.5,
  claimMin: 0.5,
  readabilityHardMin: 0.15,
  readabilityPreferNotLow: true,
  metricDelta: 0.05,
} as const;

export type PolicyAxisSnapshot = {
  evidence: number;
  claim: number;
  readability: number;
  readabilityLabel: AxisLabel;
  temporal: number;
  presentation: number;
  sourceRetention: number;
  chromeExclusion: number;
};
