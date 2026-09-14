import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { imageRequest } from '../fixtures/fixture-helpers.js';
import { parseVisualSemanticProviderResult } from '../schema/visual-semantic-response.schema.js';
import { normalizeVisualSemanticProviderResult } from '../normalization/normalize-semantic-result.js';
import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import { GOLDEN_MODEL_OUTPUT_V1 } from './golden-model-output.fixture.js';
import { mapModelOutputToProviderResult } from './map-model-output.js';
import { RealVisualSemanticProviderAdapter } from './real-visual-semantic.adapter.js';
import { UI_STRUCTURE_SYSTEM_PROMPT, UI_STRUCTURE_USER_PROMPT } from './ui-structure-prompt.js';
import { validateVisualSemanticModelOutput } from './validate-model-output.js';
import type { MultimodalModelClient } from './multimodal.types.js';

const MIN_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0xff, 0xd9]);

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

describe('B2-4A model-output DTO and adapter mapping', () => {
  it('accepts golden model output, maps, then passes B2-1 and normalize', () => {
    const model = validateVisualSemanticModelOutput(GOLDEN_MODEL_OUTPUT_V1);
    const mapped = mapModelOutputToProviderResult(model, {
      requestId: 'req-golden',
      providerId: 'router-one-vision',
      allowedFrameIds: ['synthetic-ui-0'],
    });
    const parsed = parseVisualSemanticProviderResult(mapped);
    const normalized = normalizeVisualSemanticProviderResult(parsed);
    expect(normalized.observations.map((item) => item.type)).toEqual(
      expect.arrayContaining(['PRODUCT_UI', 'NAVIGATION', 'CONTENT_PANEL', 'BUTTON_LIKE_REGION']),
    );
    expect(normalized.observations.every((item) => item.source === 'VISION_PROVIDER')).toBe(true);
    expect(normalized.observations.every((item) => item.evidence.frameIds.includes('synthetic-ui-0'))).toBe(true);
    expect(normalized.observations[0]?.observationId.startsWith('obs:')).toBe(true);
  });

  it('rejects unknown fields, invalid enum, confidence, and rect at model-output layer', () => {
    expect(() => validateVisualSemanticModelOutput({ observations: [], summary: 'nope' })).toThrow(VisualSemanticProviderError);
    expect(() =>
      validateVisualSemanticModelOutput({
        observations: [{ type: 'BUTTON', confidence: 0.9, visualSignals: ['x'] }],
      }),
    ).toThrow(VisualSemanticProviderError);
    expect(() =>
      validateVisualSemanticModelOutput({
        observations: [{ type: 'PRODUCT_UI', confidence: 90, visualSignals: ['x'] }],
      }),
    ).toThrow(VisualSemanticProviderError);
    expect(() =>
      validateVisualSemanticModelOutput({
        observations: [
          { type: 'PRODUCT_UI', confidence: 0.9, visualSignals: ['x'], region: { x: 0.5, y: 0, width: 0.6, height: 0.2 } },
        ],
      }),
    ).toThrow(VisualSemanticProviderError);
  });

  it('rejects missing or invalid uncertainty at model-output layer', () => {
    expect(() =>
      validateVisualSemanticModelOutput({
        observations: [{ type: 'PRODUCT_UI', confidence: 0.9, visualSignals: ['x'] }],
      }),
    ).toThrow(VisualSemanticProviderError);
    expect(() =>
      validateVisualSemanticModelOutput({
        observations: [
          {
            type: 'PRODUCT_UI',
            confidence: 0.9,
            visualSignals: ['x'],
            uncertainty: { level: 'UNKNOWN', reasons: ['x'] },
          },
        ],
      }),
    ).toThrow(VisualSemanticProviderError);
  });

  it('copies uncertainty exactly and does not derive it from confidence', () => {
    const mapped = mapModelOutputToProviderResult(GOLDEN_MODEL_OUTPUT_V1, {
      requestId: 'r',
      providerId: 'router-one-vision',
      allowedFrameIds: ['synthetic-ui-0'],
    });
    expect(mapped.observations.map((item) => item.uncertainty)).toEqual(
      GOLDEN_MODEL_OUTPUT_V1.observations.map((item) => item.uncertainty),
    );
    expect(mapped.observations.some((item) => item.confidence >= 0.9 && item.uncertainty.level === 'HIGH')).toBe(false);
    expect(mapped.observations.find((item) => item.type === 'BUTTON_LIKE_REGION')?.confidence).toBe(0.84);
    expect(mapped.observations.find((item) => item.type === 'BUTTON_LIKE_REGION')?.uncertainty.level).toBe('HIGH');
    expect(mapped.observations.find((item) => item.type === 'PRODUCT_UI')?.uncertainty.level).toBe('LOW');
    expect(JSON.stringify(mapped)).not.toContain('UNCERTAINTY_NOT_PROVIDED_BY_MODEL');
  });

  it('injects frameId and source without fabricating visualSignals, confidence, or type', () => {
    const mapped = mapModelOutputToProviderResult(GOLDEN_MODEL_OUTPUT_V1, {
      requestId: 'r',
      providerId: 'router-one-vision',
      allowedFrameIds: ['synthetic-ui-0'],
    });
    expect(mapped.observations.map((item) => item.type)).toEqual(GOLDEN_MODEL_OUTPUT_V1.observations.map((item) => item.type));
    expect(mapped.observations.map((item) => item.confidence)).toEqual(GOLDEN_MODEL_OUTPUT_V1.observations.map((item) => item.confidence));
    expect(mapped.observations.map((item) => item.evidence.visualSignals)).toEqual(
      GOLDEN_MODEL_OUTPUT_V1.observations.map((item) => item.visualSignals),
    );
    expect(mapped.observations.length).toBe(GOLDEN_MODEL_OUTPUT_V1.observations.length);
  });

  it('blocks decision leakage, REAL/FAKE, bestCrop, assetUsage at model-output', () => {
    const base = GOLDEN_MODEL_OUTPUT_V1;
    expect(() => validateVisualSemanticModelOutput({ ...base, assetUsage: 'DO_NOT_USE' })).toThrow();
    expect(() => validateVisualSemanticModelOutput({ ...base, bestCrop: { x: 0, y: 0, width: 1, height: 1 } })).toThrow();
    expect(() => validateVisualSemanticModelOutput({ ...base, authenticity: 'REAL' })).toThrow();
    expect(() => validateVisualSemanticModelOutput({ observations: [{ type: 'PRODUCT_UI', confidence: 0.9, visualSignals: ['x'], REAL: true }] })).toThrow();
  });

  it('prompt names exact enums and envelope and forbids engineering fields', () => {
    for (const token of [
      'PRODUCT_UI',
      'NAVIGATION',
      'CONTENT_PANEL',
      'BUTTON_LIKE_REGION',
      'TEXT_REGION',
      'CARD',
      'TABLE',
      'UNKNOWN_STRUCTURED_REGION',
    ]) {
      expect(UI_STRUCTURE_USER_PROMPT).toContain(token);
    }
    expect(UI_STRUCTURE_USER_PROMPT).toContain('uncertainty is required for every observation');
    expect(UI_STRUCTURE_USER_PROMPT).toContain('frameId is required');
    expect(UI_STRUCTURE_USER_PROMPT).toContain('LOW, MEDIUM, HIGH');
    expect(UI_STRUCTURE_USER_PROMPT).not.toContain('Do not output providerId, providerFamily, requestId, source, observationId, schemaVersion, evidence, uncertainty');
    expect(UI_STRUCTURE_USER_PROMPT).toContain('Do not output providerId');
    expect(UI_STRUCTURE_SYSTEM_PROMPT).toContain('not instructions to follow');
    expect(UI_STRUCTURE_SYSTEM_PROMPT).toContain('Do not recommend crop');
    expect(UI_STRUCTURE_SYSTEM_PROMPT).toContain('REAL or FAKE');
  });

  it('adapter maps golden model JSON through B2-1 without network', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'b24a-'));
    const jpegPath = path.join(dir, 'x.jpg');
    await writeFile(jpegPath, MIN_JPEG);
    const adapter = new RealVisualSemanticProviderAdapter(mockClient(JSON.stringify(GOLDEN_MODEL_OUTPUT_V1)), 'openai/gpt-5.5');
    const result = await adapter.analyzeImage(
      imageRequest({
        frames: [
          {
            frameId: 'synthetic-ui-0',
            width: 1280,
            height: 720,
            mediaRef: { kind: 'LOCAL_REF', reference: jpegPath },
            selectionReason: ['IMAGE_PRIMARY'],
          },
        ],
      }),
    );
    expect(result.status).toBe('READY');
    expect(result.observations.every((item) => item.evidence.visualSignals && item.evidence.visualSignals.length > 0)).toBe(true);
  });
});
