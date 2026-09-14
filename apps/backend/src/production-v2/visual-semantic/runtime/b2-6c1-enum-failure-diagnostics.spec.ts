import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { imageRequest } from '../fixtures/fixture-helpers.js';
import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import { GOLDEN_MODEL_OUTPUT_V1 } from './golden-model-output.fixture.js';
import { mapModelOutputToProviderResult } from './map-model-output.js';
import {
  isModelOutputEnumValidationError,
  ModelOutputEnumValidationError,
} from './model-output-enum-validation-error.js';
import { MODEL_OUTPUT_OBSERVATION_TYPES } from './model-output.types.js';
import { RealVisualSemanticProviderAdapter } from './real-visual-semantic.adapter.js';
import {
  REDACTED_INVALID_ENUM_TOKEN,
  sanitizeRejectedEnumToken,
} from './sanitize-rejected-enum-token.js';
import { buildUiStructureUserPrompt, UI_STRUCTURE_USER_PROMPT } from './ui-structure-prompt.js';
import { VISUAL_SEMANTIC_OBSERVATION_TYPES } from '../contracts/observation.types.js';
import { validateVisualSemanticModelOutput } from './validate-model-output.js';
import type { MultimodalModelClient } from './multimodal.types.js';

const MIN_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0xff, 0xd9]);

function baseObs(type: string, extras: Record<string, unknown> = {}) {
  return {
    type,
    confidence: 0.9,
    visualSignals: ['visible'],
    uncertainty: { level: 'LOW' as const, reasons: ['ok'] },
    frameId: 'synthetic-ui-0',
    ...extras,
  };
}

function expectEnumFail(payload: unknown): ModelOutputEnumValidationError {
  try {
    validateVisualSemanticModelOutput(payload);
    throw new Error('expected enum validation failure');
  } catch (error) {
    expect(error).toBeInstanceOf(ModelOutputEnumValidationError);
    expect(error).toBeInstanceOf(VisualSemanticProviderError);
    expect((error as VisualSemanticProviderError).code).toBe('SCHEMA_VALIDATION_FAILED');
    expect((error as VisualSemanticProviderError).debugLabel).toMatch(/model-output:observations\[\d+\]\.type:enum/);
    return error as ModelOutputEnumValidationError;
  }
}

function mockClient(rawText: string): MultimodalModelClient {
  return {
    async invoke() {
      return {
        rawText,
        latencyMs: 1,
        httpStatus: 200,
        finishReason: 'stop',
        usage: {
          inputTextUnits: 1,
          inputImageUnits: null,
          outputUnits: 1,
          totalUnits: 2,
          cost: null,
          costStatus: 'UNPRICED',
        },
      };
    },
  };
}

