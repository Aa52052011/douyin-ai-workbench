import type { NormalizedRect } from '../../visual/geometry/types.js';
import type { VisualSemanticObservationType } from './observation.types.js';
import type { SubjectType, UiFocusRole } from './focus-subject.types.js';
import type { PrivacyCategory, WatermarkType } from './authenticity-privacy.types.js';

export const PROVIDER_FAMILIES = ['MOCK', 'OPENAI_COMPATIBLE', 'NATIVE_MULTIMODAL', 'CUSTOM'] as const;
export type VisualSemanticProviderFamily = (typeof PROVIDER_FAMILIES)[number];

export const PROVIDER_MEDIA_KINDS = ['IMAGE', 'VIDEO'] as const;
export type ProviderMediaKind = (typeof PROVIDER_MEDIA_KINDS)[number];

export const PROVIDER_ANALYSIS_MODES = ['IMAGE_SINGLE', 'VIDEO_FRAME_SET'] as const;
export type ProviderAnalysisMode = (typeof PROVIDER_ANALYSIS_MODES)[number];

export const FRAME_SELECTION_REASONS = [
  'UNIFORM',
  'IMAGE_PRIMARY',
  'START_REPRESENTATIVE',
  'END_REPRESENTATIVE',
  'UNIFORM_REPRESENTATIVE',
  'SCENE_CANDIDATE',
  'ACTIVITY_CHANGE',
  'LONG_STATIC_REPRESENTATIVE',
  'HIGH_CHANGE_REPRESENTATIVE',
  'MANUAL',
  'DEDUP_REPLACEMENT',
] as const;
export type FrameSelectionReason = (typeof FRAME_SELECTION_REASONS)[number];

export const PROVIDER_TASK_MODULES = [
  'UI_STRUCTURE',
  'AUTHENTICITY',
  'PRIVACY',
  'WATERMARK',
  'DEVELOPER_ARTIFACT',
  'TEXT_EVIDENCE',
  'EVIDENCE',
  'PROJECT_RELEVANCE_EVIDENCE',
] as const;
export type ProviderTaskModule = (typeof PROVIDER_TASK_MODULES)[number];

export const FORBIDDEN_PROVIDER_TASK_MODULES = ['PROJECT_RELEVANCE', 'PROJECT_RELEVANCE_FINAL'] as const;

export const MEDIA_REF_KINDS = ['BUFFER', 'SIGNED_URL', 'LOCAL_REF', 'UPLOAD_TOKEN', 'FIXTURE_REF'] as const;
export type MediaRefKind = (typeof MEDIA_REF_KINDS)[number];

export type SemanticMediaRef = {
  kind: MediaRefKind;
  reference: string;
};

export type SemanticFrameInput = {
  frameId: string;
  timestampMs?: number;
  width: number;
  height: number;
  mediaRef: SemanticMediaRef;
  selectionReason: FrameSelectionReason[];
};

export type VisualSemanticProviderCapabilities = {
  imageAnalysis: boolean;
  multiFrameAnalysis: boolean;
  structuredOutput: boolean;
  ocr: boolean;
  regionGrounding: boolean;
  temporalReasoning: boolean;
};

export type VisualSemanticAnalysisRequest = {
  requestId: string;
  assetId: string;
  contentHash?: string;
  mediaKind: ProviderMediaKind;
  analysisMode: ProviderAnalysisMode;
  frames: SemanticFrameInput[];
  taskModules: ProviderTaskModule[];
  projectContext?: { projectId?: string };
  platformContext?: { platformId?: string };
  schemaVersion: 'visual.semantic.provider-request:v1';
  promptVersion: 'visual.semantic.base:v1';
  timeoutMs?: number;
  durationMs?: number;
};

export const TEXT_EVIDENCE_SOURCES = ['VISION_TEXT', 'OCR', 'PROVIDER_NATIVE_OCR'] as const;
export type TextEvidenceSource = (typeof TEXT_EVIDENCE_SOURCES)[number];

export type TextEvidenceFragment = {
  text: string;
  confidence: number;
  region?: NormalizedRect;
  frameId: string;
  source: TextEvidenceSource;
};

export type VisualObservationEvidence = {
  frameIds: string[];
  regions?: NormalizedRect[];
  textFragments?: TextEvidenceFragment[];
  visualSignals?: string[];
};

export const UNCERTAINTY_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type UncertaintyLevel = (typeof UNCERTAINTY_LEVELS)[number];

export type SemanticUncertainty = {
  level: UncertaintyLevel;
  reasons: string[];
};

export const OBSERVATION_STATES = ['UNKNOWN', 'UNCERTAIN', 'NOT_OBSERVED'] as const;
export type ObservationState = (typeof OBSERVATION_STATES)[number];

export const PROVIDER_OBSERVATION_SOURCES = ['VISION_PROVIDER', 'MOCK_PROVIDER'] as const;
export type ProviderObservationSource = (typeof PROVIDER_OBSERVATION_SOURCES)[number];

export type ProviderSemanticObservation = {
  observationId: string;
  type: VisualSemanticObservationType;
  confidence: number;
  source: ProviderObservationSource;
  evidence: VisualObservationEvidence;
  uncertainty: SemanticUncertainty;
  region?: NormalizedRect;
  startMs?: number;
  endMs?: number;
  observationState?: ObservationState;
};

