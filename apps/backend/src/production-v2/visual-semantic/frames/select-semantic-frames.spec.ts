import { describe, expect, it } from 'vitest';
import { DETERMINISTIC_ANALYZER_VERSION, DETERMINISTIC_VISUAL_SCHEMA, type DeterministicVisualFacts } from '../../visual/deterministic-visual.types.js';
import { selectSemanticFrames } from './select-semantic-frames.js';
import { semanticFrameBudget, semanticSize, stableSemanticFrameId } from './semantic-frame-config.js';

function baseFacts(over: Partial<DeterministicVisualFacts> & { durationMs?: number }): DeterministicVisualFacts {
  return {
    schemaVersion: DETERMINISTIC_VISUAL_SCHEMA,
    assetId: 'a',
    metadata: {
      width: 1920,
      height: 1040,
      durationMs: over.durationMs ?? 35_000,
      hasAudio: true,
      aspectRatio: '24:13',
      orientation: 'LANDSCAPE',
    },
    analysisVersion: DETERMINISTIC_ANALYZER_VERSION,
    warnings: [],
    status: 'PARTIAL',
    completedStages: ['METADATA', 'GEOMETRY'],
    ...over,
  };
}

describe('semantic frame selection', () => {
  it('image path is IMAGE_PRIMARY only', () => {
    const { plan } = selectSemanticFrames({ assetId: 'img', mediaKind: 'IMAGE' });
    expect(plan.selectedFrames).toHaveLength(1);
    expect(plan.selectedFrames[0]?.reasons).toEqual(['IMAGE_PRIMARY']);
    expect(plan.maxFrameCount).toBe(1);
  });

  it('covers start/middle/end without scene facts', () => {
    const { plan } = selectSemanticFrames({ assetId: 'v', mediaKind: 'VIDEO', durationMs: 20_000 });
    expect(plan.warnings).toContain('SEMANTIC_FRAME_SPARSE_B1_FALLBACK');
    const reasons = plan.selectedFrames.flatMap((f) => f.reasons);
    expect(reasons).toEqual(expect.arrayContaining(['START_REPRESENTATIVE', 'END_REPRESENTATIVE']));
    expect(plan.selectedFrames[0]?.timestampMs).toBe(0);
    expect(plan.selectedFrames.at(-1)?.timestampMs).toBeGreaterThan(10_000);
  });

  it('includes scene, activity, long-static and high-change representatives', () => {
    const { plan } = selectSemanticFrames({
      assetId: 'v',
      mediaKind: 'VIDEO',
      durationMs: 30_000,
      facts: baseFacts({
        durationMs: 30_000,
        sceneChangeCandidates: [{ timestampMs: 8000, strength: 0.8, confidence: 0.8, source: 'SAMPLED_FRAME_DIFF', evidenceSampleIds: ['s1'] }],
        temporalActivitySegments: [
          { startMs: 0, endMs: 7000, activityLevel: 'LOW_MOTION', confidence: 0.7, frameChangeMedian: 0.02, pairCount: 2 },
          { startMs: 7000, endMs: 30000, activityLevel: 'ACTIVE', confidence: 0.7, frameChangeMedian: 0.2, pairCount: 2 },
        ],
        longStaticCandidates: [{ startMs: 10000, endMs: 18000, estimatedDurationMs: 8000, confidence: 0.7, source: 'AGGREGATED_HEURISTIC' }],
        rapidChangeCandidates: [{ startMs: 20000, endMs: 22000, pairCount: 2, confidence: 0.7, source: 'AGGREGATED_HEURISTIC' }],
      }),
    });
    const reasons = plan.selectedFrames.flatMap((f) => f.reasons);
    expect(reasons).toEqual(
      expect.arrayContaining(['SCENE_CANDIDATE', 'ACTIVITY_CHANGE', 'LONG_STATIC_REPRESENTATIVE', 'HIGH_CHANGE_REPRESENTATIVE']),
    );
    expect(plan.selectedFrames.length).toBeLessThanOrEqual(semanticFrameBudget(30_000));
  });

  it('trims to budget and keeps timeline coverage', () => {
    const scenes = Array.from({ length: 12 }, (_, i) => ({
      timestampMs: 400 + i * 300,
      strength: 0.9,
      confidence: 0.8,
      source: 'SAMPLED_FRAME_DIFF' as const,
      evidenceSampleIds: ['s'],
    }));
    const { plan } = selectSemanticFrames({
      assetId: 'v',
      mediaKind: 'VIDEO',
      durationMs: 40_000,
      facts: baseFacts({ durationMs: 40_000, sceneChangeCandidates: scenes }),
    });
    expect(plan.selectedFrames.length).toBeLessThanOrEqual(6);
    expect(plan.warnings).toContain('SEMANTIC_FRAME_BUDGET_TRIMMED');
    expect(plan.selectedFrames.at(-1)!.timestampMs!).toBeGreaterThan(15_000);
  });

  it('accepts manual in-range and rejects out-of-range without clamping', () => {
    const ok = selectSemanticFrames({ assetId: 'v', mediaKind: 'VIDEO', durationMs: 10_000, manualTimestampsMs: [2500] });
    expect(ok.plan.selectedFrames.some((f) => f.reasons.includes('MANUAL') && f.timestampMs === 2500)).toBe(true);
    const bad = selectSemanticFrames({ assetId: 'v', mediaKind: 'VIDEO', durationMs: 10_000, manualTimestampsMs: [99_000] });
    expect(bad.invalidManual).toBe(true);
    expect(bad.plan.selectedFrames.every((f) => f.timestampMs !== 99_000)).toBe(true);
  });

  it('uses 1 frame under 500ms and at most 2 under 1s without duplicate timestamps', () => {
    const a = selectSemanticFrames({ assetId: 'v', mediaKind: 'VIDEO', durationMs: 400 });
    expect(a.plan.selectedFrames).toHaveLength(1);
    const b = selectSemanticFrames({ assetId: 'v', mediaKind: 'VIDEO', durationMs: 800 });
    const stamps = b.plan.selectedFrames.map((f) => f.timestampMs);
    expect(stamps.length).toBeLessThanOrEqual(2);
    expect(new Set(stamps).size).toBe(stamps.length);
  });

  it('fails unknown duration without timestamps and falls back when samples exist', () => {
    const fail = selectSemanticFrames({ assetId: 'v', mediaKind: 'VIDEO', facts: baseFacts({ durationMs: undefined, metadata: { ...baseFacts({}).metadata, durationMs: undefined } }) });
    expect(fail.error).toBe('SEMANTIC_FRAME_SELECTION_FAILED');
    const fallback = selectSemanticFrames({
      assetId: 'v',
      mediaKind: 'VIDEO',
      facts: baseFacts({
        durationMs: undefined,
        metadata: { ...baseFacts({}).metadata, durationMs: undefined },
        frameSamplesSummary: [
          { sampleId: 's0', timestampMs: 0, source: 'START', extractionOk: true, isNearDuplicate: false },
          { sampleId: 's1', timestampMs: 1200, source: 'UNIFORM', extractionOk: true, isNearDuplicate: false },
        ],
      }),
    });
    expect(fallback.error).toBeUndefined();
    expect(fallback.plan.selectedFrames.length).toBeGreaterThan(0);
    expect(fallback.plan.warnings).toContain('SEMANTIC_FRAME_USED_SAMPLE_TIMESTAMPS');
  });

  it('is deterministic', () => {
    const facts = baseFacts({
      sceneChangeCandidates: [{ timestampMs: 5000, strength: 0.7, confidence: 0.7, source: 'SAMPLED_FRAME_DIFF', evidenceSampleIds: [] }],
    });
    const a = selectSemanticFrames({ assetId: 'v', mediaKind: 'VIDEO', durationMs: 35_107, facts });
    const b = selectSemanticFrames({ assetId: 'v', mediaKind: 'VIDEO', durationMs: 35_107, facts });
    expect(a.plan.selectedFrames.map((f) => f.frameId)).toEqual(b.plan.selectedFrames.map((f) => f.frameId));
    expect(a.plan.selectedFrames.map((f) => f.timestampMs)).toEqual(b.plan.selectedFrames.map((f) => f.timestampMs));
  });

  it('uses stable ids and does not upscale semantic size', () => {
    expect(stableSemanticFrameId(1200)).toBe('semantic-frame:1200');
    expect(semanticSize(1920, 1040)).toEqual({ width: 1280, height: 693 });
    expect(semanticSize(640, 360)).toEqual({ width: 640, height: 360 });
    expect(semanticSize(1080, 1920)).toEqual({ width: 720, height: 1280 });
    expect(semanticSize(1000, 1000)).toEqual({ width: 1000, height: 1000 });
  });
});