describe('B2-6C1 persist rejected model type on schema fail', () => {
  it('accepts valid PRODUCT_UI / NAVIGATION / BROWSER_CHROME unchanged', () => {
    const golden = validateVisualSemanticModelOutput(GOLDEN_MODEL_OUTPUT_V1);
    expect(golden.observations.map((item) => item.type)).toEqual([
      'PRODUCT_UI',
      'NAVIGATION',
      'CONTENT_PANEL',
      'BUTTON_LIKE_REGION',
    ]);
    const extra = validateVisualSemanticModelOutput({
      observations: [baseObs('BROWSER_CHROME'), baseObs('UNKNOWN_STRUCTURED_REGION')],
    });
    expect(extra.observations.map((item) => item.type)).toEqual(['BROWSER_CHROME', 'UNKNOWN_STRUCTURED_REGION']);
  });

  it('captures SIDEBAR with path index field and does not repair', () => {
    const error = expectEnumFail({ observations: [baseObs('SIDEBAR')] });
    expect(error.path).toBe('observations[0].type');
    expect(error.observationIndex).toBe(0);
    expect(error.field).toBe('type');
    expect(error.rejectedValueSanitized).toBe('SIDEBAR');
    expect(error.rejectedValueRedacted).toBe(false);
    expect(error.expectedEnumId).toBe('MODEL_OUTPUT_OBSERVATION_TYPES');
    expect(error.observationKeys).toEqual(
      expect.arrayContaining(['type', 'confidence', 'visualSignals', 'uncertainty', 'frameId']),
    );
    expect(error.observationKeys).not.toContain('visualSignals[0]');
    const snapshot = error.toSnapshot();
    expect(snapshot.repairAttempted).toBe(false);
    expect(snapshot.rejectedValue).toBe('SIDEBAR');
    expect(JSON.stringify(snapshot)).not.toContain('visible');
    expect(MODEL_OUTPUT_OBSERVATION_TYPES).not.toContain('SIDEBAR');
  });

  it('preserves PRODUCT_INTERFACE synonym as rejected token', () => {
    const error = expectEnumFail({ observations: [baseObs('PRODUCT_INTERFACE')] });
    expect(error.rejectedValueSanitized).toBe('PRODUCT_INTERFACE');
    expect(error.rejectedValueSanitized).not.toBe('PRODUCT_UI');
    expect(error.rejectedValueSanitized).not.toBe('UNKNOWN_STRUCTURED_REGION');
  });

  it('redacts overlong and secret-like tokens', () => {
    const overlong = expectEnumFail({ observations: [baseObs('X'.repeat(200))] });
    expect(overlong.rejectedValueSanitized).toBe(REDACTED_INVALID_ENUM_TOKEN);
    expect(overlong.rejectedValueRedacted).toBe(true);
    const secret = expectEnumFail({ observations: [baseObs('sk-abcdefghijklmnopqrstuv')] });
    expect(secret.rejectedValueSanitized).toBe(REDACTED_INVALID_ENUM_TOKEN);
    expect(secret.originalValueType).toBe('string');
  });

  it('does not persist non-string enum raw objects', () => {
    const error = expectEnumFail({ observations: [baseObs({ nested: 'nope' } as unknown as string)] });
    expect(error.rejectedValueSanitized).toBe(REDACTED_INVALID_ENUM_TOKEN);
    expect(error.originalValueType).toBe('object');
    expect(JSON.stringify(error.toSnapshot())).not.toContain('nested');
  });

  it('reports observations[15] index accurately among many observations', () => {
    const observations = Array.from({ length: 16 }, (_, index) =>
      index === 15 ? baseObs('SIDEBAR') : baseObs('PRODUCT_UI', { frameId: `f${index}` }),
    );
    const error = expectEnumFail({ observations });
    expect(error.observationIndex).toBe(15);
    expect(error.path).toBe('observations[15].type');
    expect(error.debugLabel).toBe('model-output:observations[15].type:enum');
  });

  it('does not convert SIDEBAR to NAVIGATION or UNKNOWN_STRUCTURED_REGION', () => {
    const error = expectEnumFail({ observations: [baseObs('SIDEBAR')] });
    expect(error.rejectedValueSanitized).toBe('SIDEBAR');
    expect(() =>
      mapModelOutputToProviderResult(validateVisualSemanticModelOutput({ observations: [baseObs('SIDEBAR')] }), {
        requestId: 'x',
        providerId: 'router-one-vision',
        allowedFrameIds: ['synthetic-ui-0'],
      }),
    ).toThrow(ModelOutputEnumValidationError);
  });

  it('adapter does not map when model-facing enum fails and records snapshot after JSON.parse', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'b26c1-'));
    const file = path.join(dir, 'x.jpg');
    await writeFile(file, MIN_JPEG);
    const adapter = new RealVisualSemanticProviderAdapter(
      mockClient(JSON.stringify({ observations: [baseObs('SIDEBAR')] })),
      'openai/gpt-5.5',
    );
    await expect(
      adapter.analyzeImage(
        imageRequest({
          frames: [
            {
              frameId: 'synthetic-ui-0',
              timestampMs: 0,
              width: 64,
              height: 64,
              mediaRef: { kind: 'LOCAL_REF', reference: file },
              selectionReason: ['IMAGE_PRIMARY'],
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ModelOutputEnumValidationError);
    expect(adapter.lastPipelineMeta.jsonParseNative).toBe('PASS');
    expect(adapter.lastPipelineMeta.modelFacingSchema).toBe('FAIL');
    expect(adapter.lastPipelineMeta.adapterMapping).toBe('NOT_RUN');
    expect(adapter.lastPipelineMeta.internalB2Schema).toBe('NOT_RUN');
    expect(adapter.lastPipelineMeta.normalization).toBe('NOT_RUN');
    expect(adapter.lastPipelineMeta.modelSchemaFailure?.rejectedValue).toBe('SIDEBAR');
    expect(adapter.lastPipelineMeta.modelSchemaFailure?.observationIndex).toBe(0);
    expect(adapter.lastPipelineMeta.modelSchemaFailure?.path).toBe('observations[0].type');
    expect(isModelOutputEnumValidationError).toBeTypeOf('function');
  });

  it('leaves DTO, B2-1, and prompt enum lists unchanged in this step', () => {
    expect(MODEL_OUTPUT_OBSERVATION_TYPES).not.toContain('SIDEBAR');
    expect(VISUAL_SEMANTIC_OBSERVATION_TYPES).toContain('PRODUCT_UI');
    expect(UI_STRUCTURE_USER_PROMPT).toContain('Do not invent new type names');
    expect(buildUiStructureUserPrompt(['a'])).toContain('Do not use synonyms, aliases, paraphrases');
  });

  it('sanitizeRejectedEnumToken reuses secret detector', () => {
    expect(sanitizeRejectedEnumToken('SIDEBAR').rejectedValue).toBe('SIDEBAR');
    expect(sanitizeRejectedEnumToken('sk-abcdefghijklmnopqrstuv').rejectedValue).toBe(REDACTED_INVALID_ENUM_TOKEN);
  });
});
