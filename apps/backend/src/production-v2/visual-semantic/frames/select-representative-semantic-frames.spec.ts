import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateVisualSemanticModelOutput } from '../runtime/validate-model-output.js';
import { mapModelOutputToProviderResult } from '../runtime/map-model-output.js';
import { PRODUCT_UI_PROMPT_DEFINITION, PRODUCT_UI_PROMPT_NON_FORCE, promptForcesProductUi } from '../runtime/b2-6a-calibration.js';
import { InferenceCallGuard } from '../runtime/inference-guard.js';
import { classifyRegionRelationship, isSemanticRegionConflictCandidate } from '../runtime/region-relationship.js';
import { buildUiStructureUserPrompt } from '../runtime/ui-structure-prompt.js';
import { B2_6B_INFERENCE_LIMIT } from '../runtime/multimodal.types.js';
import { assertB26BCallShape, scriptForbidsExtraModules } from '../runtime/b2-6b-guards.js';
import {
  REPRESENTATIVE_MAX_FRAMES,
  selectRepresentativeSemanticFramesV1,
} from './select-representative-semantic-frames.js';

const B26_PLAN_FRAMES = [
  { frameId: 'semantic-frame:0', timestampMs: 0, reasons: ['START_REPRESENTATIVE'], sourceSignals: ['BASE_COVERAGE'], selectionScore: 56, priority: 'NORMAL' },
  { frameId: 'semantic-frame:7506', timestampMs: 7506, reasons: ['LONG_STATIC_REPRESENTATIVE'], sourceSignals: ['LONG_STATIC_MID'], selectionScore: 56.8, priority: 'NORMAL' },
  { frameId: 'semantic-frame:17514', timestampMs: 17514, reasons: ['UNIFORM_REPRESENTATIVE'], sourceSignals: ['BASE_COVERAGE'], selectionScore: 33.6, priority: 'LOW' },
  { frameId: 'semantic-frame:20015', timestampMs: 20015, reasons: ['ACTIVITY_CHANGE'], sourceSignals: ['STATIC->LOW_MOTION'], selectionScore: 76.4, priority: 'HIGH' },
  { frameId: 'semantic-frame:26330', timestampMs: 26330, reasons: ['DEDUP_REPLACEMENT'], sourceSignals: ['B1_NEAR_DUPLICATE'], selectionScore: 45.2, priority: 'NORMAL' },
  { frameId: 'semantic-frame:35027', timestampMs: 35027, reasons: ['END_REPRESENTATIVE'], sourceSignals: ['BASE_COVERAGE'], selectionScore: 60, priority: 'NORMAL' },
];

function obs(frameId: string, type: 'NAVIGATION' | 'BROWSER_CHROME' | 'CONTENT_PANEL') {
  return {
    type,
    confidence: 0.9,
    visualSignals: ['visible'],
    uncertainty: { level: 'LOW' as const, reasons: ['ok'] },
    frameId,
  };
}

describe('B2-6B representative selector', () => {
  it('returns at most 3 frames with temporal coverage and avoids near-duplicates', () => {
    const result = selectRepresentativeSemanticFramesV1({ frames: B26_PLAN_FRAMES, durationMs: 35107 });
    expect(result.selected.length).toBeLessThanOrEqual(REPRESENTATIVE_MAX_FRAMES);
    expect(result.selected).toHaveLength(3);
    const times = result.selected.map((item) => item.timestampMs);
    expect(Math.min(...times)).toBeLessThan(35107 / 3);
    expect(Math.max(...times)).toBeGreaterThan((35107 * 2) / 3);
    expect(result.selected.some((item) => item.reasons.includes('DEDUP_REPLACEMENT'))).toBe(false);
    expect(result.excluded.some((item) => item.frameId === 'semantic-frame:26330')).toBe(true);
    expect(result.selected.map((item) => item.representativeSlot)).toEqual(['FRAME_A', 'FRAME_B', 'FRAME_C']);
  });

  it('is deterministic', () => {
    const a = selectRepresentativeSemanticFramesV1({ frames: B26_PLAN_FRAMES, durationMs: 35107 });
    const b = selectRepresentativeSemanticFramesV1({ frames: B26_PLAN_FRAMES, durationMs: 35107 });
    expect(a.selected.map((item) => item.frameId)).toEqual(b.selected.map((item) => item.frameId));
  });

  it('does not hardcode wall-clock timestamps in the selector source', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'select-representative-semantic-frames.ts'), 'utf8');
    expect(source).not.toMatch(/10_000|20_000|10000|20000|7506|17514|20015|26330|35027/);
    expect(source).not.toContain('0s');
    expect(source).not.toContain('10s');
    expect(source).not.toContain('20s');
  });
});

