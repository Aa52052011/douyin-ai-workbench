import { randomUUID } from 'node:crypto';
import { ErrorCode } from '../../common/errors/app-error.js';
import { isUuid } from '../../common/ids.js';
import { AgentError } from '../agent.errors.js';
import {
  CONTENT_PLANNING_AGENT_ID,
  CONTENT_PLANNING_AGENT_VERSION,
  CONTENT_PLANNING_TIMEOUT_MS,
  CONTENT_PLAN_MAX_POSTS_PER_DAY,
  CONTENT_PLAN_V1_DAYS,
  type AgentDefinition,
} from '../agent.types.js';
import { validateAccountPositioningOutput } from './account-positioning.agent.js';
import type { AccountPositioningOutput } from './account-positioning.types.js';
import {
  CONTENT_PLAN_FORBIDDEN_KEYS,
  CONTENT_PLANNING_INPUT_KEYS,
  EMPTY_TREND_NOTE,
  type CampaignStrategyPlanningSnapshot,
  type ContentPlanOutput,
  type ContentPlanningInput,
  type ContentTopic,
  type PillarAllocation,
  type TrendDataSnapshot,
} from './content-planning.types.js';
import type { CompactPerformanceFeedback } from '../../metrics/performance-feedback.types.js';
import { FEEDBACK_DATA_STATES } from '../../metrics/performance-feedback.types.js';

const LIMITS = {
  platform: 50,
  contentStyle: 200,
  additionalRequirements: 2000,
} as const;

const PRIORITIES = new Set(['high', 'medium', 'low']);

export const contentPlanningDefinition: AgentDefinition = {
  id: CONTENT_PLANNING_AGENT_ID,
  name: '内容规划',
  version: CONTENT_PLANNING_AGENT_VERSION,
  description: '根据账号定位生成 7 天结构化内容规划。',
  capabilities: ['content-planning', 'structured-output'],
  timeoutMs: CONTENT_PLANNING_TIMEOUT_MS,
  defaultModel: process.env.MODEL_NAME?.trim() || undefined,
  temperature: 0.45,
  maxTokens: 6000,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['positioning', 'planningDays', 'postsPerDay', 'platform'],
    properties: {
      positioning: { type: 'object' },
      planningDays: { type: 'integer', const: 7 },
      postsPerDay: { type: 'integer', minimum: 1, maximum: 5 },
      platform: { type: 'string', minLength: 1, maxLength: 50 },
      contentStyle: { type: 'string', maxLength: 200 },
      additionalRequirements: { type: 'string', maxLength: 2000 },
      positioningRunId: { type: 'string', format: 'uuid' },
      strategyId: { type: 'string', format: 'uuid' },
      campaignStrategy: { type: 'object' },
      trendData: { type: 'object' },
      performanceFeedback: { type: 'object' },
    },
  },
  outputSchema: {
    type: 'object',
    required: [
      'title',
      'summary',
      'planningDays',
      'postsPerDay',
      'platform',
      'pillarAllocation',
      'usedTrendData',
      'trendNote',
      'topics',
    ],
  },
};

