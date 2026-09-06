import {
  COUNT_METRIC_KEYS,
  D7_MS,
  DATA_QUALITY_FLAGS,
  H24_MS,
  MS_PER_HOUR,
  type DataQualityFlag,
  type PerformanceWindow,
} from './publication-performance.types.js';
import { compareMetricSnapshotsNewestFirst, compareMetricSnapshotsOldestFirst } from './snapshot-order.js';

export type AggregatorSnapshot = {
  id: string;
  source: string;
  observedAt: Date;
  createdAt: Date;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  averageWatchTimeSeconds: number | null;
  completionRate: number | null;
  newFollowers: number | null;
};

export type AggregatorPublication = {
  id: string;
  videoId: string;
  platform: string;
  publishedAt: Date | null;
};

export type MetricRates = {
  likeRate: number | null;
  commentRate: number | null;
  shareRate: number | null;
  favoriteRate: number | null;
  engagementRate: number | null;
};

export type WindowPointMetrics = MetricRates & {
  snapshotId: string | null;
  observedAt: Date | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  averageWatchTimeSeconds: number | null;
  completionRate: number | null;
  newFollowers: number | null;
  windowCoverageHours: number | null;
  observationCoverage: number | null;
  viewsDeltaObserved: number | null;
  hoursObserved: number | null;
  viewsPerHour: number | null;
};

export type LatestPointMetrics = MetricRates & {
  snapshotId: string;
  source: string;
  observedAt: Date;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  averageWatchTimeSeconds: number | null;
  completionRate: number | null;
  newFollowers: number | null;
  viewsDelta: number | null;
  likesDelta: number | null;
  commentsDelta: number | null;
  sharesDelta: number | null;
  favoritesDelta: number | null;
  newFollowersDelta: number | null;
  hoursSincePrevious: number | null;
  viewsPerHour: number | null;
};

export type PublicationPerformanceSummary = {
  publicationId: string;
  videoId: string;
  platform: string;
  publishedAt: Date | null;
  generatedAt: Date;
  snapshotCount: number;
  firstObservedAt: Date | null;
  latestObservedAt: Date | null;
  sourcesUsed: string[];
  mixedSources: boolean;
  dataQualityFlags: DataQualityFlag[];
  latest: LatestPointMetrics | null;
  windows: {
    H24: WindowPointMetrics;
    D7: WindowPointMetrics;
    LIFETIME: WindowPointMetrics;
  };
};

export function aggregatePublicationPerformance(input: {
  publication: AggregatorPublication;
  snapshots: AggregatorSnapshot[];
  generatedAt?: Date;
}): PublicationPerformanceSummary {
  const generatedAt = input.generatedAt ?? new Date();
  const newestFirst = [...input.snapshots].sort(compareMetricSnapshotsNewestFirst);
  const oldestFirst = [...input.snapshots].sort(compareMetricSnapshotsOldestFirst);
  const latestSnapshot = newestFirst[0] ?? null;
  const firstSnapshot = oldestFirst[0] ?? null;
  const sourcesUsed = uniqueSorted(input.snapshots.map((row) => row.source));
  const mixedSources = sourcesUsed.length > 1;
  const publishedAt = input.publication.publishedAt;

  const latest = latestSnapshot ? toLatestPoint(latestSnapshot, previousOf(oldestFirst, latestSnapshot)) : null;
  const windows = {
    H24: buildWindow(oldestFirst, publishedAt, 'H24'),
    D7: buildWindow(oldestFirst, publishedAt, 'D7'),
    LIFETIME: buildWindow(oldestFirst, publishedAt, 'LIFETIME'),
  };

  return {
    publicationId: input.publication.id,
    videoId: input.publication.videoId,
    platform: input.publication.platform,
    publishedAt,
    generatedAt,
    snapshotCount: input.snapshots.length,
    firstObservedAt: firstSnapshot?.observedAt ?? null,
    latestObservedAt: latestSnapshot?.observedAt ?? null,
    sourcesUsed,
    mixedSources,
    dataQualityFlags: collectFlags({
      snapshots: oldestFirst,
      latestSnapshot,
      mixedSources,
      publishedAt,
      generatedAt,
      h24: windows.H24,
      d7: windows.D7,
    }),
    latest,
    windows,
  };
}

