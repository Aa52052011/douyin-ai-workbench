import type { NormalizedRect } from '../../visual/geometry/types.js';
import type { VisualSemanticObservationType } from '../contracts/observation.types.js';
import type { UncertaintyLevel } from '../contracts/provider-runtime.types.js';

export const MODEL_OUTPUT_SCHEMA_VERSION = 'visual.semantic.model-output:v1' as const;

export const MODEL_OUTPUT_UNCERTAINTY_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const satisfies readonly UncertaintyLevel[];

export const MODEL_OUTPUT_OBSERVATION_TYPES = [
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
  'SCREEN',
  'DOCUMENT',
  'BRAND_ELEMENT',
  'UNKNOWN_STRUCTURED_REGION',
  'DEVELOPER_ARTIFACT',
  'LOCALHOST_REFERENCE',
  'TERMINAL',
] as const satisfies readonly VisualSemanticObservationType[];

export type ModelOutputObservationType = (typeof MODEL_OUTPUT_OBSERVATION_TYPES)[number];

export type VisualSemanticModelUncertaintyV1 = {
  level: (typeof MODEL_OUTPUT_UNCERTAINTY_LEVELS)[number];
  reasons: string[];
};

export type VisualSemanticModelObservationV1 = {
  type: ModelOutputObservationType;
  confidence: number;
  visualSignals: string[];
  uncertainty: VisualSemanticModelUncertaintyV1;
  frameId: string;
  region?: NormalizedRect;
  text?: string;
};

export type VisualSemanticModelOutputV1 = {
  observations: VisualSemanticModelObservationV1[];
};

export const MODEL_OUTPUT_TOP_LEVEL_KEYS = ['observations'] as const;
export const MODEL_OUTPUT_OBSERVATION_KEYS = ['type', 'confidence', 'visualSignals', 'uncertainty', 'frameId', 'region', 'text'] as const;

export const ADAPTER_INJECTED_FIELDS = [
  'providerId',
  'providerFamily',
  'requestId',
  'schemaVersion',
  'source',
  'observationId',
  'evidence.frameIds',
  'status',
  'warnings',
  'semanticRegions',
  'moduleResults',
] as const;

export const MODEL_GENERATED_FIELDS = ['type', 'confidence', 'visualSignals', 'uncertainty', 'frameId', 'region', 'text'] as const;
