import { validateNormalizedRect } from '../../visual/geometry/normalized-rect.js';
import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import {
  asEnum,
  asFiniteNumber,
  asString,
  assertAllowedKeys,
  assertNoForbiddenKeys,
  isPlainObject,
} from '../schema/unknown-keys.js';
import {
  ModelOutputEnumValidationError,
  parseObservationTypePath,
} from './model-output-enum-validation-error.js';
import {
  MODEL_OUTPUT_OBSERVATION_TYPES,
  MODEL_OUTPUT_UNCERTAINTY_LEVELS,
  type VisualSemanticModelObservationV1,
  type VisualSemanticModelOutputV1,
} from './model-output.types.js';

function failModel(detail: string): never {
  throw new VisualSemanticProviderError('SCHEMA_VALIDATION_FAILED', `model-output:${detail}`);
}

export function validateVisualSemanticModelOutput(
  raw: unknown,
  options?: { allowedFrameIds?: readonly string[] },
): VisualSemanticModelOutputV1 {
  try {
    return validateVisualSemanticModelOutputInner(raw, options?.allowedFrameIds);
  } catch (error) {
    if (error instanceof VisualSemanticProviderError) {
      throw error;
    }
    const label = error instanceof Error ? error.message : 'unknown';
    failModel(label);
  }
}

function validateVisualSemanticModelOutputInner(
  raw: unknown,
  allowedFrameIds?: readonly string[],
): VisualSemanticModelOutputV1 {
  try {
    assertNoForbiddenKeys(raw);
  } catch {
    failModel('forbidden-keys');
  }
  if (!isPlainObject(raw)) {
    failModel('root');
  }
  assertAllowedKeys(raw, ['observations'], 'model-output');
  if (!Array.isArray(raw.observations)) {
    failModel('observations');
  }
  const observations = raw.observations.map((item, index) => parseModelObservation(item, `observations[${index}]`, allowedFrameIds));
  return { observations };
}

function parseModelObservation(
  value: unknown,
  label: string,
  allowedFrameIds?: readonly string[],
): VisualSemanticModelObservationV1 {
  if (!isPlainObject(value)) {
    failModel(label);
  }
  assertAllowedKeys(value, ['type', 'confidence', 'visualSignals', 'uncertainty', 'frameId', 'region', 'text'], label);
  const confidence = asFiniteNumber(value.confidence, `${label}.confidence`);
  if (confidence < 0 || confidence > 1) {
    failModel(`${label}.confidence:range`);
  }
  if (!Array.isArray(value.visualSignals) || value.visualSignals.length === 0) {
    failModel(`${label}.visualSignals`);
  }
  if (!isPlainObject(value.uncertainty)) {
    failModel(`${label}.uncertainty`);
  }
  assertAllowedKeys(value.uncertainty, ['level', 'reasons'], `${label}.uncertainty`);
  if (!Array.isArray(value.uncertainty.reasons)) {
    failModel(`${label}.uncertainty.reasons`);
  }
  const frameId = asString(value.frameId, `${label}.frameId`);
  if (allowedFrameIds && !allowedFrameIds.includes(frameId)) {
    failModel(`${label}.frameId:unknown`);
  }
  if (
    typeof value.type !== 'string' ||
    !(MODEL_OUTPUT_OBSERVATION_TYPES as readonly string[]).includes(value.type)
  ) {
    const pathInfo = parseObservationTypePath(`${label}.type`);
    throw new ModelOutputEnumValidationError({
      path: pathInfo.path,
      observationIndex: pathInfo.observationIndex,
      field: 'type',
      rawValue: value.type,
      observationKeys: Object.keys(value),
    });
  }
  const observation: VisualSemanticModelObservationV1 = {
    type: value.type as VisualSemanticModelObservationV1['type'],
    confidence,
    visualSignals: value.visualSignals.map((signal, i) => asString(signal, `${label}.visualSignals[${i}]`)),
    uncertainty: {
      level: asEnum(value.uncertainty.level, MODEL_OUTPUT_UNCERTAINTY_LEVELS, `${label}.uncertainty.level`),
      reasons: value.uncertainty.reasons.map((reason, i) => asString(reason, `${label}.uncertainty.reasons[${i}]`)),
    },
    frameId,
  };
  if (value.text !== undefined && value.text !== null) {
    observation.text = asString(value.text, `${label}.text`);
  }
  if (value.region !== undefined && value.region !== null) {
    if (!isPlainObject(value.region)) {
      failModel(`${label}.region`);
    }
    assertAllowedKeys(value.region, ['x', 'y', 'width', 'height'], `${label}.region`);
    const region = {
      x: asFiniteNumber(value.region.x, `${label}.region.x`),
      y: asFiniteNumber(value.region.y, `${label}.region.y`),
      width: asFiniteNumber(value.region.width, `${label}.region.width`),
      height: asFiniteNumber(value.region.height, `${label}.region.height`),
    };
    const check = validateNormalizedRect(region);
    if (!check.ok) {
      failModel(`${label}.region:bounds`);
    }
    observation.region = region;
  }
  return observation;
}
