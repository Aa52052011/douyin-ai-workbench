import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import {
  calculatePerformanceMetricsV1,
  computeRatios,
  dataSufficiencyFromCount,
  filterWindow,
  sortSnapshots,
} from './metrics-calculator.js';
import type { MetricSnapshotInputV1 } from './performance-analysis.types.js';

function snap(partial: Partial<MetricSnapshotInputV1> & { id: string; capturedAt: string }): MetricSnapshotInputV1 {
  return {
    publishedPostId: 'post-1',
    source: 'MANUAL_ENTRY',
    playCount: 0,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    collectCount: 0,
    followerDelta: 0,
    fixture: true,
    ...partial,
  };
}

describe('PerformanceMetricsCalculatorV1', () => {
  it('blocks negative metrics', () => {
    expect(() =>
      calculatePerformanceMetricsV1({
        snapshots: [snap({ id: 'a', capturedAt: '2026-09-14T00:00:00.000Z', playCount: -1 })],
        publishedPostId: 'post-1',
        window: 'LATEST_ONLY',
      }),
    ).toThrow(AppError);
  });

  it('zero plays yield null ratios not Infinity or 0', () => {
    const ratios = computeRatios(0, 1, 1, 1, 1);
    expect(ratios.likeRate).toBeNull();
    expect(ratios.engagementRate).toBeNull();
    expect(Number.isFinite(ratios.likeRate as number)).toBe(false);
  });

  it('orders snapshots by capturedAt', () => {
    const sorted = sortSnapshots([
      snap({ id: 'b', capturedAt: '2026-09-14T02:00:00.000Z', playCount: 20 }),
      snap({ id: 'a', capturedAt: '2026-09-14T01:00:00.000Z', playCount: 10 }),
    ]);
    expect(sorted.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('computes deltas', () => {
    const summary = calculatePerformanceMetricsV1({
      snapshots: [
        snap({ id: 'a', capturedAt: '2026-09-14T00:00:00.000Z', playCount: 10, likeCount: 1 }),
        snap({ id: 'b', capturedAt: '2026-09-14T02:00:00.000Z', playCount: 20, likeCount: 3 }),
      ],
      publishedPostId: 'post-1',
      window: 'FIRST_24H',
    });
    expect(summary.playDelta).toBe(10);
    expect(summary.likeDelta).toBe(2);
    expect(summary.trend.deltaPerHour).toBe(5);
    expect(summary.windowCoverage).toBe('PARTIAL_WINDOW');
  });

  it('computes rates when plays > 0', () => {
    const summary = calculatePerformanceMetricsV1({
      snapshots: [snap({ id: 'a', capturedAt: '2026-09-14T00:00:00.000Z', playCount: 100, likeCount: 10, commentCount: 2, shareCount: 1, collectCount: 3 })],
      publishedPostId: 'post-1',
      window: 'LATEST_ONLY',
    });
    expect(summary.ratios.likeRate).toBe(0.1);
    expect(summary.ratios.engagementRate).toBe(0.16);
    expect(summary.officialVerified).toBe(false);
    expect(summary.metricsAreUserEntered).toBe(true);
  });

  it('does not mark FIRST_24H complete without coverage', () => {
    const filtered = filterWindow(
      [snap({ id: 'a', capturedAt: '2026-09-14T00:00:00.000Z', playCount: 1 })],
      'FIRST_24H',
      new Date('2026-09-14T00:00:00.000Z'),
    );
    expect(filtered.coverage).toBe('PARTIAL_WINDOW');
  });

  it('classifies data sufficiency', () => {
    expect(dataSufficiencyFromCount(0)).toBe('EMPTY');
    expect(dataSufficiencyFromCount(1)).toBe('SPARSE');
    expect(dataSufficiencyFromCount(2)).toBe('BASIC');
    expect(dataSufficiencyFromCount(4)).toBe('GOOD');
    expect(dataSufficiencyFromCount(5)).toBe('RICH');
  });

  it('rejects mismatched publishedPost', () => {
    try {
      calculatePerformanceMetricsV1({
        snapshots: [snap({ id: 'a', capturedAt: '2026-09-14T00:00:00.000Z', publishedPostId: 'other' })],
        publishedPostId: 'post-1',
        window: 'LATEST_ONLY',
      });
      throw new Error('expected');
    } catch (error) {
      expect((error as AppError).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });
});
