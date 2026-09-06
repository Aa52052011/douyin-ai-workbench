import { describe, expect, it } from 'vitest';
import { PERFORMANCE_INSIGHT_RULES_V1 } from './performance-insight.constants.js';
import { generatePerformanceInsights } from './performance-insight.engine.js';
import type { InsightCode } from './performance-insight.types.js';
import { computeRates, type LatestPointMetrics, type PublicationPerformanceSummary, type WindowPointMetrics } from './publication-metrics-aggregator.js';
import type { DataQualityFlag } from './publication-performance.types.js';

const GENERATED_AT = new Date('2026-08-10T00:00:00.000Z');
const OBSERVED_AT = new Date('2026-08-01T20:00:00.000Z');
const INSIGHT_AT = new Date('2026-08-10T01:00:00.000Z');

function emptyWindow(): WindowPointMetrics {
  return {
    snapshotId: null,
    observedAt: null,
    views: null,
    likes: null,
    comments: null,
    shares: null,
    favorites: null,
    averageWatchTimeSeconds: null,
    completionRate: null,
    newFollowers: null,
    likeRate: null,
    commentRate: null,
    shareRate: null,
    favoriteRate: null,
    engagementRate: null,
    windowCoverageHours: null,
    observationCoverage: null,
    viewsDeltaObserved: null,
    hoursObserved: null,
    viewsPerHour: null,
  };
}

function point(partial: Partial<WindowPointMetrics> = {}): WindowPointMetrics {
  const merged: WindowPointMetrics = {
    ...emptyWindow(),
    snapshotId: 'snap-h24',
    observedAt: OBSERVED_AT,
    windowCoverageHours: 24,
    observationCoverage: 1,
    ...partial,
  };
  return { ...merged, ...computeRates(merged) };
}

function latestFrom(window: WindowPointMetrics): LatestPointMetrics {
  return {
    snapshotId: window.snapshotId ?? 'snap-latest',
    source: 'MANUAL',
    observedAt: window.observedAt ?? OBSERVED_AT,
    views: window.views,
    likes: window.likes,
    comments: window.comments,
    shares: window.shares,
    favorites: window.favorites,
    averageWatchTimeSeconds: window.averageWatchTimeSeconds,
    completionRate: window.completionRate,
    newFollowers: window.newFollowers,
    ...computeRates(window),
    viewsDelta: null,
    likesDelta: null,
    commentsDelta: null,
    sharesDelta: null,
    favoritesDelta: null,
    newFollowersDelta: null,
    hoursSincePrevious: null,
    viewsPerHour: null,
  };
}

function makeSummary(opts: {
  snapshotCount?: number;
  flags?: DataQualityFlag[];
  mixedSources?: boolean;
  sourcesUsed?: string[];
  h24?: Partial<WindowPointMetrics> | null;
  d7?: Partial<WindowPointMetrics> | null;
  lifetime?: Partial<WindowPointMetrics> | null;
  latest?: LatestPointMetrics | null;
} = {}): PublicationPerformanceSummary {
  const h24 = opts.h24 === null || opts.h24 === undefined ? emptyWindow() : point(opts.h24);
  const d7 = opts.d7 === null ? emptyWindow() : point({ snapshotId: 'snap-d7', ...(opts.d7 ?? opts.h24 ?? {}) });
  const lifetime =
    opts.lifetime === null ? emptyWindow() : point({ snapshotId: 'snap-life', ...(opts.lifetime ?? opts.d7 ?? opts.h24 ?? {}) });
  const snapshotCount = opts.snapshotCount ?? 3;
  return {
    publicationId: '11111111-1111-4111-8111-111111111111',
    videoId: '22222222-2222-4222-8222-222222222222',
    platform: 'MOCK',
    publishedAt: new Date('2026-08-01T00:00:00.000Z'),
    generatedAt: GENERATED_AT,
    snapshotCount,
    firstObservedAt: h24.observedAt,
    latestObservedAt: lifetime.observedAt,
    sourcesUsed: opts.sourcesUsed ?? ['MANUAL'],
    mixedSources: opts.mixedSources ?? false,
    dataQualityFlags: opts.flags ?? [],
    latest: opts.latest === undefined ? (lifetime.snapshotId ? latestFrom(lifetime) : null) : opts.latest,
    windows: { H24: h24, D7: d7, LIFETIME: lifetime },
  };
}

