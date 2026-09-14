import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { videoRequest } from '../fixtures/fixture-helpers.js';
import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import { parseProviderRawPayload } from '../schema/visual-semantic-response.schema.js';
import {
  assertB26ACallBModules,
  assertTextEvidenceFrameBudget,
  B2_6A_INFERENCE_MAX,
  classifyTextMatch,
  detectSemanticInflation,
  PRODUCT_UI_PROMPT_DEFINITION,
  PRODUCT_UI_PROMPT_NON_FORCE,
  promptForcesProductUi,
  reclassifyBrowserNavPairs,
  selectTextEvidenceFrames,
  TEXT_EVIDENCE_MAX_FRAMES,
} from './b2-6a-calibration.js';
import { decisionLeakage } from './benchmark-evaluators.js';
import { InferenceCallGuard } from './inference-guard.js';
import { RealVisualSemanticProviderAdapter } from './real-visual-semantic.adapter.js';
import {
  classifyRegionRelationship,
  isSemanticRegionConflictCandidate,
} from './region-relationship.js';
import {
  buildTextDeveloperUserPrompt,
  buildTextEvidenceUserPrompt,
  buildUiStructureUserPrompt,
} from './ui-structure-prompt.js';
import { REAL_CONTENT_INFERENCE_LIMIT } from './multimodal.types.js';
import type { MultimodalModelClient } from './multimodal.types.js';
import { baseResult, fixtureObservation } from '../fixtures/fixture-helpers.js';

const MIN_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0xff, 0xd9]);