function toLatestPoint(latest: AggregatorSnapshot, previous: AggregatorSnapshot | null): LatestPointMetrics {
  const hoursSincePrevious = previous ? hoursBetween(previous.observedAt, latest.observedAt) : null;
  return {
    snapshotId: latest.id,
    source: latest.source,
    observedAt: latest.observedAt,
    ...copyMetrics(latest),
    ...computeRates(latest),
    viewsDelta: delta(previous?.views, latest.views),
    likesDelta: delta(previous?.likes, latest.likes),
    commentsDelta: delta(previous?.comments, latest.comments),
    sharesDelta: delta(previous?.shares, latest.shares),
    favoritesDelta: delta(previous?.favorites, latest.favorites),
    newFollowersDelta: delta(previous?.newFollowers, latest.newFollowers),
    hoursSincePrevious,
    viewsPerHour: velocity(previous?.views, latest.views, hoursSincePrevious),
  };
}

function buildWindow(
  oldestFirst: AggregatorSnapshot[],
  publishedAt: Date | null,
  window: PerformanceWindow,
): WindowPointMetrics {
  const windowMs = window === 'H24' ? H24_MS : window === 'D7' ? D7_MS : null;
  if (windowMs != null && publishedAt == null) {
    return emptyWindow();
  }
  const cutoffMs = windowMs != null && publishedAt ? publishedAt.getTime() + windowMs : null;
  const inWindow =
    cutoffMs == null ? oldestFirst : oldestFirst.filter((row) => row.observedAt.getTime() <= cutoffMs);
  const point = inWindow.length > 0 ? inWindow[inWindow.length - 1]! : null;
  if (!point) {
    return emptyWindow();
  }
  const first = inWindow[0]!;
  const hasPair = inWindow.length >= 2;
  const hoursObserved = hasPair ? hoursBetween(first.observedAt, point.observedAt) : null;
  const windowCoverageHours = publishedAt ? hoursBetween(publishedAt, point.observedAt) : null;
  const observationCoverage =
    windowMs != null && windowCoverageHours != null ? Math.min(windowCoverageHours / (windowMs / MS_PER_HOUR), 1) : null;
  return {
    snapshotId: point.id,
    observedAt: point.observedAt,
    ...copyMetrics(point),
    ...computeRates(point),
    windowCoverageHours,
    observationCoverage,
    viewsDeltaObserved: hasPair ? delta(first.views, point.views) : null,
    hoursObserved,
    viewsPerHour: hasPair ? velocity(first.views, point.views, hoursObserved) : null,
  };
}

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

function copyMetrics(row: AggregatorSnapshot) {
  return {
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    favorites: row.favorites,
    averageWatchTimeSeconds: row.averageWatchTimeSeconds,
    completionRate: row.completionRate,
    newFollowers: row.newFollowers,
  };
}

export function computeRates(row: Pick<AggregatorSnapshot, 'views' | 'likes' | 'comments' | 'shares' | 'favorites'>): MetricRates {
  return {
    likeRate: rate(row.likes, row.views),
    commentRate: rate(row.comments, row.views),
    shareRate: rate(row.shares, row.views),
    favoriteRate: rate(row.favorites, row.views),
    engagementRate: engagementRate(row),
  };
}

function rate(numerator: number | null | undefined, views: number | null): number | null {
  if (numerator == null || views == null || views <= 0) {
    return null;
  }
  return numerator / views;
}