describe('B2-6B contract guards', () => {
  it('keeps PRODUCT_UI definition without forcing', () => {
    const prompt = buildUiStructureUserPrompt(['semantic-frame:0', 'semantic-frame:1', 'semantic-frame:2']);
    expect(prompt).toContain(PRODUCT_UI_PROMPT_DEFINITION);
    expect(prompt).toContain(PRODUCT_UI_PROMPT_NON_FORCE);
    expect(promptForcesProductUi(prompt)).toBe(false);
  });

  it('requires model frameId and does not synthesize PRODUCT_UI', () => {
    expect(() =>
      validateVisualSemanticModelOutput({
        observations: [{ type: 'NAVIGATION', confidence: 0.9, visualSignals: ['x'], uncertainty: { level: 'LOW', reasons: ['r'] } }],
      }),
    ).toThrow();
    const model = validateVisualSemanticModelOutput({
      observations: [obs('semantic-frame:0', 'NAVIGATION'), obs('semantic-frame:1', 'CONTENT_PANEL')],
    });
    const mapped = mapModelOutputToProviderResult(model, {
      requestId: 'b26b',
      providerId: 'router-one-vision',
      allowedFrameIds: ['semantic-frame:0', 'semantic-frame:1'],
    });
    expect(mapped.observations.some((item) => item.type === 'PRODUCT_UI')).toBe(false);
    expect(mapped.observations.map((item) => item.type)).toEqual(['NAVIGATION', 'CONTENT_PANEL']);
  });

  it('treats adjacent browser/nav as non-conflict', () => {
    const rel = classifyRegionRelationship(
      { x: 0, y: 0, width: 1, height: 0.105 },
      { x: 0.086, y: 0.105, width: 0.824, height: 0.161 },
    );
    expect(rel.relationship).toBe('ADJACENT');
    expect(
      isSemanticRegionConflictCandidate({
        typeA: 'BROWSER_CHROME',
        typeB: 'NAVIGATION',
        relationship: rel.relationship,
        iou: rel.iou,
      }),
    ).toBe(false);
  });

  it('caps inference at 1 and forbids extra modules in B2-6B call shape', () => {
    const guard = new InferenceCallGuard(B2_6B_INFERENCE_LIMIT);
    guard.beforeCall();
    expect(() => guard.beforeCall()).toThrow('SMOKE_INFERENCE_LIMIT_EXCEEDED');
    expect(B2_6B_INFERENCE_LIMIT).toBe(1);
    expect(() => assertB26BCallShape({ taskModules: ['UI_STRUCTURE'], frameCount: 3, timeoutMs: 120_000 })).not.toThrow();
    expect(() => assertB26BCallShape({ taskModules: ['TEXT_EVIDENCE'], frameCount: 3, timeoutMs: 120_000 })).toThrow();
    expect(() =>
      assertB26BCallShape({ taskModules: ['UI_STRUCTURE', 'DEVELOPER_ARTIFACT'], frameCount: 3, timeoutMs: 120_000 }),
    ).toThrow();
    const script = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../../scripts/step-13.15b1e-b2-6b-ui-semantic-calibration.ts'),
      'utf8',
    );
    expect(scriptForbidsExtraModules(script)).toBe(true);
  });
});
