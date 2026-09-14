import {
  ADAPTER_INJECTED_FIELDS,
  MODEL_GENERATED_FIELDS,
  MODEL_OUTPUT_OBSERVATION_KEYS,
} from './model-output.types.js';
import type { ModelOutputValidationFailureSnapshot } from './model-output-enum-validation-error.js';

export type LayerStatus = 'PASS' | 'FAIL' | 'NOT_RUN';

export type AdapterPipelineMeta = {
  assistantContentExists: boolean;
  assistantContentType: string;
  assistantContentLength: number;
  jsonParseNative: LayerStatus;
  jsonSyntax: LayerStatus;
  repairUsed: boolean;
  rawSchemaPass: boolean;
  topLevelKeys: string[];
  observationCount: number | null;
  perObservationKeySets: string[][];
  modelFacingSchema: LayerStatus;
  modelSchemaErrorPaths: string[];
  adapterMapping: LayerStatus;
  injectedFields: readonly string[];
  derivedFields: string[];
  preservedModelFields: readonly string[];
  internalB2Schema: LayerStatus;
  internalSchemaErrorPaths: string[];
  normalization: LayerStatus;
  observationCountNormalized: number | null;
  semanticRegionsCount: number | null;
  stableIds: string[];
  sanitizedModelOutput: unknown | null;
  modelSchemaFailure: ModelOutputValidationFailureSnapshot | null;
  httpStatus: number | null;
  latencyMs: number | null;
  usage: {
    inputTextUnits: number | null;
    outputUnits: number | null;
    totalUnits: number | null;
    cost: number | null;
    costStatus: 'PRICED' | 'UNPRICED';
  } | null;
};

export function emptyPipelineMeta(): AdapterPipelineMeta {
  return {
    assistantContentExists: false,
    assistantContentType: 'missing',
    assistantContentLength: 0,
    jsonParseNative: 'NOT_RUN',
    jsonSyntax: 'NOT_RUN',
    repairUsed: false,
    rawSchemaPass: false,
    topLevelKeys: [],
    observationCount: null,
    perObservationKeySets: [],
    modelFacingSchema: 'NOT_RUN',
    modelSchemaErrorPaths: [],
    adapterMapping: 'NOT_RUN',
    injectedFields: ADAPTER_INJECTED_FIELDS,
    derivedFields: ['evidence.frameIds', 'semanticRegions(from observation.region only)', 'textFragments.frameId'],
    preservedModelFields: MODEL_GENERATED_FIELDS,
    internalB2Schema: 'NOT_RUN',
    internalSchemaErrorPaths: [],
    normalization: 'NOT_RUN',
    observationCountNormalized: null,
    semanticRegionsCount: null,
    stableIds: [],
    sanitizedModelOutput: null,
    modelSchemaFailure: null,
    httpStatus: null,
    latencyMs: null,
    usage: null,
  };
}

export function jsonShape(value: unknown): Pick<AdapterPipelineMeta, 'topLevelKeys' | 'observationCount' | 'perObservationKeySets'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { topLevelKeys: [], observationCount: null, perObservationKeySets: [] };
  }
  const record = value as Record<string, unknown>;
  const observations = Array.isArray(record.observations) ? record.observations : [];
  return {
    topLevelKeys: Object.keys(record),
    observationCount: observations.length,
    perObservationKeySets: observations.map((item) =>
      item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item as object) : [],
    ),
  };
}

function clipString(value: string): string {
  return value.length > 240 ? `${value.slice(0, 240)}…` : value;
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === 'string') {
    if (/^data:/i.test(value) || /base64,/i.test(value)) {
      return '[redacted-data]';
    }
    return clipString(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 32).map((item) => sanitizeUnknown(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/authorization|api[_-]?key|bearer|secret/i.test(key)) {
        continue;
      }
      out[key] = sanitizeUnknown(child);
    }
    return out;
  }
  return value;
}

export function sanitizeModelOutputSnapshot(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return sanitizeUnknown(value);
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.observations)) {
    return { topLevelKeys: Object.keys(record) };
  }
  return {
    observations: record.observations.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { invalid: true };
      }
      const obs = item as Record<string, unknown>;
      const picked: Record<string, unknown> = {};
      for (const key of MODEL_OUTPUT_OBSERVATION_KEYS) {
        if (obs[key] !== undefined) {
          picked[key] = sanitizeUnknown(obs[key]);
        }
      }
      return picked;
    }),
  };
}
