import type { TruthLabel } from './authenticity-privacy.types.js';

export const PROJECT_RELEVANCE = ['HIGH', 'MEDIUM', 'LOW', 'UNRELATED', 'UNKNOWN'] as const;
export type ProjectRelevance = (typeof PROJECT_RELEVANCE)[number];

export const EVIDENCE_VALUE_LEVEL = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type EvidenceValueLevel = (typeof EVIDENCE_VALUE_LEVEL)[number];

export type EvidenceValueAssessment = {
  score: number;
  level: EvidenceValueLevel;
  reasons: string[];
  confidence: number;
};

export type ProjectContextEvaluation = {
  schemaVersion: 'visual.context:v1';
  relevance: ProjectRelevance;
  relevanceReasons: string[];
  authenticity: TruthLabel;
  staleness: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  evidenceValue: EvidenceValueAssessment;
  usageRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  warnings: string[];
};

export const ASSET_USAGE = ['PREFERRED', 'USABLE', 'LIMITED', 'AVOID', 'DO_NOT_USE', 'UNKNOWN'] as const;
export type AssetUsageAssessment = (typeof ASSET_USAGE)[number];

export const DO_NOT_USE_REASONS = [
  'CONFIRMED_PRIVACY_VIOLATION',
  'CONFIRMED_UNRELATED_STALE_CONTENT',
  'CONFIRMED_MISLEADING_MOCK_EVIDENCE',
  'FORBIDDEN_ASSET',
  'RIGHTS_ISSUE',
] as const;

export const LIMITED_REASONS = [
  'BROWSER_CHROME',
  'LOW_READABILITY',
  'HEAVY_UI_CLUTTER',
  'PARTIAL_RELEVANCE',
  'LOW_EVIDENCE_VALUE',
  'SEMANTIC_CROP_UNCERTAIN',
] as const;

export type AssetUsageResult = {
  assessment: AssetUsageAssessment;
  reasons: string[];
  blocking: boolean;
  finalShotDecision: false;
};

export const CLAIM_SUPPORT = ['SUPPORTED', 'PARTIALLY_SUPPORTED', 'NOT_SUPPORTED', 'UNKNOWN'] as const;
export type ClaimSupportLevel = (typeof CLAIM_SUPPORT)[number];

export type ClaimEvidenceAssessment = {
  claimId: string;
  supportLevel: ClaimSupportLevel;
  evidenceRegions: string[];
  confidence: number;
  warnings: string[];
};

export const HUMAN_OVERRIDE_ACTIONS = [
  'USE',
  'DO_NOT_USE',
  'MUST_KEEP_REGION',
  'IGNORE_REGION',
  'THIS_IS_PRODUCT_UI',
  'THIS_IS_BROWSER_CHROME',
] as const;

export const HUMAN_OVERRIDE_SCOPE = ['ASSET', 'PROJECT', 'SHOT'] as const;

export type HumanVisualOverride = {
  action: (typeof HUMAN_OVERRIDE_ACTIONS)[number];
  scope: (typeof HUMAN_OVERRIDE_SCOPE)[number];
  regionId?: string;
  note?: string;
};

export type AssetProvenanceInput = {
  uploadOrigin?: string;
  createdAt?: string;
  associatedPlanId?: string;
  associatedScriptId?: string;
  generationSource?: string;
  humanLabel?: string;
  knownPreviousUsage?: string[];
};

export type ProfileSuitabilityAssessment = {
  readability: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  evidenceFit: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  subjectFit: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  uiDensity: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  cropFeasibility: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  usageRisk: 'LOW' | 'MEDIUM' | 'HIGH';
};
