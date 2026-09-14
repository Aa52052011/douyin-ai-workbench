import type { HybridSourceRef, SemanticObservationLite } from './hybrid.types.js';

export function visionRef(type: string, frameId: string): HybridSourceRef {
  return {
    kind: 'VISION_OBSERVATION',
    sourceType: 'VISION_OBSERVATION',
    sourceId: `${frameId}:${type}`,
    field: 'observation.type',
    valueSummary: type,
  };
}

export function contextRef(field: string, value: string): HybridSourceRef {
  return {
    kind: 'CONTEXT_EVALUATION',
    sourceType: 'SYSTEM_FACT',
    sourceId: `context:${field}`,
    field,
    valueSummary: value,
  };
}

export function geometryRef(field: string, value: string): HybridSourceRef {
  return {
    kind: 'DETERMINISTIC_FACT',
    sourceType: 'DETERMINISTIC_FACT',
    sourceId: `geometry:${field}`,
    field,
    valueSummary: value,
  };
}

export function uniqueTypes(observations: readonly SemanticObservationLite[]): string[] {
  return [...new Set(observations.map((item) => item.type))];
}
