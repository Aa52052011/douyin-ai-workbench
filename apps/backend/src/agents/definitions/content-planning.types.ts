import type { CampaignStrategyOutputV1 } from '../../campaign/campaign-strategy.types.js';
import type { AccountPositioningOutput } from './account-positioning.types.js';
import { FORBIDDEN_CONTEXT_KEYS } from './account-positioning.types.js';
import type { CompactPerformanceFeedback } from '../../metrics/performance-feedback.types.js';

export type TrendDataSnapshot = {
  source: string;
  capturedAt: string;
  items: Array<{
    keyword: string;
    heat?: number;
    note?: string;
  }>;
};

export type CampaignStrategyPlanningSnapshot = {
  id: string;
  version: number;
  status: 'READY' | 'CONFIRMED';
  payload: CampaignStrategyOutputV1;
};

export type ContentPlanningInput = {
  positioning: AccountPositioningOutput;
  planningDays: number;
  postsPerDay: number;
  platform: string;
  contentStyle?: string;
  additionalRequirements?: string;
  positioningRunId?: string;
  strategyId?: string;
  campaignStrategy?: CampaignStrategyPlanningSnapshot;
  trendData?: TrendDataSnapshot;
  performanceFeedback?: CompactPerformanceFeedback;
  learningContext?: {
    confirmed: Array<{ key: string; summary: string; supportCount: number; status: string }>;
    candidate: Array<{ key: string; summary: string; supportCount: number; status: string }>;
    latestRecommendations?: Array<{ actionLabel: string; rationale: string }>;
    previousBatchSummary?: {
      planId?: string;
      title?: string | null;
      sampleSize: number;
      publicationsConsidered: number;
    };
  };
  nextContentPlanningFeedback?: {
    schemaVersion: 'next.content-planning-feedback:v1';
    approvedRecommendations: unknown[];
    sourceAnalysisId: string;
    sourcePublishedPostId: string;
    feedbackCycleId: string;
  };
};

export type ContentTopic = {
  id: string;
  dayIndex: number;
  title: string;
  hook: string;
  contentPillar: string;
  targetAudience: string;
  painPoint: string;
  contentAngle: string;
  format: string;
  estimatedDuration: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  keywords: string[];
  cta: string;
  status: 'planned';
  scheduledDate?: string;
};

export type PillarAllocation = {
  pillarName: string;
  percentage: number;
  topicCount: number;
};

export type ContentPlanOutput = {
  title: string;
  summary: string;
  planningDays: number;
  postsPerDay: number;
  platform: string;
  contentStyle?: string;
  additionalRequirements?: string;
  pillarAllocation: PillarAllocation[];
  usedTrendData: boolean;
  trendNote: string;
  topics: ContentTopic[];
};

export const CONTENT_PLANNING_INPUT_KEYS = [
  'positioning',
  'planningDays',
  'postsPerDay',
  'platform',
  'contentStyle',
  'additionalRequirements',
  'positioningRunId',
  'strategyId',
  'campaignStrategy',
  'trendData',
  'performanceFeedback',
  'learningContext',
  'nextContentPlanningFeedback',
] as const;

export const CONTENT_PLAN_FORBIDDEN_KEYS = FORBIDDEN_CONTEXT_KEYS;

export const EMPTY_TREND_NOTE = '未使用实时趋势数据';
