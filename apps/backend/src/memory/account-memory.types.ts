/**
 * Step 13.5 — Account Content Memory types (deterministic, no LLM).
 */

export const ACCOUNT_MEMORY_PAYLOAD_VERSION = 'v1' as const;

export const MEMORY_RECENT_LIMITS = {
  scripts: 20,
  batches: 5,
  publications: 20,
  topics: 12,
  hooks: 10,
  angles: 10,
  ctas: 10,
  pillars: 8,
  batchSummaries: 5,
  winningPatterns: 5,
  losingPatterns: 5,
  candidateSignals: 8,
  performanceSignals: 10,
} as const;

export const PATTERN_CONFIRMED_MIN_SUPPORT = 2;

export type PatternDirection = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export type PatternType =
  | 'HOOK'
  | 'ANGLE'
  | 'TOPIC'
  | 'CTA'
  | 'CONTENT_PILLAR'
  | 'LENGTH'
  | 'PRODUCTION_STYLE'
  | 'PERFORMANCE_SIGNAL';

export type MemoryPattern = {
  patternType: PatternType;
  key: string;
  summary: string;
  supportCount: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  lastObservedAt: string;
  direction: PatternDirection;
};

export type MemoryCandidateSignal = {
  patternType: PatternType;
  key: string;
  summary: string;
  supportCount: 1;
  lastObservedAt: string;
  direction: PatternDirection;
};

export type AccountMemoryPayload = {
  core: {
    businessGoal?: string;
    goalCode?: string;
    productSummary?: string;
    industry?: string;
    targetAudience?: string;
    positioningSummary?: string;
    currentStrategySummary?: string;
    contentDirection?: string[];
  };
  contentHistory: {
    recentTopics: string[];
    recentTitles: string[];
    recentHooks: string[];
    recentAngles: string[];
    recentCtas: string[];
    recentContentPillars: string[];
    recentBatchSummaries: Array<{ planId: string; title: string; batchSize: number; confirmedAt?: string }>;
    publishedTopicIds: string[];
    confirmedScriptIds: string[];
  };
  performance: {
    dataState: string;
    sampleSize: number;
    recentPerformanceSignals: Array<{
      code: string;
      category: string;
      supportCount: number;
      confidence: string;
      direction: PatternDirection;
    }>;
    winningSignals: Array<{ code: string; supportCount: number; confidence: string }>;
    weakSignals: Array<{ code: string; supportCount: number; confidence: string }>;
    supportCountFloor: typeof PATTERN_CONFIRMED_MIN_SUPPORT;
    lastObservedAt?: string;
  };
  production: {
    recentProductionModes: string[];
    recentAssetTypes: string[];
    recentVideoDurations: number[];
    reusedAssetIds: string[];
  };
  patterns: {
    winningPatterns: MemoryPattern[];
    losingPatterns: MemoryPattern[];
    candidateSignals: MemoryCandidateSignal[];
  };
  recent: {
    currentBatchId?: string;
    currentTopicId?: string;
    currentStrategyId?: string;
    lastConfirmedScriptId?: string;
    currentProductionDirection?: string;
    unfinishedTopicIds: string[];
  };
  meta: {
    memoryVersion: typeof ACCOUNT_MEMORY_PAYLOAD_VERSION;
    builtAt: string;
    sourceCounts: Record<string, number>;
    lastPublicationAt?: string;
    lastMetricAt?: string;
    lastContentPlanAt?: string;
    confidenceSummary?: string;
    watermark: string;
  };
};

/** Compact view for Agent prompts — bounded. */
export type AccountMemoryContext = {
  primaryGoal?: string;
  goalCode?: string;
  positioning?: string;
  currentStrategy?: string;
  recentTopics: string[];
  recentHooks: string[];
  recentAngles: string[];
  recentCtas: string[];
  winningPatterns: Array<{ type: string; summary: string; supportCount: number }>;
  losingPatterns: Array<{ type: string; summary: string; supportCount: number }>;
  recentPerformanceSignals: Array<{ code: string; supportCount: number; direction: string }>;
  currentDirection?: string;
  currentBatchSummary?: string;
  overlapWarnings: string[];
};

export type MemoryRefreshTrigger =
  | 'PRODUCT_BRIEF_CONFIRMED'
  | 'STRATEGY_CONFIRMED'
  | 'CONTENT_PLAN_CONFIRMED'
  | 'SCRIPT_CONFIRMED'
  | 'VIDEO_FINALIZED'
  | 'METRICS_UPDATED'
  | 'MANUAL_REBUILD'
  | 'LAZY_BOOTSTRAP'
  | 'READ_STALE';

export type MemoryRefreshResult = {
  snapshotId: string;
  version: number;
  status: string;
  created: boolean;
  sourceWatermark: string;
  durationMs: number;
  trigger: MemoryRefreshTrigger;
};
