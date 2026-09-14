import type { AssetUsageAssessment, ProjectRelevance } from '../visual-semantic/contracts/context-usage.types.js';

export const VISUAL_CONTEXT_SCHEMA_VERSION = 'visual.context:v1' as const;
export const ASSET_USAGE_SCHEMA_VERSION = 'asset.usage:v1' as const;
export const CLAIM_EVIDENCE_SCHEMA_VERSION = 'claim.evidence:v1' as const;

export const CONTEXT_EVIDENCE_SOURCE_TYPES = [
  'HUMAN_CONFIRMED',
  'HUMAN_EXPECTED',
  'SYSTEM_FACT',
  'VISION_OBSERVATION',
  'DETERMINISTIC_FACT',
] as const;
export type ContextEvidenceSourceType = (typeof CONTEXT_EVIDENCE_SOURCE_TYPES)[number];

export const CONTEXT_REASON_CODES = [
  'CURRENT_PROJECT_ASSET',
  'CURRENT_PRODUCT_UI',
  'STALE_HUMAN_CONFIRMED',
  'MOCK_CONTAMINATION_HUMAN_CONFIRMED',
  'REAL_PRODUCT_EVIDENCE',
  'BROWSER_CHROME_PRESENT',
  'LOCALHOST_PRESENT',
  'EMPTY_STATE_LIMITATION',
  'CLAIM_NOT_VALIDATED',
  'UNRELATED_CONTENT',
  'TRUTH_RISK',
  'INSUFFICIENT_CONTEXT',
  'PRIVACY_BLOCKER',
  'RIGHTS_BLOCKER',
  'PUBLISH_PAGE_UNVALIDATED_CAPABILITY',
  'WORKFLOW_SURFACES_VISIBLE',
  'PRESENTATION_LIMITATION_ONLY',
  'OLD_EMPTY_HOME_LIMITATION',
] as const;
export type ContextReasonCode = (typeof CONTEXT_REASON_CODES)[number];

export const FRESHNESS_STATUS = ['CURRENT', 'POSSIBLY_STALE', 'STALE', 'UNKNOWN'] as const;
export type FreshnessStatus = (typeof FRESHNESS_STATUS)[number];

export const EVIDENCE_VALUE_STATUS = ['HIGH', 'MEDIUM', 'LOW', 'NONE', 'UNKNOWN'] as const;
export type EvidenceValueStatus = (typeof EVIDENCE_VALUE_STATUS)[number];

export const MISLEADING_RISK_LEVEL = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type MisleadingRiskLevel = (typeof MISLEADING_RISK_LEVEL)[number];

export const REPAIRABILITY = [
  'CROP_FIXABLE',
  'MASK_FIXABLE',
  'TEXT_OVERLAY_FIXABLE',
  'SHORT_USE_ONLY',
  'NOT_REPAIRABLE',
  'UNKNOWN',
] as const;
export type Repairability = (typeof REPAIRABILITY)[number];

export const CLAIM_EVIDENCE_SUPPORT = [
  'SUPPORTED',
  'PARTIALLY_SUPPORTED',
  'INSUFFICIENT',
  'CONTRADICTED',
  'NOT_APPLICABLE',
] as const;
export type ClaimEvidenceSupport = (typeof CLAIM_EVIDENCE_SUPPORT)[number];

export const CONTEXT_CONFLICT_TYPES = [
  'HUMAN_VISION_CONFLICT',
  'SYSTEM_VISION_CONFLICT',
  'TRUTH_EVIDENCE_CONFLICT',
  'CONTEXT_EVIDENCE_CONFLICT',
] as const;
export type ContextConflictType = (typeof CONTEXT_CONFLICT_TYPES)[number];

export const HUMAN_ASSET_OVERRIDE_KINDS = [
  'FORCE_AVOID',
  'FORCE_PREFERRED',
  'CONFIRM_CURRENT',
  'CONFIRM_STALE',
  'CONFIRM_MOCK_CONTAMINATION',
  'CONFIRM_NO_KNOWN_OLD_MOCK_CONTAMINATION',
  'CONFIRM_PRIVACY_BLOCKER',
  'CONFIRM_RIGHTS_BLOCKER',
] as const;
export type HumanAssetOverrideKind = (typeof HUMAN_ASSET_OVERRIDE_KINDS)[number];

