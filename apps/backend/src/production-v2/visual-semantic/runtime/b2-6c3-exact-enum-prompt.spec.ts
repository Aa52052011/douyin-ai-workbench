import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VISUAL_SEMANTIC_OBSERVATION_TYPES } from '../contracts/observation.types.js';
import { PRODUCT_UI_PROMPT_DEFINITION, PRODUCT_UI_PROMPT_NON_FORCE, promptForcesProductUi } from './b2-6a-calibration.js';
import {
  assessExactEnumInstruction,
  extractPromptObservationTypes,
} from './b2-6c0-enum-diagnosis.js';
import { ModelOutputEnumValidationError } from './model-output-enum-validation-error.js';
import { MODEL_OUTPUT_OBSERVATION_TYPES } from './model-output.types.js';
import { UI_STRUCTURE_MODEL_OUTPUT_RULES_V1 } from './ui-structure-prompt-v1.snapshot.js';
import {
  buildUiStructureUserPrompt,
  formatModelOutputObservationTypeList,
  PROMPT_MODULES_MULTI_FRAME,
  UI_STRUCTURE_PROMPT_MODULE_V1,
  UI_STRUCTURE_PROMPT_MODULE_V2,
  UI_STRUCTURE_USER_PROMPT,
} from './ui-structure-prompt.js';
import { validateVisualSemanticModelOutput } from './validate-model-output.js';

const FROZEN_MODEL_OUTPUT_OBSERVATION_TYPES = [
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
] as const;