export type ProviderSemanticRegion = {
  regionId: string;
  type: VisualSemanticObservationType;
  rect: NormalizedRect;
  confidence: number;
  temporalRange?: { startMs: number; endMs: number };
  attributes: Record<string, string | number | boolean | undefined>;
  source: ProviderObservationSource;
};

export type ProviderUiFocusCandidate = {
  region: NormalizedRect;
  confidence: number;
  role: UiFocusRole;
  importanceSignals: string[];
};

export type ProviderSubjectCandidate = {
  type: SubjectType;
  region: NormalizedRect;
  confidence: number;
  prominence: number;
};

export const BROWSER_CHROME_SIGNALS = [
  'TAB_LIKE_STRUCTURE',
  'ADDRESS_BAR_LIKE',
  'ADDRESS_BAR_LIKE_STRUCTURE',
  'BROWSER_CONTROLS_LAYOUT',
  'BROWSER_CONTROL_LAYOUT',
  'URL_LIKE_TEXT',
  'TOP_PERSISTENCE',
] as const;
export type BrowserChromeSignal = (typeof BROWSER_CHROME_SIGNALS)[number];

export type ProviderBrowserChromeObservation = {
  region: NormalizedRect;
  confidence: number;
  signals: BrowserChromeSignal[];
  evidenceFrameIds: string[];
};

export const PROVIDER_DEVELOPER_ARTIFACT_TYPES = [
  'LOCALHOST',
  'LOOPBACK_IP',
  'DEV_LABEL',
  'DEV_SERVER_LABEL',
  'DEBUG_OVERLAY',
  'EDITOR_CHROME',
  'TERMINAL',
  'TEST_DATA',
  'MOCK_LABEL',
  'PLACEHOLDER_LABEL',
] as const;
export type ProviderDeveloperArtifactType = (typeof PROVIDER_DEVELOPER_ARTIFACT_TYPES)[number];

export type ProviderDeveloperArtifactObservation = {
  type: ProviderDeveloperArtifactType;
  region?: NormalizedRect;
  confidence: number;
  evidence: VisualObservationEvidence;
};

export const PROVIDER_AUTHENTICITY_TYPES = [
  'STALE_CANDIDATE',
  'MOCK_CANDIDATE',
  'DEMO',
  'PLACEHOLDER',
  'UNRELATED_CANDIDATE',
  'LIKELY_REAL',
  'LIKELY_MOCK',
  'UNCERTAIN',
] as const;
export type ProviderAuthenticityType = (typeof PROVIDER_AUTHENTICITY_TYPES)[number];

export const FORBIDDEN_AUTHENTICITY_TYPES = ['REAL', 'FAKE', 'STALE', 'MOCK', 'UNRELATED', 'CONFIRMED_STALE', 'CONFIRMED_MOCK'] as const;

export type ProviderAuthenticityObservation = {
  type: ProviderAuthenticityType;
  confidence: number;
  evidence: VisualObservationEvidence;
};

export type ProviderWatermarkObservation = {
  type: WatermarkType;
  region: NormalizedRect;
  confidence: number;
  text?: string;
  brand?: string;
};

export const PRIVACY_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type PrivacySeverity = (typeof PRIVACY_SEVERITIES)[number];

export type ProviderPrivacyObservation = {
  category: PrivacyCategory;
  region: NormalizedRect;
  confidence: number;
  severity: PrivacySeverity;
};

export const PROVIDER_RESULT_STATUSES = ['READY', 'PARTIAL', 'FAILED'] as const;
export type ProviderResultStatus = (typeof PROVIDER_RESULT_STATUSES)[number];

export const MODULE_RESULT_STATUSES = ['READY', 'FAILED', 'SKIPPED'] as const;
export type ModuleResultStatus = (typeof MODULE_RESULT_STATUSES)[number];

export type ProviderModuleResult = {
  module: ProviderTaskModule;
  status: ModuleResultStatus;
  warnings: string[];
};

export type ProviderUsageHint = {
  latencyMs?: number;
  inputUnits?: number;
  outputUnits?: number;
  cost?: number;
};

export type VisualSemanticProviderResult = {
  providerId: string;
  providerFamily: VisualSemanticProviderFamily;
  requestId: string;
  status: ProviderResultStatus;
  observations: ProviderSemanticObservation[];
  semanticRegions: ProviderSemanticRegion[];
  uiFocusCandidates?: ProviderUiFocusCandidate[];
  subjectCandidates?: ProviderSubjectCandidate[];
  browserChromeObservations?: ProviderBrowserChromeObservation[];
  developerArtifactObservations?: ProviderDeveloperArtifactObservation[];
  authenticityObservations?: ProviderAuthenticityObservation[];
  watermarkObservations?: ProviderWatermarkObservation[];
  privacyObservations?: ProviderPrivacyObservation[];
  textEvidence?: TextEvidenceFragment[];
  moduleResults?: ProviderModuleResult[];
  warnings: string[];
  usage?: ProviderUsageHint;
  rawMetadata?: { fixtureId?: string };
  schemaVersion: 'visual.semantic.provider-result:v1';
};

export type VisualSemanticLogMeta = {
  requestId: string;
  providerId: string;
  module?: ProviderTaskModule;
  status: ProviderResultStatus | 'FAILED';
  latencyMs?: number;
};
