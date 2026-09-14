import { describe, expect, it } from 'vitest';
import type { FrameSample } from '../frame/frame-sample.types.js';
import { aggregateRegionHeuristics } from './aggregate-region-heuristics.js';
import { detectFrameRegionHeuristics } from './detect-frame-regions.js';
import type { LumaFrame } from '../frame/luma-stats.js';
import type { FrameRegionHeuristics } from './region-heuristic.types.js';

function makeFrame(width: number, height: number, at: (x: number, y: number) => number): LumaFrame {
  const pixels = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels[y * width + x] = at(x, y);
    }
  }
  return { width, height, pixels };
}

function sample(id: string, dup = false): FrameSample {
  return {
    sampleId: id,
    timestampMs: Number(id.slice(1)) * 1000,
    width: 64,
    height: 64,
    source: 'UNIFORM',
    extractionOk: true,
    isNearDuplicate: dup,
  };
}

describe('border heuristics', () => {
  it('finds a dark uniform top strip', () => {
    const frame = makeFrame(64, 64, (_x, y) => (y < 10 ? 0 : 128));
    const found = detectFrameRegionHeuristics(frame, 's0', 0);
    const top = found.borders.find((b) => b.side === 'TOP');
    expect(top?.classification).toBe('DARK_UNIFORM');
    expect(top?.normalizedSize).toBeGreaterThan(0.08);
  });

  it('finds left and right dark bars', () => {
    const frame = makeFrame(64, 64, (x) => (x < 8 || x >= 56 ? 0 : 140));
    const found = detectFrameRegionHeuristics(frame, 's0', 0);
    expect(found.borders.some((b) => b.side === 'LEFT')).toBe(true);
    expect(found.borders.some((b) => b.side === 'RIGHT')).toBe(true);
  });

  it('does not invent borders on a flat mid-gray field', () => {
    const frame = makeFrame(64, 64, () => 128);
    const found = detectFrameRegionHeuristics(frame, 's0', 0);
    expect(found.borders.filter((b) => b.normalizedSize > 0.05)).toHaveLength(0);
  });
});

describe('empty region heuristics', () => {
  it('marks a large low-texture side as empty candidate, not as value judgment', () => {
    const frame = makeFrame(64, 64, (x, y) => (x < 28 ? 200 : (x + y) % 40));
    const found = detectFrameRegionHeuristics(frame, 's0', 0);
    expect(found.emptyRegions.some((r) => r.edgeBiased && r.occupancyRatio >= 0.06)).toBe(true);
  });
});

describe('top structured strip', () => {
  it('detects a structured product-like header without calling it a browser', () => {
    const headerH = 10;
    const frame = makeFrame(64, 64, (x, y) => {
      if (y < headerH) {
        return (x + y) % 2 === 0 ? 40 : 200;
      }
      return 130;
    });
    const found = detectFrameRegionHeuristics(frame, 's0', 0);
    expect(found.topStructuredStrip).toBeTruthy();
    expect(JSON.stringify(found)).not.toMatch(/browser/i);
    expect(found.topStructuredStrip!.confidence).toBeLessThanOrEqual(0.7);
  });

  it('does not treat a uniform black top bar as a structured strip', () => {
    const frame = makeFrame(64, 64, (_x, y) => (y < 8 ? 0 : 128));
    const found = detectFrameRegionHeuristics(frame, 's0', 0);
    expect(found.topStructuredStrip).toBeUndefined();
    expect(found.borders.some((b) => b.side === 'TOP' && b.classification === 'DARK_UNIFORM')).toBe(true);
  });
});

describe('persistence and near-duplicate weighting', () => {
  function headerFrame(): ReturnType<typeof makeFrame> {
    return makeFrame(48, 48, (x, y) => (y < 8 ? ((x + y) % 2 === 0 ? 30 : 210) : 128));
  }

  it('orders persistence 8/8 > 4/8 > 1/8', () => {
    const samples = Array.from({ length: 8 }, (_, i) => sample(`s${i}`));
    const withStrip = detectFrameRegionHeuristics(headerFrame(), 's0', 0);
    const plain = detectFrameRegionHeuristics(makeFrame(48, 48, () => 128), 'sx', 0);
    const all = samples.map((s) => ({ ...withStrip, sampleId: s.sampleId, timestampMs: s.timestampMs }));
    const half = samples.map((s, i) =>
      i < 4 ? { ...withStrip, sampleId: s.sampleId, timestampMs: s.timestampMs } : { ...plain, sampleId: s.sampleId, timestampMs: s.timestampMs },
    );
    const one = samples.map((s, i) =>
      i === 0 ? { ...withStrip, sampleId: s.sampleId, timestampMs: s.timestampMs } : { ...plain, sampleId: s.sampleId, timestampMs: s.timestampMs },
    );
    const p8 = aggregateRegionHeuristics(all, samples).topStructuredStripCandidates[0]?.persistenceRatioDedupWeighted ?? 0;
    const p4 = aggregateRegionHeuristics(half, samples).topStructuredStripCandidates[0]?.persistenceRatioDedupWeighted ?? 0;
    const p1 = aggregateRegionHeuristics(one, samples).topStructuredStripCandidates[0]?.persistenceRatioDedupWeighted ?? 0;
    expect(p8).toBeGreaterThan(p4);
    expect(p4).toBeGreaterThan(p1);
  });

  it('does not inflate confidence from near-duplicate copies', () => {
    const samples = [sample('s0', false), ...Array.from({ length: 7 }, (_, i) => sample(`s${i + 1}`, true))];
    const hit: FrameRegionHeuristics = {
      ...detectFrameRegionHeuristics(headerFrame(), 's0', 0),
    };
    const perFrame = samples.map((s) => ({ ...hit, sampleId: s.sampleId, timestampMs: s.timestampMs }));
    const agg = aggregateRegionHeuristics(perFrame, samples).topStructuredStripCandidates[0];
    expect(agg?.persistenceRatioAllSamples).toBe(1);
    expect(agg?.uniqueSampleCount).toBe(1);
    expect(agg?.confidence).toBeLessThan(0.5);
    expect(agg?.confidence).toBeLessThanOrEqual(0.7);
  });
});