function sufficient(h24: Partial<WindowPointMetrics> = {}): PublicationPerformanceSummary {
  const metrics: Partial<WindowPointMetrics> = {
    views: 1000,
    likes: 20,
    comments: 5,
    shares: 5,
    favorites: 5,
    completionRate: 0.4,
    observationCoverage: 1,
    windowCoverageHours: 24,
    ...h24,
  };
  return makeSummary({ snapshotCount: 3, flags: [], h24: metrics, d7: metrics, lifetime: metrics });
}

function codesOf(summary: PublicationPerformanceSummary): InsightCode[] {
  return generatePerformanceInsights(summary, INSIGHT_AT).insights.map((row) => row.code);
}

function insight(summary: PublicationPerformanceSummary, code: InsightCode) {
  return generatePerformanceInsights(summary, INSIGHT_AT).insights.find((row) => row.code === code);
}

describe('generatePerformanceInsights', () => {
  it('emits only INSUFFICIENT_DATA when there are no snapshots', () => {
    const summary = makeSummary({
      snapshotCount: 0,
      flags: ['NO_SNAPSHOTS'],
      h24: null,
      d7: null,
      lifetime: null,
      latest: null,
    });
    const result = generatePerformanceInsights(summary, INSIGHT_AT);
    expect(result.dataSufficiency).toBe('INSUFFICIENT');
    expect(result.rulesVersion).toBe('v1');
    expect(result.insights.map((row) => row.code)).toEqual(['INSUFFICIENT_DATA']);
    expect(result.insights[0]?.category).toBe('DATA_QUALITY');
  });

  it('marks a single snapshot as PARTIAL', () => {
    const summary = makeSummary({
      snapshotCount: 1,
      flags: ['SINGLE_SNAPSHOT_ONLY'],
      h24: { views: 1000, likes: 20, comments: 0, shares: 0, favorites: 0, observationCoverage: 1 },
    });
    const result = generatePerformanceInsights(summary, INSIGHT_AT);
    expect(result.dataSufficiency).toBe('PARTIAL');
    expect(codesOf(summary)).toContain('INSUFFICIENT_DATA');
  });

  it('marks reliable H24 with views as SUFFICIENT', () => {
    const result = generatePerformanceInsights(sufficient(), INSIGHT_AT);
    expect(result.dataSufficiency).toBe('SUFFICIENT');
    expect(result.insights.some((row) => row.code === 'INSUFFICIENT_DATA')).toBe(false);
  });

  it('emits HIGH_LIKE_RATE when likeRate meets the v1 threshold', () => {
    const summary = sufficient({ likes: 80, comments: 0, shares: 0, favorites: 0 });
    const row = insight(summary, 'HIGH_LIKE_RATE');
    expect(row?.window).toBe('H24');
    expect(row?.severity).toBe('POSITIVE');
    expect(row?.evidence[0]?.value).toBe(0.08);
    expect(row?.evidence[0]?.threshold).toBe(PERFORMANCE_INSIGHT_RULES_V1.likeRateHigh);
    expect(row?.evidence[0]?.comparator).toBe('>=');
    expect(row?.evidence[0]?.views).toBe(1000);
  });

  it('emits LOW_LIKE_RATE when sufficient and likeRate is below the low threshold', () => {
    const summary = sufficient({ likes: 5, comments: 5, shares: 5, favorites: 5 });
    expect(insight(summary, 'LOW_LIKE_RATE')?.severity).toBe('WARNING');
    expect(insight(summary, 'HIGH_LIKE_RATE')).toBeUndefined();
  });

  it('emits HIGH_COMMENT_RATE', () => {
    expect(codesOf(sufficient({ comments: 20 }))).toContain('HIGH_COMMENT_RATE');
  });

  it('emits HIGH_SHARE_RATE', () => {
    expect(codesOf(sufficient({ shares: 30 }))).toContain('HIGH_SHARE_RATE');
  });

  it('emits HIGH_FAVORITE_RATE', () => {
    expect(codesOf(sufficient({ favorites: 30 }))).toContain('HIGH_FAVORITE_RATE');
  });

  it('emits HIGH_ENGAGEMENT_RATE when all components are known and high', () => {
    const summary = sufficient({ likes: 50, comments: 20, shares: 20, favorites: 20 });
    expect(insight(summary, 'HIGH_ENGAGEMENT_RATE')?.evidence[0]?.value).toBe(0.11);
  });

  it('emits LOW_ENGAGEMENT_RATE when sufficient and engagement is low', () => {
    const summary = sufficient({ likes: 15, comments: 0, shares: 0, favorites: 0 });
    expect(codesOf(summary)).toContain('LOW_ENGAGEMENT_RATE');
    expect(codesOf(summary)).not.toContain('LOW_LIKE_RATE');
  });

  it('emits STRONG_COMPLETION_RATE', () => {
    const row = insight(sufficient({ completionRate: 0.7 }), 'STRONG_COMPLETION_RATE');
    expect(row?.category).toBe('RETENTION');
    expect(row?.evidence[0]?.threshold).toBe(0.6);
  });

  it('emits WEAK_COMPLETION_RATE only when sufficient and coverage is adequate', () => {
    expect(codesOf(sufficient({ completionRate: 0.1 }))).toContain('WEAK_COMPLETION_RATE');
  });

  it('does not emit rate insights when views are below the denominator gate', () => {
    const summary = sufficient({ views: 10, likes: 8, comments: 2, shares: 2, favorites: 2 });
    const codes = codesOf(summary);
    expect(codes).not.toContain('HIGH_LIKE_RATE');
    expect(codes).not.toContain('HIGH_SHARE_RATE');
    expect(codes).not.toContain('HIGH_ENGAGEMENT_RATE');
  });

  it('does not emit rate insights when views is 0', () => {
    const summary = sufficient({ views: 0, likes: 0, comments: 0, shares: 0, favorites: 0 });
    expect(codesOf(summary).some((code) => code.includes('RATE'))).toBe(false);
  });

  it('does not emit like-rate insights when likeRate is null', () => {
    const summary = sufficient({ likes: null, comments: 20, shares: 5, favorites: 5 });
    const codes = codesOf(summary);
    expect(codes).not.toContain('HIGH_LIKE_RATE');
    expect(codes).not.toContain('LOW_LIKE_RATE');
    expect(codes).toContain('HIGH_COMMENT_RATE');
  });

  it('treats explicit zero likes as a valid low-rate signal when sufficient', () => {
    const summary = sufficient({ likes: 0, comments: 5, shares: 5, favorites: 5 });
    expect(insight(summary, 'LOW_LIKE_RATE')?.evidence[0]?.value).toBe(0);
  });

  it('emits MIXED_SOURCE_DATA from the summary flag', () => {
    const summary = sufficient();
    summary.mixedSources = true;
    summary.sourcesUsed = ['API', 'MANUAL'];
    summary.dataQualityFlags = ['MIXED_SOURCES'];
    expect(insight(summary, 'MIXED_SOURCE_DATA')?.severity).toBe('INFO');
  });

  it('lowers performance confidence when sources are mixed', () => {
    const clean = sufficient({ likes: 80, comments: 0, shares: 0, favorites: 0 });
    const mixed = sufficient({ likes: 80, comments: 0, shares: 0, favorites: 0 });
    mixed.mixedSources = true;
    mixed.sourcesUsed = ['API', 'MANUAL'];
    mixed.dataQualityFlags = ['MIXED_SOURCES'];
    expect(insight(clean, 'HIGH_LIKE_RATE')?.confidence).toBe('HIGH');
    expect(insight(mixed, 'HIGH_LIKE_RATE')?.confidence).toBe('MEDIUM');
  });

  it('emits METRIC_DECREASE_DETECTED without treating it as churn', () => {
    const summary = sufficient();
    summary.dataQualityFlags = ['METRIC_DECREASE_DETECTED'];
    const row = insight(summary, 'METRIC_DECREASE_DETECTED');
    expect(row?.category).toBe('DATA_QUALITY');
    expect(row?.severity).toBe('WARNING');
  });

  it('emits SAME_TIME_CONFLICT', () => {
    const summary = sufficient();
    summary.dataQualityFlags = ['SAME_TIME_CONFLICT'];
    expect(codesOf(summary)).toContain('SAME_TIME_CONFLICT');
  });

  it('lowers performance confidence when same-time conflict is present', () => {
    const summary = sufficient({ likes: 80, comments: 0, shares: 0, favorites: 0 });
    summary.dataQualityFlags = ['SAME_TIME_CONFLICT'];
    expect(insight(summary, 'HIGH_LIKE_RATE')?.confidence).toBe('MEDIUM');
  });

  it('suppresses performance labels when data is insufficient', () => {
    const summary = makeSummary({
      snapshotCount: 0,
      flags: ['NO_SNAPSHOTS'],
      h24: { views: 1000, likes: 80, comments: 20, shares: 20, favorites: 20, completionRate: 0.9 },
      d7: null,
      lifetime: null,
      latest: null,
    });
    summary.snapshotCount = 0;
    summary.dataQualityFlags = ['NO_SNAPSHOTS'];
    expect(codesOf(summary)).toEqual(['INSUFFICIENT_DATA']);
  });

  it('suppresses conservative low rules when data is only PARTIAL', () => {
    const summary = makeSummary({
      snapshotCount: 1,
      flags: ['SINGLE_SNAPSHOT_ONLY'],
      h24: { views: 1000, likes: 0, comments: 0, shares: 0, favorites: 0, completionRate: 0.1, observationCoverage: 1 },
    });
    const codes = codesOf(summary);
    expect(codes).not.toContain('LOW_LIKE_RATE');
    expect(codes).not.toContain('LOW_ENGAGEMENT_RATE');
    expect(codes).not.toContain('WEAK_COMPLETION_RATE');
    expect(codes).toContain('INSUFFICIENT_DATA');
  });

  it('allows positive and negative insights on different dimensions', () => {
    const summary = sufficient({ likes: 5, comments: 0, shares: 40, favorites: 0 });
    const codes = codesOf(summary);
    expect(codes).toContain('HIGH_SHARE_RATE');
    expect(codes).toContain('LOW_LIKE_RATE');
  });

  it('never emits HIGH and LOW for the same metric', () => {
    const high = codesOf(sufficient({ likes: 80, comments: 0, shares: 0, favorites: 0 }));
    const low = codesOf(sufficient({ likes: 5, comments: 5, shares: 5, favorites: 5 }));
    expect(high).toContain('HIGH_LIKE_RATE');
    expect(high).not.toContain('LOW_LIKE_RATE');
    expect(low).toContain('LOW_LIKE_RATE');
    expect(low).not.toContain('HIGH_LIKE_RATE');
  });

  it('orders insights by category then code', () => {
    const summary = sufficient({ likes: 80, comments: 20, shares: 30, favorites: 30, completionRate: 0.7 });
    summary.mixedSources = true;
    summary.sourcesUsed = ['API', 'MANUAL'];
    summary.dataQualityFlags = ['MIXED_SOURCES', 'METRIC_DECREASE_DETECTED'];
    const codes = codesOf(summary);
    const mixedAt = codes.indexOf('MIXED_SOURCE_DATA');
    const decreaseAt = codes.indexOf('METRIC_DECREASE_DETECTED');
    const strongAt = codes.indexOf('STRONG_COMPLETION_RATE');
    const likeAt = codes.indexOf('HIGH_LIKE_RATE');
    const shareAt = codes.indexOf('HIGH_SHARE_RATE');
    expect(decreaseAt).toBeGreaterThanOrEqual(0);
    expect(mixedAt).toBeGreaterThan(decreaseAt);
    expect(strongAt).toBeGreaterThan(mixedAt);
    expect(likeAt).toBeGreaterThan(strongAt);
    expect(shareAt).toBeGreaterThan(likeAt);
  });

  it('sets rulesVersion v1 and copies summaryGeneratedAt', () => {
    const result = generatePerformanceInsights(sufficient(), INSIGHT_AT);
    expect(result.rulesVersion).toBe('v1');
    expect(result.generatedAt).toEqual(INSIGHT_AT);
    expect(result.summaryGeneratedAt).toEqual(GENERATED_AT);
    expect(result.publicationId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('includes threshold, value, and window on performance evidence', () => {
    const row = insight(sufficient({ shares: 40 }), 'HIGH_SHARE_RATE');
    expect(row?.window).toBe('H24');
    expect(row?.messageKey).toBe('performanceInsight.v1.HIGH_SHARE_RATE');
    expect(row?.evidence[0]).toEqual(
      expect.objectContaining({
        metric: 'shareRate',
        comparator: '>=',
        threshold: 0.02,
        views: 1000,
        snapshotId: 'snap-h24',
      }),
    );
  });

  it('does not generate recommendations or causal copy', () => {
    const result = generatePerformanceInsights(
      sufficient({ likes: 80, comments: 20, shares: 30, favorites: 30, completionRate: 0.7 }),
      INSIGHT_AT,
    );
    for (const row of result.insights) {
      expect(row).not.toHaveProperty('recommendation');
      expect(row).not.toHaveProperty('suggestedAction');
      expect(JSON.stringify(row)).not.toMatch(/应该|建议|hook|选题/i);
      expect(row.messageKey).toMatch(/^performanceInsight\.v1\.[A-Z0-9_]+$/);
    }
  });

  it('picks D7 when H24 fails the views denominator', () => {
    const summary = makeSummary({
      snapshotCount: 3,
      flags: [],
      h24: { views: 10, likes: 8, comments: 0, shares: 4, favorites: 0, observationCoverage: 1 },
      d7: {
        snapshotId: 'snap-d7',
        views: 500,
        likes: 10,
        comments: 0,
        shares: 20,
        favorites: 0,
        observationCoverage: 1,
      },
    });
    expect(insight(summary, 'HIGH_SHARE_RATE')?.window).toBe('D7');
  });

  it('does not emit WEAK_COMPLETION_RATE when retention coverage is sparse', () => {
    const summary = sufficient({
      completionRate: 0.1,
      observationCoverage: 0.1,
      windowCoverageHours: 2.4,
    });
    summary.dataQualityFlags = ['SPARSE_24H'];
    summary.windows.H24.observationCoverage = 0.1;
    expect(summary.dataQualityFlags).toContain('SPARSE_24H');
    const result = generatePerformanceInsights(summary, INSIGHT_AT);
    expect(result.dataSufficiency).toBe('PARTIAL');
    expect(result.insights.map((row) => row.code)).not.toContain('WEAK_COMPLETION_RATE');
  });

  it('does not call LLM or providers; engine is a pure function of the summary', () => {
    const summary = sufficient({ likes: 80 });
    const first = generatePerformanceInsights(summary, INSIGHT_AT);
    const second = generatePerformanceInsights(summary, INSIGHT_AT);
    expect(first).toEqual(second);
  });
});
