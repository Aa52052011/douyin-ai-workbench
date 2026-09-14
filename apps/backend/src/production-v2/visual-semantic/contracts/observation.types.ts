import type { NormalizedRect } from '../../visual/geometry/types.js';

export const VISUAL_SEMANTIC_OBSERVATION_TYPES = [
  'PRODUCT_UI',
  'BROWSER_CHROME',
  'OS_CHROME',
  'APP_WINDOW_CHROME',
  'TOOLBAR',
  'NAVIGATION',
  'CONTENT_PANEL',
  'TEXT_REGION',
  'BUTTON_LIKE_REGION',
  'FORM_REGION',
  'DIALOG',
  'MODAL',
  'CARD',
  'TABLE',
  'CHART',
  'CODE_BLOCK',
  'TERMINAL',
  'DEVELOPER_ARTIFACT',
  'LOCALHOST_REFERENCE',
  'WATERMARK',
  'LOGO',
  'PERSON',
  'FACE',
  'SCREEN',
  'DOCUMENT',
  'PRIVACY_SENSITIVE',
  'BRAND_ELEMENT',
  'UNKNOWN_STRUCTURED_REGION',
] as const;
export type VisualSemanticObservationType = (typeof VISUAL_SEMANTIC_OBSERVATION_TYPES)[number];

export const OBSERVATION_SOURCE = [
  'VISION',
  'OCR',
  'HYBRID',
  'HUMAN',
  'DETERMINISTIC_HINT',
  'VISION_PROVIDER',
  'MOCK_PROVIDER',
  'OCR_PROVIDER',
  'HYBRID_MERGER',
  'HUMAN_OVERRIDE',
] as const;
export type ObservationSource = (typeof OBSERVATION_SOURCE)[number];

export const UNCERTAINTY = ['UNKNOWN', 'UNCERTAIN', 'NOT_OBSERVED'] as const;
export type UncertaintyToken = (typeof UNCERTAINTY)[number];

export type VisualSemanticObservation = {
  observationId: string;
  type: VisualSemanticObservationType;
  region?: NormalizedRect;
  startMs?: number;
  endMs?: number;
  confidence: number;
  source: ObservationSource;
  evidence: string[];
  uncertainty?: UncertaintyToken;
  frameIds?: string[];
};

export type SemanticRegion = {
  regionId: string;
  type: VisualSemanticObservationType;
  rect: NormalizedRect;
  confidence: number;
  temporalRange?: { startMs: number; endMs: number };
  attributes: Record<string, string | number | boolean | undefined>;
  source: ObservationSource;
};

export type MustKeepCandidate = {
  regionId: string;
  reason: 'PRODUCT_UI_PRIMARY' | 'TEXT_CONTENT' | 'FACE' | 'EVIDENCE_REGION';
  confidence: number;
  source: ObservationSource;
};

export type TemporalSemanticRegion = {
  regionType: VisualSemanticObservationType;
  startMs: number;
  endMs: number;
  representativeFrames: string[];
  confidence: number;
  occurrenceRatio?: number;
  firstSeenMs?: number;
  lastSeenMs?: number;
};
