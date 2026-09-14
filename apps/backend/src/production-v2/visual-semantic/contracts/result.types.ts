import type { DeterministicVisualFacts } from '../../visual/deterministic-visual.types.js';
import type { VisualSemanticObservation, MustKeepCandidate, SemanticRegion, TemporalSemanticRegion } from './observation.types.js';
import type { BrowserChromeObservation, SubjectCandidate, UIFocusCandidate } from './focus-subject.types.js';
import type {
  ContentAuthenticityObservation,
  DeveloperArtifactObservation,
  OcrFragment,
  PrivacyObservation,
  WatermarkObservation,
} from './authenticity-privacy.types.js';
import type {
  AssetUsageResult,
  ClaimEvidenceAssessment,
  HumanVisualOverride,
  ProfileSuitabilityAssessment,
  ProjectContextEvaluation,
} from './context-usage.types.js';
import type { SemanticCropCandidate, VisualAnalysisConflict } from './crop-hybrid.types.js';
import type { VisualAnalysisStatus } from './versions.js';

export const VISUAL_ANALYSIS_WARNINGS = [
  'BROWSER_CHROME_CANDIDATE',
  'DEVELOPER_ARTIFACT_CANDIDATE',
  'STALE_CONTENT_CANDIDATE',
  'MOCK_CONTENT_CANDIDATE',
  'PRIVACY_RISK_CANDIDATE',
  'WATERMARK_CANDIDATE',
  'LOW_UI_READABILITY',
  'LOW_PROJECT_RELEVANCE',
  'LOW_EVIDENCE_VALUE',
  'SEMANTIC_ANALYSIS_UNAVAILABLE',
] as const;
export type VisualAnalysisWarningCode = (typeof VISUAL_ANALYSIS_WARNINGS)[number];

export const HARD_BLOCK_CODES = [
  'CONFIRMED_PRIVACY_RISK',
  'CONFIRMED_RIGHTS_VIOLATION',
  'CONFIRMED_MISLEADING_EVIDENCE',
  'FORBIDDEN_ASSET',
] as const;
export type HardBlockCode = (typeof HARD_BLOCK_CODES)[number];

export type VisualSemanticResult = {
  schemaVersion: 'visual.semantic:v1';
  status: 'READY' | 'UNAVAILABLE' | 'FAILED' | 'PENDING';
  observations: VisualSemanticObservation[];
  regions: SemanticRegion[];
  mustKeepCandidates: MustKeepCandidate[];
  uiFocusCandidates: UIFocusCandidate[];
  subjectCandidates: SubjectCandidate[];
  browserChrome: BrowserChromeObservation[];
  developerArtifacts: DeveloperArtifactObservation[];
  authenticity: ContentAuthenticityObservation[];
  watermarks: WatermarkObservation[];
  privacy: PrivacyObservation[];
  ocrFragments: OcrFragment[];
  temporalRegions: TemporalSemanticRegion[];
  occurrenceNotes?: Array<{ type: string; occurrenceRatio: number; firstSeenMs: number; lastSeenMs: number }>;
};

export type VisualAnalysisResult = {
  assetId: string;
  deterministicFacts: DeterministicVisualFacts;
  semanticResult: VisualSemanticResult;
  projectEvaluation: ProjectContextEvaluation | { status: 'UNAVAILABLE' };
  profileSuitability: ProfileSuitabilityAssessment | { status: 'UNAVAILABLE' };
  usageAssessment: AssetUsageResult;
  cropCandidates: SemanticCropCandidate[];
  conflicts: VisualAnalysisConflict[];
  warnings: VisualAnalysisWarningCode[];
  status: VisualAnalysisStatus;
  versions: {
    deterministic: string;
    semantic: 'visual.semantic:v1';
    context: 'visual.context:v1';
    hybrid: 'visual.hybrid:v1';
    frameSelection: 'semantic.frame-selection:v1';
  };
  claims?: ClaimEvidenceAssessment[];
  humanOverrides?: HumanVisualOverride[];
  hardBlocks?: HardBlockCode[];
};

export type HybridVisualAnalysisMergerInput = {
  deterministicFacts: DeterministicVisualFacts;
  semanticResult: VisualSemanticResult;
  projectEvaluation: ProjectContextEvaluation | { status: 'UNAVAILABLE' };
  profileSuitability: ProfileSuitabilityAssessment | { status: 'UNAVAILABLE' };
};

export type HybridVisualAnalysisMerger = {
  merge(input: HybridVisualAnalysisMergerInput): VisualAnalysisResult;
};

export function deriveHybridStatus(input: {
  deterministicStatus: 'READY' | 'PARTIAL' | 'FAILED';
  semanticStatus: VisualSemanticResult['status'];
  contextStatus: 'READY' | 'UNAVAILABLE' | 'FAILED' | 'PENDING';
}): VisualAnalysisStatus {
  if (input.deterministicStatus === 'FAILED') {
    return 'FAILED';
  }
  if (input.deterministicStatus === 'READY' && input.semanticStatus === 'READY' && input.contextStatus === 'READY') {
    return 'READY';
  }
  if (input.deterministicStatus === 'READY' && (input.semanticStatus === 'UNAVAILABLE' || input.semanticStatus === 'FAILED')) {
    return 'PARTIAL';
  }
  if (input.semanticStatus === 'PENDING' || input.contextStatus === 'PENDING') {
    return 'RUNNING';
  }
  return 'PARTIAL';
}
