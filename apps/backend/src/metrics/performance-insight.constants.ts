/**
 * Product V1 heuristic thresholds. Not Douyin / industry / account baselines.
 * Changing values requires a new rulesVersion (v2+); do not silently retcon v1.
 */
export const PERFORMANCE_INSIGHT_RULES_VERSION = 'v1' as const;

export const PERFORMANCE_INSIGHT_RULES_V1 = {
  rulesVersion: PERFORMANCE_INSIGHT_RULES_VERSION,
  minViewsForRateInsight: 100,
  minViewsForRetentionInsight: 100,
  minObservationCoverageForSufficient: 0.5,
  minObservationCoverageForRetention: 0.5,
  likeRateHigh: 0.05,
  likeRateLow: 0.01,
  commentRateHigh: 0.01,
  shareRateHigh: 0.02,
  favoriteRateHigh: 0.02,
  engagementRateHigh: 0.08,
  engagementRateLow: 0.02,
  completionRateStrong: 0.6,
  completionRateWeak: 0.25,
} as const;

export type PerformanceInsightRulesV1 = typeof PERFORMANCE_INSIGHT_RULES_V1;

export const INSIGHT_CATEGORY_ORDER: Record<string, number> = {
  DATA_QUALITY: 0,
  RETENTION: 1,
  ENGAGEMENT: 2,
  GROWTH: 3,
  REACH: 4,
};

export const INSIGHT_WINDOW_PRIORITY = ['H24', 'D7', 'LIFETIME'] as const;
