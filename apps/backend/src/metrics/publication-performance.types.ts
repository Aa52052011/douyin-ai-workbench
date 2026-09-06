export const PERFORMANCE_WINDOWS = ['H24', 'D7', 'LIFETIME'] as const;

export type PerformanceWindow = (typeof PERFORMANCE_WINDOWS)[number];

export const DATA_QUALITY_FLAGS = [
  'NO_SNAPSHOTS',
  'SINGLE_SNAPSHOT_ONLY',
  'MIXED_SOURCES',
  'METRIC_DECREASE_DETECTED',
  'SAME_TIME_CONFLICT',
  'MISSING_VIEWS',
  'SPARSE_24H',
  'SPARSE_7D',
] as const;

export type DataQualityFlag = (typeof DATA_QUALITY_FLAGS)[number];

export const H24_MS = 24 * 60 * 60 * 1000;
export const D7_MS = 7 * H24_MS;
export const MS_PER_HOUR = 60 * 60 * 1000;

export const COUNT_METRIC_KEYS = ['views', 'likes', 'comments', 'shares', 'favorites', 'newFollowers'] as const;

export type CountMetricKey = (typeof COUNT_METRIC_KEYS)[number];