export function parseContentPlanningInput(input: unknown): ContentPlanningInput {
  if (!isRecord(input)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  for (const key of Object.keys(input)) {
    if ((CONTENT_PLAN_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    if (!(CONTENT_PLANNING_INPUT_KEYS as readonly string[]).includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
  }

  const planningDays = requireInt(input, 'planningDays');
  if (planningDays !== CONTENT_PLAN_V1_DAYS) {
    throw new AgentError(ErrorCode.CONTENT_PLAN_DAYS_NOT_AVAILABLE);
  }
  const postsPerDay = requireInt(input, 'postsPerDay');
  if (postsPerDay < 1 || postsPerDay > CONTENT_PLAN_MAX_POSTS_PER_DAY) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (!input.positioning) {
    throw new AgentError(ErrorCode.CONTENT_PLAN_POSITIONING_REQUIRED);
  }

  return {
    positioning: requirePositioning(input.positioning),
    planningDays,
    postsPerDay,
    platform: requiredString(input, 'platform', LIMITS.platform),
    contentStyle: optionalString(input, 'contentStyle', LIMITS.contentStyle),
    additionalRequirements: optionalString(
      input,
      'additionalRequirements',
      LIMITS.additionalRequirements,
    ),
    positioningRunId: optionalUuid(input, 'positioningRunId'),
    strategyId: optionalUuid(input, 'strategyId'),
    campaignStrategy: optionalCampaignStrategy(input.campaignStrategy),
    trendData: optionalTrendData(input.trendData),
    performanceFeedback: optionalPerformanceFeedback(input.performanceFeedback),
  };
}

export function requirePositioning(value: unknown): AccountPositioningOutput {
  try {
    return validateAccountPositioningOutput(value);
  } catch {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
}

export function validateContentPlanOutput(
  value: unknown,
  expected: { planningDays: number; postsPerDay: number; pillarNames: string[] },
): ContentPlanOutput {
  if (!isRecord(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const topics = requireTopics(value.topics, expected);
  const pillarAllocation = requireAllocation(value.pillarAllocation, topics.length, expected.pillarNames);
  const expectedCount = expected.planningDays * expected.postsPerDay;
  if (topics.length !== expectedCount || topics.length > 35) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }

  return {
    title: requireString(value, 'title'),
    summary: requireString(value, 'summary'),
    planningDays: expected.planningDays,
    postsPerDay: expected.postsPerDay,
    platform: requireString(value, 'platform'),
    contentStyle: optionalOutputString(value, 'contentStyle'),
    additionalRequirements: optionalOutputString(value, 'additionalRequirements'),
    pillarAllocation,
    usedTrendData: typeof value.usedTrendData === 'boolean' ? value.usedTrendData : false,
    trendNote: requireString(value, 'trendNote'),
    topics,
  };
}

export function finalizeContentPlanOutput(
  output: ContentPlanOutput,
  input: ContentPlanningInput,
  usedTrendData: boolean,
): ContentPlanOutput {
  return {
    ...output,
    planningDays: input.planningDays,
    postsPerDay: input.postsPerDay,
    platform: input.platform,
    contentStyle: input.contentStyle,
    additionalRequirements: input.additionalRequirements,
    usedTrendData,
    trendNote: usedTrendData ? output.trendNote : EMPTY_TREND_NOTE,
    topics: stampTopicIds(output.topics),
  };
}

export function stampTopicIds(topics: ContentTopic[]): ContentTopic[] {
  return topics.map((topic) => ({
    ...topic,
    id: randomUUID(),
    status: 'planned',
  }));
}

export function hasUsableTrendData(trendData?: TrendDataSnapshot): boolean {
  return Boolean(trendData && trendData.items.length > 0);
}

function requireTopics(
  value: unknown,
  expected: { planningDays: number; postsPerDay: number; pillarNames: string[] },
): ContentTopic[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const titles = new Set<string>();
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const dayIndex = item.dayIndex;
    if (
      typeof dayIndex !== 'number' ||
      !Number.isInteger(dayIndex) ||
      dayIndex < 1 ||
      dayIndex > expected.planningDays
    ) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const priority = item.priority;
    if (typeof priority !== 'string' || !PRIORITIES.has(priority)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const contentPillar = requireString(item, 'contentPillar');
    if (!expected.pillarNames.includes(contentPillar)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const title = requireString(item, 'title');
    if (titles.has(title)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    titles.add(title);
    const keywords = item.keywords;
    if (!Array.isArray(keywords) || !keywords.every((entry) => typeof entry === 'string')) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID(),
      dayIndex,
      title,
      hook: requireString(item, 'hook'),
      contentPillar,
      targetAudience: requireString(item, 'targetAudience'),
      painPoint: requireString(item, 'painPoint'),
      contentAngle: requireString(item, 'contentAngle'),
      format: requireString(item, 'format'),
      estimatedDuration: requireString(item, 'estimatedDuration'),
      priority: priority as ContentTopic['priority'],
      reason: requireString(item, 'reason'),
      keywords: keywords.map((entry) => entry.trim()).filter(Boolean),
      cta: requireString(item, 'cta'),
      status: 'planned',
      scheduledDate: optionalDate(item.scheduledDate),
    };
  });
}

function requireAllocation(
  value: unknown,
  topicCount: number,
  pillarNames: string[],
): PillarAllocation[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const rows = value.map((item) => {
    if (!isRecord(item)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const pillarName = requireString(item, 'pillarName');
    if (!pillarNames.includes(pillarName)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const percentage = item.percentage;
    const allocated = item.topicCount;
    if (typeof percentage !== 'number' || !Number.isFinite(percentage)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    if (typeof allocated !== 'number' || !Number.isInteger(allocated) || allocated < 0) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    return { pillarName, percentage, topicCount: allocated };
  });
  const sum = rows.reduce((acc, row) => acc + row.topicCount, 0);
  if (sum !== topicCount) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return rows;
}

function optionalCampaignStrategy(value: unknown): CampaignStrategyPlanningSnapshot | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  for (const key of Object.keys(value)) {
    if (['inputSnapshot', 'sourceAgentRunId', 'marketEvidence', 'marketInsight', 'snapshot'].includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
  }
  if (typeof value.id !== 'string' || !isUuid(value.id)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (typeof value.version !== 'number' || !Number.isInteger(value.version) || value.version < 1) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (value.status !== 'READY' && value.status !== 'CONFIRMED') {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (!isRecord(value.payload) || value.payload.version !== 'v1') {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if ('inputSnapshot' in value.payload || 'marketEvidence' in value.payload) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  return {
    id: value.id,
    version: value.version,
    status: value.status,
    payload: value.payload as CampaignStrategyPlanningSnapshot['payload'],
  };
}

function optionalTrendData(value: unknown): TrendDataSnapshot | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value) || typeof value.source !== 'string' || typeof value.capturedAt !== 'string') {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (!Array.isArray(value.items)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  return {
    source: value.source.trim(),
    capturedAt: value.capturedAt.trim(),
    items: value.items.map((item) => {
      if (!isRecord(item) || typeof item.keyword !== 'string' || !item.keyword.trim()) {
        throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
      }
      return {
        keyword: item.keyword.trim(),
        heat: typeof item.heat === 'number' ? item.heat : undefined,
        note: typeof item.note === 'string' ? item.note.trim() : undefined,
      };
    }),
  };
}

function optionalPerformanceFeedback(value: unknown): CompactPerformanceFeedback | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value) || value.version !== 'v1') {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (typeof value.generatedAt !== 'string' || !value.generatedAt.trim()) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (typeof value.dataState !== 'string' || !(FEEDBACK_DATA_STATES as readonly string[]).includes(value.dataState)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (typeof value.sampleSize !== 'number' || typeof value.publicationsConsidered !== 'number') {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (!isRecord(value.dataQuality)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (
    !Array.isArray(value.positiveSignals) ||
    !Array.isArray(value.cautionSignals) ||
    !Array.isArray(value.dataQualitySignals)
  ) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  return value as CompactPerformanceFeedback;
}

function requireInt(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  return value;
}

function requiredString(record: Record<string, unknown>, key: string, max: number): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  return trimmed;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  max: number,
): string | undefined {
  if (!(key in record) || record[key] === undefined || record[key] === null) {
    return undefined;
  }
  return requiredString(record, key, max);
}

function optionalUuid(record: Record<string, unknown>, key: string): string | undefined {
  if (!(key in record) || record[key] === undefined || record[key] === null) {
    return undefined;
  }
  if (typeof record[key] !== 'string' || !isUuid(record[key])) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  return record[key];
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return value.trim();
}

function optionalOutputString(record: Record<string, unknown>, key: string): string | undefined {
  if (!(key in record) || record[key] === undefined || record[key] === null) {
    return undefined;
  }
  return requireString(record, key);
}

function optionalDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
