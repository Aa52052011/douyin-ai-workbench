import { describe, expect, it } from 'vitest';
import {
  aggregatePublicationPerformance,
  computeRates,
  type AggregatorSnapshot,
} from './publication-metrics-aggregator.js';

const PUBLISHED_AT = new Date('2026-08-01T00:00:00.000Z');
const GENERATED_AT = new Date('2026-08-10T00:00:00.000Z');
const PUBLICATION = {
  id: '11111111-1111-4111-8111-111111111111',
  videoId: '22222222-2222-4222-8222-222222222222',
  platform: 'MOCK',
  publishedAt: PUBLISHED_AT,
};

function snap(
  id: string,
  observedAt: string,
  metrics: Partial<AggregatorSnapshot> = {},
  source = 'MANUAL',
): AggregatorSnapshot {
  const observed = new Date(observedAt);
  return {
    id,
    source,
    observedAt: observed,
    createdAt: metrics.createdAt ?? observed,
    views: metrics.views ?? null,
    likes: metrics.likes ?? null,
    comments: metrics.comments ?? null,
    shares: metrics.shares ?? null,
    favorites: metrics.favorites ?? null,
    averageWatchTimeSeconds: metrics.averageWatchTimeSeconds ?? null,
    completionRate: metrics.completionRate ?? null,
    newFollowers: metrics.newFollowers ?? null,
  };
}

function summarize(snapshots: AggregatorSnapshot[], generatedAt = GENERATED_AT) {
  return aggregatePublicationPerformance({ publication: PUBLICATION, snapshots, generatedAt });
}

