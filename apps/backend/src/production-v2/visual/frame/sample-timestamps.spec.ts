import { describe, expect, it } from 'vitest';
import { effectiveSampleCount, requestedSampleCount } from './frame-analysis-config.js';
import { buildUniformSampleTimestamps } from './sample-timestamps.js';

function assertMonoUnique(stamps: number[], durationMs: number) {
  expect(stamps.length).toBeGreaterThan(0);
  for (let i = 0; i < stamps.length; i += 1) {
    expect(stamps[i]).toBeGreaterThanOrEqual(0);
    expect(stamps[i]).toBeLessThan(durationMs);
    if (i > 0) {
      expect(stamps[i]).toBeGreaterThan(stamps[i - 1]!);
    }
  }
}

describe('buildUniformSampleTimestamps', () => {
  it.each([200, 800, 2000, 10_000, 35_000, 60_000, 120_000])('duration %i ms', (durationMs) => {
    const count = effectiveSampleCount(durationMs, requestedSampleCount(durationMs));
    const stamps = buildUniformSampleTimestamps(durationMs, count);
    assertMonoUnique(stamps, durationMs);
    expect(stamps.length).toBeLessThanOrEqual(count);
    expect(stamps.length).toBeLessThanOrEqual(10);
  });

  it('collapses very short clips to one sample', () => {
    expect(buildUniformSampleTimestamps(200)).toHaveLength(1);
    expect(buildUniformSampleTimestamps(800).length).toBeLessThanOrEqual(2);
  });

  it('returns empty when duration unknown', () => {
    expect(buildUniformSampleTimestamps(0)).toEqual([]);
    expect(buildUniformSampleTimestamps(Number.NaN)).toEqual([]);
  });
});
