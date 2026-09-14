import { describe, expect, it } from 'vitest';
import { VISUAL_SEMANTIC_OBSERVATION_TYPES } from '../contracts/observation.types.js';
import { MODEL_OUTPUT_OBSERVATION_TYPES } from './model-output.types.js';
import { buildUiStructureUserPrompt } from './ui-structure-prompt.js';
import {
  assessExactEnumInstruction,
  buildEnumContractDiagnosis,
  extractPromptObservationTypes,
} from './b2-6c0-enum-diagnosis.js';

describe('B2-6C0 zero-inference enum diagnosis (offline)', () => {
  it('extracts the prompt type list from the allowed-enum block', () => {
    const prompt = buildUiStructureUserPrompt(['a', 'b']);
    const types = extractPromptObservationTypes(prompt);
    expect(types).toEqual([...MODEL_OUTPUT_OBSERVATION_TYPES]);
    expect(types).not.toContain('SIDEBAR');
    expect(types).not.toContain('PRODUCT_INTERFACE');
  });

  it('finds no prompt vs DTO drift and DTO is a subset of B2-1', () => {
    const diagnosis = buildEnumContractDiagnosis({ recoveredType: null, evidenceNotes: [] });
    expect(diagnosis.promptEnumDrift).toBe('NO');
    expect(diagnosis.modelDtoInternalDrift).toBe('NO');
    expect(diagnosis.dtoVsB21.onlyDto).toEqual([]);
    expect(diagnosis.dtoVsB21.onlyB21).toEqual(
      expect.arrayContaining(['WATERMARK', 'LOGO', 'PERSON', 'FACE', 'PRIVACY_SENSITIVE']),
    );
    for (const type of MODEL_OUTPUT_OBSERVATION_TYPES) {
      expect(VISUAL_SEMANTIC_OBSERVATION_TYPES).toContain(type);
    }
  });

  it('classifies recovered values without mutating enums', () => {
    expect(buildEnumContractDiagnosis({ recoveredType: 'SIDEBAR', evidenceNotes: [] }).failureClassification).toBe(
      'MODEL_ENUM_NONCOMPLIANCE',
    );
    expect(buildEnumContractDiagnosis({ recoveredType: 'WATERMARK', evidenceNotes: [] }).failureClassification).toBe(
      'MODEL_DTO_ENUM_GAP',
    );
    expect(buildEnumContractDiagnosis({ recoveredType: null, evidenceNotes: [] }).failureClassification).toBe(
      'UNKNOWN_INSUFFICIENT_EVIDENCE',
    );
  });

  it('rates exact-enum instruction as STRONG after C3 hardening', () => {
    expect(assessExactEnumInstruction(buildUiStructureUserPrompt(['x']))).toBe('STRONG');
  });
});
