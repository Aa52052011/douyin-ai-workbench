import type { VisualSemanticProvider } from '../provider/visual-semantic-provider.js';
import type { MultimodalModelClient } from './multimodal-transport.types.js';

/**
 * Design-only. Must not be constructed in B2-3.
 * Layers: VisualSemanticProvider → this adapter → MultimodalModelClient → existing HTTP infra.
 */
export type RealVisualSemanticProviderAdapter = VisualSemanticProvider & {
  readonly multimodalClient: MultimodalModelClient;
};

export const ADAPTER_RESPONSIBILITIES = {
  VisualSemanticProvider: ['semantic request', 'semantic result'],
  MultimodalModelTransport: ['model request', 'image payload', 'HTTP', 'timeout', 'provider response'],
  Normalizer: ['raw structured payload', 'B2-1 schema'],
} as const;

export const SCHEMA_REPAIR_POLICY = {
  maxAttempts: 1,
  withinRemainingBudget: true,
  allow: ['json_syntax', 'field_rename', 'wrapper_unwrap'],
  forbid: ['invent_observation', 'invent_confidence', 'invent_evidence', 'invent_region'],
} as const;

export const COORDINATE_TRANSPORT = {
  modelSpace: 'INT_0_1000',
  businessSpace: 'NormalizedRect_0_1',
  invalid: 'REJECT_NO_SILENT_CLAMP',
  groundingUnreliable: 'KEEP_OBSERVATION_WITHOUT_REGION',
} as const;

export const VISION_ERROR_MAP = {
  MODEL_TIMEOUT: 'PROVIDER_TIMEOUT',
  MODEL_REQUEST_FAILED_NETWORK: 'PROVIDER_UNAVAILABLE',
  HTTP_429_502_503_504: 'PROVIDER_UNAVAILABLE',
  HTTP_400_POLICY: 'CONTENT_REJECTED',
  MALFORMED_JSON: 'INVALID_PROVIDER_RESPONSE',
  B2_1_SCHEMA: 'SCHEMA_VALIDATION_FAILED',
} as const;

export const CONTENT_REJECTION_POLICY = {
  failoverToBypassSafetyFilter: false,
  code: 'CONTENT_REJECTED',
} as const;
