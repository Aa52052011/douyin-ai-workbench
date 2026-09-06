export const MANUAL_METRICS_PROVIDER = 'MANUAL';

export const MANUAL_COLLECTION_KEY_PREFIX = 'manual:';

export const MANUAL_METRICS_DEFAULT_LIMIT = 50;

export const MANUAL_METRICS_MAX_LIMIT = 200;

export const OBSERVED_AT_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Existing row treated as omitted observedAt when |observedAt - createdAt| is within this window. */
export const SERVER_NOW_EQ_MS = 2000;

export const SERVER_NOW_SENTINEL = 'SERVER_NOW';

export const PG_INT_MAX = 2_147_483_647;

export const METRIC_FIELD_KEYS = [
  'views',
  'likes',
  'comments',
  'shares',
  'favorites',
  'averageWatchTimeSeconds',
  'completionRate',
  'newFollowers',
] as const;

export type MetricFieldKey = (typeof METRIC_FIELD_KEYS)[number];
