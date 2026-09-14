import type { NormalizedRect } from '../../visual/geometry/types.js';
import type { CropGeometryCandidate } from '../../visual/crop/crop.types.js';
import type { MustKeepCandidate, SemanticRegion } from './observation.types.js';
import type { SubjectCandidate, UIFocusCandidate } from './focus-subject.types.js';
import type { PrivacyObservation, WatermarkObservation } from './authenticity-privacy.types.js';

export type SemanticCropInput = {
  geometryCandidates: CropGeometryCandidate[];
  mustKeepRegions: MustKeepCandidate[];
  uiFocusCandidates: UIFocusCandidate[];
  subjectCandidates: SubjectCandidate[];
  browserChromeRegions: SemanticRegion[];
  privacyRegions: PrivacyObservation[];
  watermarkRegions: WatermarkObservation[];
  textRegions: SemanticRegion[];
};

export const SEMANTIC_CROP_STRATEGIES = ['SUBJECT', 'UI_FOCUS', 'SAFE_REGION', 'CUSTOM'] as const;
export type SemanticCropStrategy = (typeof SEMANTIC_CROP_STRATEGIES)[number];

export type SemanticCropCandidate = {
  sourceRect: NormalizedRect;
  strategy: SemanticCropStrategy;
  semanticRetentionScore: number;
  mustKeepRetention: number;
  evidenceRetention: number;
  textRetention: number;
  privacyRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  cropRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  signals: string[];
};

export const CONFLICT_RESOLUTIONS = [
  'PREFER_SAFETY',
  'PREFER_MUST_KEEP',
  'PREFER_DETERMINISTIC',
  'PREFER_SEMANTIC',
  'ESCALATE_HUMAN',
  'UNRESOLVED',
] as const;

export type VisualAnalysisConflict = {
  type: string;
  deterministicEvidence: string[];
  semanticEvidence: string[];
  resolution: (typeof CONFLICT_RESOLUTIONS)[number];
  confidence: number;
};