export const RULE_PRIORITY = [
  'RIGHTS_PRIVACY_SAFETY',
  'TRUTH_HARD_BLOCK',
  'HUMAN_FACTUAL_CONFIRMATION',
  'SYSTEM_PROVENANCE',
  'VISION_OBSERVATION',
  'DETERMINISTIC_VISUAL_QUALITY',
  'CREATIVE_PREFERENCE',
] as const;

export type ContextEvidenceRef = {
  sourceType: ContextEvidenceSourceType;
  sourceId: string;
  field: string;
  valueSummary: string;
  confidence?: number;
};

export type HumanFact = {
  code: ContextReasonCode | 'CURRENT_RECORDING' | 'NO_KNOWN_OLD_MOCK' | 'PRODUCT_INFO_CONVERSATION' | 'PUBLISH_OPS_PAGE';
  sourceType: ContextEvidenceSourceType;
  summary: string;
};

export type HumanAssetOverride = {
  kind: HumanAssetOverrideKind;
  note?: string;
};

export type TruthConstraints = {
  mustUseRealProductEvidence: boolean;
  mustNotRepresentMockAsReal: boolean;
  mustNotClaimUnvalidatedAutomaticPublishing: boolean;
  mustNotImplyGuaranteedGrowth: boolean;
};

export type ProjectContext = {
  projectId: string;
  projectName: string;
  productName: string;
  campaignObjective: string;
  contentPillar: string;
};

export type ContentContext = {
  topicId: string;
  title: string;
};

export type ScriptContext = {
  scriptId: string;
  hook: string;
};

export type AssetFacts = {
  assetId: string;
  mediaKind: 'VIDEO' | 'IMAGE';
  width?: number;
  height?: number;
  durationMs?: number;
};

export type VisualSemanticSummary = {
  observationTypes: string[];
  productUiObserved: boolean;
  navigationObserved: boolean;
  contentPanelObserved: boolean;
  browserChromeObserved: boolean;
  localhostObserved: boolean;
  emptyStateObserved: boolean;
  publishOperationsPageObserved: boolean;
};

export type ProjectContextEvaluationInput = {
  projectContext: ProjectContext;
  contentContext: ContentContext;
  scriptContext: ScriptContext;
  assetFacts: AssetFacts;
  visualSemanticSummary: VisualSemanticSummary;
  humanFacts: HumanFact[];
  overrides: HumanAssetOverride[];
  truthConstraints: TruthConstraints;
};

export type ProjectContextEvaluationV1 = {
  schemaVersion: typeof VISUAL_CONTEXT_SCHEMA_VERSION;
  assetId: string;
  projectId: string;
  topicId: string;
  scriptId: string;
  contextVersion: typeof VISUAL_CONTEXT_SCHEMA_VERSION;
  relevance: { status: ProjectRelevance; score: number; reasons: ContextReasonCode[] };
  freshness: { status: FreshnessStatus; reasons: ContextReasonCode[] };
  evidenceValue: { status: EvidenceValueStatus; reasons: ContextReasonCode[] };
  misleadingRisk: { level: MisleadingRiskLevel; reasons: ContextReasonCode[] };
  truthSupport: ContextReasonCode[];
  conflicts: Array<{ type: ContextConflictType; summary: string }>;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  sourceRefs: ContextEvidenceRef[];
  triggeredRules: string[];
};

export type AssetUsageAssessmentV1 = {
  schemaVersion: typeof ASSET_USAGE_SCHEMA_VERSION;
  assetId: string;
  status: AssetUsageAssessment;
  reasons: ContextReasonCode[];
  constraints: string[];
  repairability: Repairability;
  evidenceRefs: ContextEvidenceRef[];
  contextVersion: typeof VISUAL_CONTEXT_SCHEMA_VERSION;
  triggeredRules: string[];
  humanOverrideApplied: HumanAssetOverrideKind[];
  finalShotDecision: false;
};

export type ClaimEvidenceAssessmentV1 = {
  schemaVersion: typeof CLAIM_EVIDENCE_SCHEMA_VERSION;
  assetId: string;
  claimId: string;
  claimText: string;
  support: ClaimEvidenceSupport;
  reasons: ContextReasonCode[];
  evidenceRefs: ContextEvidenceRef[];
};

export type { AssetUsageAssessment, ProjectRelevance };
