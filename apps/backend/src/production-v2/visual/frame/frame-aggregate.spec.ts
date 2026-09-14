import { describe, expect, it } from 'vitest';
import { aggregateFrameStats, markNearDuplicates } from './frame-aggregate.js';
import type { FrameSample } from './frame-sample.types.js';
import { lumaSimilarity, type LumaFrame } from './luma-stats.js';

function sample(id: string, ok: boolean, luma = 50, dup = false): FrameSample {
  return {
    sampleId: id,
    timestampMs: 0,
    width: 2,
    height: 2,
    source: 'UNIFORM',
    extractionOk: ok,
    isNearDuplicate: dup,
    statistics: ok
      ? {
          averageLuma: luma,
          lumaStdDev: 4,
          minLuma: luma,
          maxLuma: luma,
          darkPixelRatio: 0,
          brightPixelRatio: 0,
          contrastProxy: 4 / 255,
          sharpnessProxy: 20,
          analysisWidth: 2,
          analysisHeight: 2,
        }
      : undefined,
  };
}

describe('aggregate and duplicates', () => {
  it('counts requested extracted usable and min/median/max', () => {
    const samples = [sample('s0', true, 10), sample('s1', false), sample('s2', true, 30), sample('s3', true, 20)];
    const agg = aggregateFrameStats(samples, [{ fromSampleId: 's0', toSampleId: 's2', delta: 10, normalizedDelta: 0.1 }], 4);
    expect(agg.sampleCountRequested).toBe(4);
    expect(agg.sampleCountExtracted).toBe(3);
    expect(agg.sampleCountUsable).toBe(3);
    expect(agg.luma.min).toBe(10);
    expect(agg.luma.max).toBe(30);
    expect(agg.luma.median).toBe(20);
  });

  it('marks near duplicates from luma similarity', () => {
    const gray = Buffer.alloc(4, 40);
    const lumas: Array<LumaFrame | undefined> = [
      { width: 2, height: 2, pixels: gray },
      { width: 2, height: 2, pixels: Buffer.alloc(4, 40) },
      { width: 2, height: 2, pixels: Buffer.alloc(4, 200) },
    ];
    const samples = [sample('s0', true), sample('s1', true), sample('s2', true)];
    markNearDuplicates(samples, lumas, 0.97, lumaSimilarity);
    expect(samples[1]?.isNearDuplicate).toBe(true);
    expect(samples[1]?.duplicateOfSampleId).toBe('s0');
    expect(samples[2]?.isNearDuplicate).toBe(false);
  });
});