function engagementRate(row: Pick<AggregatorSnapshot, 'views' | 'likes' | 'comments' | 'shares' | 'favorites'>): number | null {
  if (
    row.views == null ||
    row.views <= 0 ||
    row.likes == null ||
    row.comments == null ||
    row.shares == null ||
    row.favorites == null
  ) {
    return null;
  }
  return (row.likes + row.comments + row.shares + row.favorites) / row.views;
}

function delta(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null) {
    return null;
  }
  return to - from;
}

function velocity(from: number | null | undefined, to: number | null | undefined, hours: number | null): number | null {
  if (from == null || to == null || hours == null || hours <= 0) {
    return null;
  }
  return (to - from) / hours;
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_HOUR;
}

function previousOf(oldestFirst: AggregatorSnapshot[], latest: AggregatorSnapshot): AggregatorSnapshot | null {
  const index = oldestFirst.findIndex((row) => row.id === latest.id);
  if (index <= 0) {
    return null;
  }
  return oldestFirst[index - 1] ?? null;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function collectFlags(input: {
  snapshots: AggregatorSnapshot[];
  latestSnapshot: AggregatorSnapshot | null;
  mixedSources: boolean;
  publishedAt: Date | null;
  generatedAt: Date;
  h24: WindowPointMetrics;
  d7: WindowPointMetrics;
}): DataQualityFlag[] {
  const flags = new Set<DataQualityFlag>();
  if (input.snapshots.length === 0) {
    flags.add('NO_SNAPSHOTS');
  }
  if (input.snapshots.length === 1) {
    flags.add('SINGLE_SNAPSHOT_ONLY');
  }
  if (input.mixedSources) {
    flags.add('MIXED_SOURCES');
  }
  if (input.latestSnapshot && input.latestSnapshot.views == null) {
    flags.add('MISSING_VIEWS');
  }
  if (hasMetricDecrease(input.snapshots)) {
    flags.add('METRIC_DECREASE_DETECTED');
  }
  if (hasSameTimeConflict(input.snapshots)) {
    flags.add('SAME_TIME_CONFLICT');
  }
  if (isSparse(input.h24, input.publishedAt, input.generatedAt, H24_MS)) {
    flags.add('SPARSE_24H');
  }
  if (isSparse(input.d7, input.publishedAt, input.generatedAt, D7_MS)) {
    flags.add('SPARSE_7D');
  }
  return DATA_QUALITY_FLAGS.filter((flag) => flags.has(flag));
}

function isSparse(
  window: WindowPointMetrics,
  publishedAt: Date | null,
  generatedAt: Date,
  windowMs: number,
): boolean {
  if (!publishedAt || window.snapshotId == null || window.observationCoverage == null) {
    return false;
  }
  if (generatedAt.getTime() < publishedAt.getTime() + windowMs) {
    return false;
  }
  return window.observationCoverage < 1;
}

function hasMetricDecrease(oldestFirst: AggregatorSnapshot[]): boolean {
  for (let i = 1; i < oldestFirst.length; i += 1) {
    const prev = oldestFirst[i - 1]!;
    const next = oldestFirst[i]!;
    for (const key of COUNT_METRIC_KEYS) {
      const from = prev[key];
      const to = next[key];
      if (from != null && to != null && to < from) {
        return true;
      }
    }
  }
  return false;
}

function hasSameTimeConflict(snapshots: AggregatorSnapshot[]): boolean {
  const groups = new Map<number, AggregatorSnapshot[]>();
  for (const row of snapshots) {
    const key = row.observedAt.getTime();
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }
    const [first, ...rest] = group;
    if (!first) {
      continue;
    }
    for (const other of rest) {
      if (metricsDiffer(first, other)) {
        return true;
      }
    }
  }
  return false;
}

function metricsDiffer(a: AggregatorSnapshot, b: AggregatorSnapshot): boolean {
  const keys: Array<keyof AggregatorSnapshot> = [
    'views',
    'likes',
    'comments',
    'shares',
    'favorites',
    'averageWatchTimeSeconds',
    'completionRate',
    'newFollowers',
  ];
  return keys.some((key) => a[key] !== b[key]);
}