describe('B2-6A region relationship', () => {
  it('classifies DISJOINT, ADJACENT, OVERLAPPING, CONTAINS, CONTAINED_BY', () => {
    expect(
      classifyRegionRelationship({ x: 0, y: 0, width: 0.2, height: 0.2 }, { x: 0.8, y: 0.8, width: 0.1, height: 0.1 })
        .relationship,
    ).toBe('DISJOINT');
    expect(
      classifyRegionRelationship({ x: 0, y: 0, width: 1, height: 0.105 }, { x: 0.086, y: 0.105, width: 0.824, height: 0.161 })
        .relationship,
    ).toBe('ADJACENT');
    expect(
      classifyRegionRelationship({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, { x: 0.3, y: 0.3, width: 0.5, height: 0.5 })
        .relationship,
    ).toBe('OVERLAPPING');
    const contains = classifyRegionRelationship(
      { x: 0, y: 0.1, width: 1, height: 0.9 },
      { x: 0.1, y: 0.2, width: 0.2, height: 0.3 },
    );
    expect(contains.relationship).toBe('CONTAINS');
    expect(
      classifyRegionRelationship({ x: 0.1, y: 0.2, width: 0.2, height: 0.3 }, { x: 0, y: 0.1, width: 1, height: 0.9 })
        .relationship,
    ).toBe('CONTAINED_BY');
  });

  it('marks conflict only when exclusive types have high overlap, not hierarchy', () => {
    const adjacent = classifyRegionRelationship(
      { x: 0, y: 0, width: 1, height: 0.105 },
      { x: 0.086, y: 0.105, width: 0.824, height: 0.161 },
    );
    expect(
      isSemanticRegionConflictCandidate({
        typeA: 'BROWSER_CHROME',
        typeB: 'NAVIGATION',
        relationship: adjacent.relationship,
        iou: adjacent.iou,
      }),
    ).toBe(false);
    const overlap = classifyRegionRelationship(
      { x: 0, y: 0, width: 1, height: 0.4 },
      { x: 0, y: 0, width: 1, height: 0.4 },
    );
    expect(
      isSemanticRegionConflictCandidate({
        typeA: 'BROWSER_CHROME',
        typeB: 'NAVIGATION',
        relationship: overlap.relationship,
        iou: overlap.iou,
      }),
    ).toBe(true);
    const hierarchy = classifyRegionRelationship(
      { x: 0, y: 0.1, width: 1, height: 0.9 },
      { x: 0.08, y: 0.12, width: 0.2, height: 0.5 },
    );
    expect(hierarchy.relationship).toBe('CONTAINS');
    expect(
      isSemanticRegionConflictCandidate({
        typeA: 'PRODUCT_UI',
        typeB: 'NAVIGATION',
        relationship: hierarchy.relationship,
        iou: hierarchy.iou,
      }),
    ).toBe(false);
  });

  it('reclassifies B2-6 same-frame browser+nav as adjacent, not true conflict', () => {
    const result = reclassifyBrowserNavPairs([
      { frameId: 'semantic-frame:0', type: 'BROWSER_CHROME', region: { x: 0, y: 0, width: 1, height: 0.105 } },
      { frameId: 'semantic-frame:0', type: 'NAVIGATION', region: { x: 0.086, y: 0.105, width: 0.824, height: 0.161 } },
    ]);
    expect(result.trueConflictCount).toBe(0);
    expect(result.adjacentCount).toBe(1);
  });
});

describe('B2-6A prompt and module guards', () => {
  it('defines PRODUCT_UI without forcing it', () => {
    const prompt = buildUiStructureUserPrompt(['semantic-frame:0', 'semantic-frame:1']);
    expect(prompt).toContain(PRODUCT_UI_PROMPT_DEFINITION);
    expect(prompt).toContain(PRODUCT_UI_PROMPT_NON_FORCE);
    expect(promptForcesProductUi(prompt)).toBe(false);
    expect(prompt.toLowerCase()).not.toContain('you must output product_ui');
  });

  it('TEXT_EVIDENCE prompt is split from developer artifact', () => {
    const text = buildTextEvidenceUserPrompt(['a', 'b', 'c']);
    expect(text).toContain('TEXT_REGION');
    expect(text).not.toContain('DEVELOPER_ARTIFACT');
    expect(buildTextDeveloperUserPrompt(['a'])).toContain('DEVELOPER_ARTIFACT');
  });

  it('guards TEXT_EVIDENCE <=3 frames and forbids combined Call B modules', () => {
    expect(() => assertTextEvidenceFrameBudget(3)).not.toThrow();
    expect(() => assertTextEvidenceFrameBudget(4)).toThrow('TEXT_EVIDENCE_FRAME_LIMIT');
    expect(() => assertB26ACallBModules(['TEXT_EVIDENCE'], 3)).not.toThrow();
    expect(() => assertB26ACallBModules(['TEXT_EVIDENCE', 'DEVELOPER_ARTIFACT'], 6)).toThrow();
    expect(TEXT_EVIDENCE_MAX_FRAMES).toBe(3);
  });

  it('caps inference at 2', () => {
    const guard = new InferenceCallGuard(B2_6A_INFERENCE_MAX);
    guard.beforeCall();
    guard.beforeCall();
    expect(() => guard.beforeCall()).toThrow('SMOKE_INFERENCE_LIMIT_EXCEEDED');
    expect(REAL_CONTENT_INFERENCE_LIMIT).toBe(2);
  });

  it('flags decision leakage keys', () => {
    expect(decisionLeakage(baseResult())).toBe('NONE');
    expect(
      decisionLeakage(
        baseResult({
          observations: [fixtureObservation('PRODUCT_UI', { evidence: { frameIds: ['f0'], visualSignals: ['assetUsage'] } })],
        }),
      ),
    ).toBe('INVALID');
  });

  it('keeps B2-1 provider result schema version unchanged', () => {
    const parsed = parseProviderRawPayload({
      providerId: 'mock-visual-semantic',
      providerFamily: 'MOCK',
      requestId: 'req',
      status: 'READY',
      observations: [],
      semanticRegions: [],
      warnings: [],
      schemaVersion: 'visual.semantic.provider-result:v1',
    });
    expect(parsed.schemaVersion).toBe('visual.semantic.provider-result:v1');
  });

  it('rejects TEXT_EVIDENCE-only requests with more than 3 frames', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'b26a-'));
    const files = [];
    for (let i = 0; i < 4; i += 1) {
      const file = path.join(dir, `${i}.jpg`);
      await writeFile(file, MIN_JPEG);
      files.push(file);
    }
    const client: MultimodalModelClient = {
      async invoke() {
        throw new Error('should-not-call');
      },
    };
    const adapter = new RealVisualSemanticProviderAdapter(client, 'openai/gpt-5.5');
    await expect(
      adapter.analyzeVideoFrames(
        videoRequest({
          taskModules: ['TEXT_EVIDENCE'],
          frames: files.map((reference, index) => ({
            frameId: `f${index}`,
            timestampMs: index * 1000,
            width: 64,
            height: 64,
            mediaRef: { kind: 'LOCAL_REF', reference },
            selectionReason: ['UNIFORM'],
          })),
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof VisualSemanticProviderError &&
        error.code === 'INPUT_INVALID' &&
        error.debugLabel === 'text-evidence-frame-limit',
    );
  });

  it('selects targeted text frames without localhost-only hardcoding', () => {
    const selected = selectTextEvidenceFrames([
      { frameId: 'a', textRich: true, addressBarVisible: true },
      { frameId: 'b', textRich: true, addressBarVisible: false },
      { frameId: 'c', textRich: false, addressBarVisible: false },
      { frameId: 'd', textRich: true, addressBarVisible: false },
    ]);
    expect(selected.frameIds).toHaveLength(3);
    expect(selected.mode).toBe('targeted_validation');
    expect(selected.frameIds).toContain('a');
  });

  it('classifies text samples and inflation', () => {
    expect(classifyTextMatch('AI Content Factory', ['AI Content Factory'])).toBe('EXACT');
    expect(classifyTextMatch('内容计划', ['首页；内容计划；设置'])).toBe('NEAR');
    expect(classifyTextMatch('Hook', [])).toBe('MISSED');
    expect(
      detectSemanticInflation({
        frameCount: 6,
        productUiFrames: 6,
        navigationCount: 6,
        contentPanelCount: 4,
        productUiSignals: [['workspace'], ['header+panel'], ['full app']],
      }),
    ).toBe('NONE');
    expect(
      detectSemanticInflation({
        frameCount: 6,
        productUiFrames: 6,
        navigationCount: 0,
        contentPanelCount: 0,
        productUiSignals: [['ui'], ['ui'], ['ui'], ['ui'], ['ui'], ['ui']],
      }),
    ).toBe('OVER_CALIBRATED');
  });
});
