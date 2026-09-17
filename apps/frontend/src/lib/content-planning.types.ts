export const PLANNING_DAYS_V1 = 7;
export const POSTS_PER_DAY_MIN = 1;
export const POSTS_PER_DAY_MAX = 5;
export const ADDITIONAL_REQUIREMENTS_MAX = 2000;
export const PLATFORM_MAX = 50;

export type ContentTopicRecord = {
  id?: string;
  dayIndex?: number;
  title?: string;
  hook?: string;
  contentPillar?: string;
  targetAudience?: string;
  painPoint?: string;
  contentAngle?: string;
  format?: string;
  estimatedDuration?: string;
  priority?: string;
  reason?: string;
  keywords?: string[];
  cta?: string;
  status?: string;
};

export type ContentPlanPayloadRecord = {
  title?: string;
  summary?: string;
  planningDays?: number;
  postsPerDay?: number;
  platform?: string;
  additionalRequirements?: string;
  topics?: ContentTopicRecord[];
};

export type ContentPlanRecord = {
  id: string;
  projectId?: string;
  title?: string;
  description?: string | null;
  status: string;
  version: number;
  payload?: unknown;
  planningDays?: number | null;
  postsPerDay?: number | null;
  platform?: string | null;
  createdAt: string;
};

export type PlanningFormState = {
  positioningRunId: string;
  strategyId: string;
  planningDays: number;
  postsPerDay: number;
  additionalRequirements: string;
  platform: string;
  ignoreAcceptedPerformanceFeedback: boolean;
};

export type TopicCardView = {
  id: string;
  dayIndex: number;
  title: string;
  contentAngle?: string;
  contentPillar?: string;
  targetAudience?: string;
  estimatedDuration?: string;
  hook?: string;
  reason?: string;
  priorityLabel?: string;
  cta?: string;
  statusLabel?: string;
  painPoint?: string;
  format?: string;
};

export type DayGroupView = {
  dayIndex: number;
  heading: string;
  topics: TopicCardView[];
};

export type ContentPlanView = {
  title: string;
  summary: string;
  days: number;
  postsPerDay: number;
  topicCount: number;
  statusLabel: string;
  dayGroups: DayGroupView[];
};

export type PlanHistoryItemView = {
  version: number;
  createdAtLabel: string;
  statusLabel: string;
  daysLabel: string;
  topicCountLabel: string;
  strategyLabel: string;
  readable: boolean;
};

export const PLANNING_RAW_CONTRACT_TERMS = [
  "ContentPlanningInput",
  "campaignStrategy",
  "PerformanceFeedback",
  "AgentRun",
  "sourceAgentRunId",
  "inputSnapshot",
] as const;
