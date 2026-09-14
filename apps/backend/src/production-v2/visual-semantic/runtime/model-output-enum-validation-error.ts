import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import {
  MODEL_OUTPUT_OBSERVATION_TYPES_ENUM_ID,
  sanitizeRejectedEnumToken,
} from './sanitize-rejected-enum-token.js';

export const ENUM_VALIDATION_FAILED = 'ENUM_VALIDATION_FAILED' as const;

export type ModelOutputValidationFailureSnapshot = {
  validationStage: 'MODEL_FACING_SCHEMA';
  code: typeof ENUM_VALIDATION_FAILED;
  path: string;
  observationIndex: number | null;
  field: string;
  rejectedValue: string;
  rejectedValueRedacted: boolean;
  originalValueType: string;
  expectedEnumId: typeof MODEL_OUTPUT_OBSERVATION_TYPES_ENUM_ID;
  observationKeys: string[];
  repairAttempted: false;
};

export type ModelOutputEnumValidationFields = {
  path: string;
  observationIndex: number | null;
  field: string;
  rawValue: unknown;
  observationKeys: string[];
};

export class ModelOutputEnumValidationError extends VisualSemanticProviderError {
  readonly diagnosticCode = ENUM_VALIDATION_FAILED;
  readonly path: string;
  readonly observationIndex: number | null;
  readonly field: string;
  readonly rejectedValueSanitized: string;
  readonly rejectedValueRedacted: boolean;
  readonly originalValueType: string;
  readonly expectedEnumId = MODEL_OUTPUT_OBSERVATION_TYPES_ENUM_ID;
  readonly observationKeys: string[];

  constructor(fields: ModelOutputEnumValidationFields) {
    super('SCHEMA_VALIDATION_FAILED', `model-output:${fields.path}:enum`);
    this.name = 'ModelOutputEnumValidationError';
    this.path = fields.path;
    this.observationIndex = fields.observationIndex;
    this.field = fields.field;
    const sanitized = sanitizeRejectedEnumToken(fields.rawValue);
    this.rejectedValueSanitized = sanitized.rejectedValue;
    this.rejectedValueRedacted = sanitized.redacted;
    this.originalValueType = sanitized.originalType;
    this.observationKeys = [...fields.observationKeys];
  }

  toSnapshot(): ModelOutputValidationFailureSnapshot {
    return buildModelOutputValidationFailureSnapshot(this);
  }
}

export function isModelOutputEnumValidationError(error: unknown): error is ModelOutputEnumValidationError {
  return error instanceof ModelOutputEnumValidationError;
}

export function parseObservationTypePath(label: string): { path: string; observationIndex: number | null; field: string } {
  const match = /^observations\[(\d+)\]\.type$/.exec(label);
  if (!match) {
    return { path: label, observationIndex: null, field: 'type' };
  }
  return { path: label, observationIndex: Number(match[1]), field: 'type' };
}

export function buildModelOutputValidationFailureSnapshot(
  error: ModelOutputEnumValidationError,
): ModelOutputValidationFailureSnapshot {
  return {
    validationStage: 'MODEL_FACING_SCHEMA',
    code: ENUM_VALIDATION_FAILED,
    path: error.path,
    observationIndex: error.observationIndex,
    field: error.field,
    rejectedValue: error.rejectedValueSanitized,
    rejectedValueRedacted: error.rejectedValueRedacted,
    originalValueType: error.originalValueType,
    expectedEnumId: error.expectedEnumId,
    observationKeys: error.observationKeys,
    repairAttempted: false,
  };
}
