import type { ContextEvidenceRef, ContextEvidenceSourceType, HumanFact, ProjectContextEvaluationInput } from './context.types.js';

export function refsFromFacts(facts: readonly HumanFact[]): ContextEvidenceRef[] {
  return facts.map((fact, index) => ({
    sourceType: fact.sourceType,
    sourceId: `human-fact:${index}:${fact.code}`,
    field: fact.code,
    valueSummary: fact.summary,
  }));
}

export function visionTypeRefs(types: readonly string[]): ContextEvidenceRef[] {
  return types.slice(0, 12).map((type) => ({
    sourceType: 'VISION_OBSERVATION' as const,
    sourceId: `observation-type:${type}`,
    field: 'observationTypes',
    valueSummary: type,
  }));
}

export function systemRef(field: string, valueSummary: string): ContextEvidenceRef {
  return {
    sourceType: 'SYSTEM_FACT',
    sourceId: `system:${field}`,
    field,
    valueSummary,
  };
}

export function hasFact(input: ProjectContextEvaluationInput, code: HumanFact['code']): boolean {
  return input.humanFacts.some((fact) => fact.code === code);
}

export function factSource(input: ProjectContextEvaluationInput, code: HumanFact['code']): ContextEvidenceSourceType | null {
  return input.humanFacts.find((fact) => fact.code === code)?.sourceType ?? null;
}

export function hasOverride(
  input: ProjectContextEvaluationInput,
  kind: ProjectContextEvaluationInput['overrides'][number]['kind'],
): boolean {
  return input.overrides.some((item) => item.kind === kind);
}