describe('aggregatePublicationPerformance', () => {
  it('returns empty windows and NO_SNAPSHOTS when there are no snapshots', () => {
    const summary = summarize([]);
    expect(summary.snapshotCount).toBe(0);
    expect(summary.latest).toBeNull();
    expect(summary.firstObservedAt).toBeNull();
    expect(summary.latestObservedAt).toBeNull();
    expect(summary.windows.H24.snapshotId).toBeNull();
    expect(summary.windows.D7.views).toBeNull();
    expect(summary.windows.LIFETIME.views).toBeNull();
    expect(summary.dataQualityFlags).toEqual(['NO_SNAPSHOTS']);
  });

  it('uses a single snapshot as latest and all window points', () => {
    const only = snap('s1', '2026-08-01T02:00:00.000Z', { views: 10, likes: 2, comments: 0, shares: 0, favorites: 0 });
    const summary = summarize([only]);
    expect(summary.snapshotCount).toBe(1);
    expect(summary.latest?.snapshotId).toBe('s1');
    expect(summary.windows.H24.snapshotId).toBe('s1');
    expect(summary.windows.D7.snapshotId).toBe('s1');
    expect(summary.windows.LIFETIME.snapshotId).toBe('s1');
    expect(summary.windows.LIFETIME.viewsDeltaObserved).toBeNull();
    expect(summary.dataQualityFlags).toContain('SINGLE_SNAPSHOT_ONLY');
  });

  it('selects latest by observedAt then createdAt then id', () => {
    const a = snap('a', '2026-08-02T00:00:00.000Z', { views: 1, createdAt: new Date('2026-08-02T00:00:02.000Z') });
    const b = snap('b', '2026-08-02T00:00:00.000Z', { views: 2, createdAt: new Date('2026-08-02T00:00:03.000Z') });
    const c = snap('c', '2026-08-03T00:00:00.000Z', { views: 3 });
    const summary = summarize([a, b, c]);
    expect(summary.latest?.snapshotId).toBe('c');
    expect(summary.latestObservedAt).toEqual(c.observedAt);
    expect(summary.firstObservedAt).toEqual(a.observedAt);
  });

  it('breaks same observedAt ties using createdAt and id without merging rows', () => {
    const early = snap('aaa', '2026-08-02T10:00:00.000Z', {
      views: 1000,
      createdAt: new Date('2026-08-02T10:00:00.000Z'),
    });
    const late = snap('zzz', '2026-08-02T10:00:00.000Z', {
      views: 1200,
      createdAt: new Date('2026-08-02T10:00:00.000Z'),
    }, 'API');
    const summary = summarize([early, late]);
    expect(summary.latest?.snapshotId).toBe('zzz');
    expect(summary.latest?.views).toBe(1200);
    expect(summary.dataQualityFlags).toContain('SAME_TIME_CONFLICT');
    expect(summary.dataQualityFlags).toContain('MIXED_SOURCES');
    expect(summary.sourcesUsed).toEqual(['API', 'MANUAL']);
  });

  it('uses H24 latest snapshot at or before cutoff and ignores later points', () => {
    const inside = snap('h24', '2026-08-01T20:00:00.000Z', { views: 100 });
    const after = snap('later', '2026-08-02T02:00:00.000Z', { views: 999 });
    const summary = summarize([inside, after]);
    expect(summary.windows.H24.snapshotId).toBe('h24');
    expect(summary.windows.H24.views).toBe(100);
    expect(summary.windows.LIFETIME.views).toBe(999);
  });

  it('does not backfill H24 from a snapshot after 24h', () => {
    const onlyLate = snap('late', '2026-08-02T06:00:00.000Z', { views: 50 });
    const summary = summarize([onlyLate]);
    expect(summary.windows.H24.snapshotId).toBeNull();
    expect(summary.windows.H24.views).toBeNull();
    expect(summary.windows.D7.views).toBe(50);
  });

  it('selects D7 latest at or before publishedAt + 7d', () => {
    const day6 = snap('d6', '2026-08-06T00:00:00.000Z', { views: 200 });
    const day8 = snap('d8', '2026-08-09T00:00:00.000Z', { views: 400 });
    const summary = summarize([day6, day8]);
    expect(summary.windows.D7.views).toBe(200);
    expect(summary.windows.LIFETIME.views).toBe(400);
  });

  it('uses latest cumulative value for LIFETIME and never sums snapshots', () => {
    const summary = summarize([
      snap('a', '2026-08-01T01:00:00.000Z', { views: 1000 }),
      snap('b', '2026-08-02T01:00:00.000Z', { views: 3000 }),
      snap('c', '2026-08-03T01:00:00.000Z', { views: 5000 }),
    ]);
    expect(summary.windows.LIFETIME.views).toBe(5000);
    expect(summary.windows.LIFETIME.views).not.toBe(9000);
    expect(summary.windows.LIFETIME.viewsDeltaObserved).toBe(4000);
  });

  it('computes likeRate and leaves commentRate null when comments are unknown', () => {
    const rates = computeRates({ views: 1000, likes: 50, comments: null, shares: 10, favorites: 5 });
    expect(rates.likeRate).toBe(0.05);
    expect(rates.commentRate).toBeNull();
    expect(rates.shareRate).toBe(0.01);
    expect(rates.engagementRate).toBeNull();
  });

  it('returns null rates when views is 0', () => {
    const rates = computeRates({ views: 0, likes: 0, comments: 0, shares: 0, favorites: 0 });
    expect(rates.likeRate).toBeNull();
    expect(rates.engagementRate).toBeNull();
  });

  it('treats explicit comments=0 as known and includes it in engagementRate', () => {
    const rates = computeRates({ views: 100, likes: 10, comments: 0, shares: 2, favorites: 3 });
    expect(rates.commentRate).toBe(0);
    expect(rates.engagementRate).toBe(0.15);
  });

  it('preserves completionRate 0–1 and watch-time decimals', () => {
    const summary = summarize([
      snap('s', '2026-08-01T03:00:00.000Z', { views: 10, completionRate: 0.63, averageWatchTimeSeconds: 12.345 }),
    ]);
    expect(summary.latest?.completionRate).toBe(0.63);
    expect(summary.latest?.averageWatchTimeSeconds).toBe(12.345);
  });

  it('preserves negative views delta and flags METRIC_DECREASE_DETECTED', () => {
    const summary = summarize([
      snap('a', '2026-08-01T01:00:00.000Z', { views: 1000 }),
      snap('b', '2026-08-01T05:00:00.000Z', { views: 800 }),
    ]);
    expect(summary.latest?.viewsDelta).toBe(-200);
    expect(summary.windows.LIFETIME.viewsDeltaObserved).toBe(-200);
    expect(summary.dataQualityFlags).toContain('METRIC_DECREASE_DETECTED');
  });

  it('computes viewsPerHour from adjacent snapshots and returns null for zero duration', () => {
    const summary = summarize([
      snap('a', '2026-08-01T01:00:00.000Z', { views: 100 }),
      snap('b', '2026-08-01T03:00:00.000Z', { views: 300 }),
    ]);
    expect(summary.latest?.hoursSincePrevious).toBe(2);
    expect(summary.latest?.viewsPerHour).toBe(100);
    const zeroDuration = summarize([
      snap('p', '2026-08-01T06:00:00.000Z', { views: 10, createdAt: new Date('2026-08-01T06:00:00.000Z') }),
      snap('q', '2026-08-01T06:00:00.000Z', { views: 12, createdAt: new Date('2026-08-01T06:00:00.000Z') }),
    ]);
    expect(zeroDuration.latest?.hoursSincePrevious).toBe(0);
    expect(zeroDuration.latest?.viewsPerHour).toBeNull();
  });

  it('returns null velocity when views are unknown', () => {
    const summary = summarize([
      snap('a', '2026-08-01T01:00:00.000Z', { likes: 1 }),
      snap('b', '2026-08-01T03:00:00.000Z', { likes: 2 }),
    ]);
    expect(summary.latest?.viewsPerHour).toBeNull();
    expect(summary.dataQualityFlags).toContain('MISSING_VIEWS');
  });

  it('records mixed sources in a stable order', () => {
    const summary = summarize([
      snap('m', '2026-08-01T01:00:00.000Z', { views: 1 }, 'MANUAL'),
      snap('a', '2026-08-01T02:00:00.000Z', { views: 2 }, 'API'),
    ]);
    expect(summary.mixedSources).toBe(true);
    expect(summary.sourcesUsed).toEqual(['API', 'MANUAL']);
    expect(summary.dataQualityFlags).toContain('MIXED_SOURCES');
  });

  it('reports observation coverage for a sparse 24h window', () => {
    const twoHours = snap('early', '2026-08-01T02:00:00.000Z', { views: 10 });
    const summary = summarize([twoHours], new Date('2026-08-03T00:00:00.000Z'));
    expect(summary.windows.H24.windowCoverageHours).toBe(2);
    expect(summary.windows.H24.observationCoverage).toBeCloseTo(2 / 24);
    expect(summary.dataQualityFlags).toContain('SPARSE_24H');
  });

  it('does not assume views=0 at publishedAt', () => {
    const summary = summarize([snap('s', '2026-08-01T10:00:00.000Z', { views: 500 })]);
    expect(summary.latest?.viewsDelta).toBeNull();
    expect(summary.latest?.viewsPerHour).toBeNull();
    expect(summary.windows.H24.views).toBe(500);
  });

  it('uses every snapshot for LIFETIME even when generatedAt is earlier than latest observedAt', () => {
    const summary = summarize(
      [
        snap('a', '2026-08-01T01:00:00.000Z', { views: 1 }),
        snap('b', '2026-08-09T00:00:00.000Z', { views: 9 }),
      ],
      new Date('2026-08-02T00:00:00.000Z'),
    );
    expect(summary.windows.LIFETIME.views).toBe(9);
    expect(summary.latest?.views).toBe(9);
    expect(summary.windows.H24.views).toBe(1);
  });

  it('flags SPARSE_7D after the window elapsed when the D7 point is early', () => {
    const early = snap('e', '2026-08-02T00:00:00.000Z', { views: 10 });
    const summary = summarize([early], new Date('2026-08-10T00:00:00.000Z'));
    expect(summary.windows.D7.observationCoverage).toBeCloseTo(24 / 168);
    expect(summary.dataQualityFlags).toContain('SPARSE_7D');
    expect(summary.dataQualityFlags).not.toContain('SPARSE_24H');
  });
});
