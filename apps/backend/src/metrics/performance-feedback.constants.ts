import type { InsightCode } from './performance-insight.types.js';

export const PERFORMANCE_FEEDBACK_VERSION = 'v1' as const;

export const DEFAULT_FEEDBACK_PUBLICATION_LIMIT = 10;
export const MAX_FEEDBACK_PUBLICATION_LIMIT = 20;
export const REPEATED_SIGNAL_MIN_SUPPORT = 2;
export const MAX_POSITIVE_SIGNALS = 5;
export const MAX_CAUTION_SIGNALS = 5;
export const MAX_DATA_QUALITY_SIGNALS = 3;
export const MAX_PUBLICATION_IDS_PER_SIGNAL = 5;
export const MAX_REPRESENTATIVE_EVIDENCE = 2;
export const MAX_FEEDBACK_JSON_BYTES = 4096;

export const POSITIVE_INSIGHT_CODES = [
  'HIGH_LIKE_RATE',
  'HIGH_COMMENT_RATE',
  'HIGH_SHARE_RATE',
  'HIGH_FAVORITE_RATE',
  'HIGH_ENGAGEMENT_RATE',
  'STRONG_COMPLETION_RATE',
] as const satisfies readonly InsightCode[];

export const CAUTION_INSIGHT_CODES = [
  'LOW_LIKE_RATE',
  'LOW_ENGAGEMENT_RATE',
  'WEAK_COMPLETION_RATE',
] as const satisfies readonly InsightCode[];

export const DATA_QUALITY_INSIGHT_CODES = [
  'INSUFFICIENT_DATA',
  'MIXED_SOURCE_DATA',
  'METRIC_DECREASE_DETECTED',
  'SAME_TIME_CONFLICT',
] as const satisfies readonly InsightCode[];

export const CONFLICTING_INSIGHT_PAIRS: ReadonlyArray<readonly [InsightCode, InsightCode]> = [
  ['HIGH_LIKE_RATE', 'LOW_LIKE_RATE'],
  ['HIGH_ENGAGEMENT_RATE', 'LOW_ENGAGEMENT_RATE'],
  ['STRONG_COMPLETION_RATE', 'WEAK_COMPLETION_RATE'],
];

export const CONFIDENCE_RANK: Record<string, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};