const FROZEN_B21_OBSERVATION_TYPES = [
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

function baseObs(type: string) {
  return {
    type,
    confidence: 0.9,
    visualSignals: ['visible'],
    uncertainty: { level: 'LOW' as const, reasons: ['ok'] },
    frameId: 'synthetic-ui-0',
  };
}

function expectEnumFail(type: string): ModelOutputEnumValidationError {
  try {
    validateVisualSemanticModelOutput({ observations: [baseObs(type)] });
    throw new Error(`expected ${type} to fail`);
  } catch (error) {
    expect(error).toBeInstanceOf(ModelOutputEnumValidationError);
    return error as ModelOutputEnumValidationError;
  }
}

describe('B2-6C3 exact enum prompt hardening', () => {
  const prompt = buildUiStructureUserPrompt(['semantic-frame:0', 'semantic-frame:1', 'semantic-frame:2']);

  it('includes STRONG exact-enum instruction', () => {
    expect(prompt).toContain('Use ONLY the exact observation type enum literals listed below');
    expect(prompt).toContain('Do not invent new type names');
    expect(prompt).toContain('Do not use synonyms, aliases, paraphrases');
    expect(prompt).toContain('If a visible structured region does not fit any allowed specific type exactly, output:');
    expect(prompt).toContain('UNKNOWN_STRUCTURED_REGION');
    expect(assessExactEnumInstruction(prompt)).toBe('STRONG');
    expect(assessExactEnumInstruction(UI_STRUCTURE_USER_PROMPT)).toBe('STRONG');
  });

  it('does not add LIST to the allowed enum parser list', () => {
    const types = extractPromptObservationTypes(prompt);
    expect(types).not.toContain('LIST');
    expect(types).not.toContain('SIDEBAR');
    expect(types).not.toContain('HEADER');
    expect(types).not.toContain('APP_UI');
    expect(types).not.toContain('PRODUCT_INTERFACE');
    expect(prompt).toContain('do NOT output "LIST"');
  });

  it('renders allowed enum list from MODEL_OUTPUT_OBSERVATION_TYPES with no extra/missing literals', () => {
    const types = extractPromptObservationTypes(prompt);
    expect(types).toEqual([...MODEL_OUTPUT_OBSERVATION_TYPES]);
    expect(formatModelOutputObservationTypeList()).toBe(MODEL_OUTPUT_OBSERVATION_TYPES.join('\n'));
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ui-structure-prompt.ts'), 'utf8');
    expect(source).toContain('formatModelOutputObservationTypeList()');
    expect(source).toContain('MODEL_OUTPUT_OBSERVATION_TYPES');
    expect(source).not.toMatch(/Allowed type values only:\r?\nPRODUCT_UI\r?\nBROWSER_CHROME\r?\nOS_CHROME/);
  });

  it('keeps MODEL_OUTPUT_OBSERVATION_TYPES unchanged', () => {
    expect([...MODEL_OUTPUT_OBSERVATION_TYPES]).toEqual([...FROZEN_MODEL_OUTPUT_OBSERVATION_TYPES]);
    expect(MODEL_OUTPUT_OBSERVATION_TYPES).not.toContain('LIST');
    expect(MODEL_OUTPUT_OBSERVATION_TYPES).not.toContain('SIDEBAR');
    expect(MODEL_OUTPUT_OBSERVATION_TYPES).not.toContain('PRODUCT_INTERFACE');
  });

  it('keeps VISUAL_SEMANTIC_OBSERVATION_TYPES unchanged', () => {
    expect([...VISUAL_SEMANTIC_OBSERVATION_TYPES]).toEqual([...FROZEN_B21_OBSERVATION_TYPES]);
  });

  it('fails LIST / SIDEBAR / PRODUCT_INTERFACE and persists rejected tokens', () => {
    for (const token of ['LIST', 'SIDEBAR', 'PRODUCT_INTERFACE'] as const) {
      const error = expectEnumFail(token);
      expect(error.rejectedValueSanitized).toBe(token);
      expect(error.toSnapshot().repairAttempted).toBe(false);
      expect(error.toSnapshot().field).toBe('type');
      expect(error.debugLabel).toBe('model-output:observations[0].type:enum');
    }
  });

  it('accepts UNKNOWN_STRUCTURED_REGION as a legal model output', () => {
    const result = validateVisualSemanticModelOutput({ observations: [baseObs('UNKNOWN_STRUCTURED_REGION')] });
    expect(result.observations[0]?.type).toBe('UNKNOWN_STRUCTURED_REGION');
  });

  it('does not auto-convert LIST to UNKNOWN_STRUCTURED_REGION', () => {
    const error = expectEnumFail('LIST');
    expect(error.rejectedValueSanitized).toBe('LIST');
    expect(error.rejectedValueSanitized).not.toBe('UNKNOWN_STRUCTURED_REGION');
    expect(() =>
      validateVisualSemanticModelOutput({ observations: [baseObs('LIST')] }),
    ).toThrow(ModelOutputEnumValidationError);
  });

  it('preserves PRODUCT_UI whole-surface definition, coexist, and non-forcing', () => {
    expect(prompt).toContain(PRODUCT_UI_PROMPT_DEFINITION);
    expect(prompt).toContain('Whole-surface and child observations may coexist');
    expect(prompt).toContain(PRODUCT_UI_PROMPT_NON_FORCE);
    expect(promptForcesProductUi(prompt)).toBe(false);
  });

  it('preserves browser vs product navigation boundary', () => {
    expect(prompt).toContain('Product navigation and browser chrome must be separate observations when both are visible');
    expect(prompt).toContain('Do not infer browser chrome from top position alone');
    expect(prompt).toContain('Do not label a product application header as BROWSER_CHROME');
  });

  it('bumps UI_STRUCTURE prompt module to v2 and keeps v1 history', () => {
    expect(UI_STRUCTURE_PROMPT_MODULE_V1).toBe('visual.semantic.ui-structure:v1');
    expect(UI_STRUCTURE_PROMPT_MODULE_V2).toBe('visual.semantic.ui-structure:v2');
    expect(PROMPT_MODULES_MULTI_FRAME).toContain(UI_STRUCTURE_PROMPT_MODULE_V2);
    expect(PROMPT_MODULES_MULTI_FRAME).not.toContain(UI_STRUCTURE_PROMPT_MODULE_V1);
    const v2Rules = prompt.slice(prompt.indexOf('Return exactly one JSON object'));
    expect(UI_STRUCTURE_MODEL_OUTPUT_RULES_V1).toContain('Allowed type values only:');
    expect(UI_STRUCTURE_MODEL_OUTPUT_RULES_V1).not.toContain('Use ONLY the exact observation type enum literals listed below');
    expect(v2Rules.length).toBeGreaterThan(UI_STRUCTURE_MODEL_OUTPUT_RULES_V1.length);
    expect(v2Rules.length - UI_STRUCTURE_MODEL_OUTPUT_RULES_V1.length).toBeLessThan(1200);
  });
});
