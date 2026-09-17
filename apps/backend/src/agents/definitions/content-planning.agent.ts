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
  productionLlmTimeoutMs,
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
const PRIORITY_ALIASES: Record<string, 'high' | 'medium' | 'low'> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
  高: 'high',
  中: 'medium',
  低: 'low',
};

export function canonicalizePillarName(raw: unknown, allowed: string[]): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (allowed.includes(trimmed)) {
    return trimmed;
  }
  if (trimmed.length < 2) {
    return null;
  }
  const matches = allowed.filter((name) => name.includes(trimmed) || trimmed.includes(name));
  return matches.length === 1 ? matches[0]! : null;
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) < 1e-9) {
      return rounded;
    }
    return null;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim());
    if (!Number.isFinite(n)) {
      return null;
    }
    const rounded = Math.round(n);
    return Math.abs(n - rounded) < 1e-9 ? rounded : null;
  }
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value.trim()))) {
    return Number(value.trim());
  }
  return null;
}

function coerceKeywords(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? entry : entry == null ? '' : String(entry)));
  }
  if (typeof value === 'string') {
    return value
      .split(/[,，、]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (value === undefined || value === null) {
    return [];
  }
  return value;
}

function coerceTextField(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean)
      .join('；');
    return joined || null;
  }
  if (isRecord(value) && typeof value.description === 'string' && value.description.trim()) {
    return value.description.trim();
  }
  return null;
}

function coerceScheduledDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1];
}

export function normalizeContentPlanModelJson(value: unknown, pillarNames: string[]): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const next: Record<string, unknown> = { ...value };
  const title = coerceTextField(next.title);
  const summary = coerceTextField(next.summary);
  const platform = coerceTextField(next.platform);
  if (title) {
    next.title = title;
  }
  if (summary) {
    next.summary = summary;
  }
  if (platform) {
    next.platform = platform;
  }
  next.trendNote = coerceTextField(next.trendNote) ?? EMPTY_TREND_NOTE;
  if (next.contentStyle !== undefined && next.contentStyle !== null) {
    const style = coerceTextField(next.contentStyle);
    if (style) {
      next.contentStyle = style;
    } else {
      delete next.contentStyle;
    }
  }
  if (next.additionalRequirements !== undefined && next.additionalRequirements !== null) {
    const extra = coerceTextField(next.additionalRequirements);
    if (extra) {
      next.additionalRequirements = extra;
    } else {
      delete next.additionalRequirements;
    }
  }
  if (next.usedTrendData === 'true' || next.usedTrendData === 1) {
    next.usedTrendData = true;
  } else if (next.usedTrendData === 'false' || next.usedTrendData === 0) {
    next.usedTrendData = false;
  }
  if (Array.isArray(next.pillarAllocation)) {
    next.pillarAllocation = next.pillarAllocation.map((row) => {
      if (!isRecord(row)) {
        return row;
      }
      const pillarName = canonicalizePillarName(row.pillarName, pillarNames) ?? row.pillarName;
      return {
        ...row,
        pillarName,
        percentage: asFiniteNumber(row.percentage) ?? row.percentage,
        topicCount: asInt(row.topicCount) ?? row.topicCount,
      };
    });
  }
  if (Array.isArray(next.topics)) {
    next.topics = next.topics.map((item) => {
      if (!isRecord(item)) {
        return item;
      }
      const priorityKey = typeof item.priority === 'string' ? item.priority.trim() : '';
      const keywords = coerceKeywords(item.keywords);
      const estimatedDuration =
        typeof item.estimatedDuration === 'number' && Number.isFinite(item.estimatedDuration)
          ? `${item.estimatedDuration}`
          : item.estimatedDuration;
      const targetAudience = coerceTextField(item.targetAudience);
      const painPoint = coerceTextField(item.painPoint);
      const contentAngle = coerceTextField(item.contentAngle);
      const format = coerceTextField(item.format);
      const hook = coerceTextField(item.hook);
      const reason = coerceTextField(item.reason);
      const cta = coerceTextField(item.cta);
      const title = coerceTextField(item.title);
      return {
        ...item,
        title: title ?? item.title,
        hook: hook ?? item.hook,
        dayIndex: asInt(item.dayIndex) ?? item.dayIndex,
        priority: PRIORITY_ALIASES[priorityKey] ?? PRIORITY_ALIASES[priorityKey.toLowerCase()] ?? item.priority,
        contentPillar: canonicalizePillarName(item.contentPillar, pillarNames) ?? item.contentPillar,
        keywords,
        estimatedDuration,
        targetAudience: targetAudience ?? item.targetAudience,
        painPoint: painPoint ?? item.painPoint,
        contentAngle: contentAngle ?? item.contentAngle,
        format: format ?? item.format,
        reason: reason ?? item.reason,
        cta: cta ?? item.cta,
        scheduledDate: coerceScheduledDate(item.scheduledDate),
      };
    });
  }
  return next;
}

export function diagnoseContentPlanOutput(
  value: unknown,
  expected: { planningDays: number; postsPerDay: number; pillarNames: string[] },
): string {
  if (!isRecord(value)) {
    return 'NOT_OBJECT';
  }
  const required = [
    'title',
    'summary',
    'planningDays',
    'postsPerDay',
    'platform',
    'pillarAllocation',
    'usedTrendData',
    'trendNote',
    'topics',
  ];
  for (const key of required) {
    if (!(key in value)) {
      return `MISSING_FIELD:${key}`;
    }
  }
  if (!Array.isArray(value.topics)) {
    return 'TOPICS_NOT_ARRAY';
  }
  const expectedCount = expected.planningDays * expected.postsPerDay;
  if (value.topics.length !== expectedCount) {
    return `TOPIC_COUNT:${value.topics.length}!=${expectedCount}`;
  }
  if (!Array.isArray(value.pillarAllocation)) {
    return 'ALLOCATION_NOT_ARRAY';
  }
  try {
    validateContentPlanOutput(value, expected);
    return 'OK';
  } catch {
    return diagnoseNormalizedContentPlan(normalizeContentPlanModelJson(value, expected.pillarNames), expected);
  }
}

function diagnoseNormalizedContentPlan(
  value: unknown,
  expected: { planningDays: number; postsPerDay: number; pillarNames: string[] },
): string {
  if (!isRecord(value) || !Array.isArray(value.topics) || !Array.isArray(value.pillarAllocation)) {
    return 'SCHEMA_FIELD_INVALID';
  }
  for (const key of ['title', 'summary', 'platform', 'trendNote']) {
    if (typeof value[key] !== 'string' || !String(value[key]).trim()) {
      return `ROOT:${key}:${value[key] === undefined ? 'missing' : typeof value[key]}`;
    }
  }
  if (
    'contentStyle' in value &&
    value.contentStyle != null &&
    (typeof value.contentStyle !== 'string' || !String(value.contentStyle).trim())
  ) {
    return 'ROOT:contentStyle';
  }
  if (
    'additionalRequirements' in value &&
    value.additionalRequirements != null &&
    (typeof value.additionalRequirements !== 'string' || !String(value.additionalRequirements).trim())
  ) {
    return 'ROOT:additionalRequirements';
  }
  const stringKeys = [
    'title',
    'hook',
    'contentPillar',
    'targetAudience',
    'painPoint',
    'contentAngle',
    'format',
    'estimatedDuration',
    'reason',
    'cta',
  ];
  for (const [index, item] of value.topics.entries()) {
    if (!isRecord(item)) {
      return `TOPIC:${index}:NOT_OBJECT`;
    }
    const dayIndex = item.dayIndex;
    if (typeof dayIndex !== 'number' || !Number.isInteger(dayIndex) || dayIndex < 1 || dayIndex > expected.planningDays) {
      return `TOPIC:${index}:dayIndex:${typeof dayIndex}`;
    }
    if (typeof item.priority !== 'string' || !PRIORITIES.has(item.priority)) {
      return `TOPIC:${index}:priority`;
    }
    if (typeof item.contentPillar !== 'string' || !expected.pillarNames.includes(item.contentPillar)) {
      return `TOPIC:${index}:PILLAR_NAME_MISMATCH`;
    }
    for (const key of stringKeys) {
      if (typeof item[key] !== 'string' || !String(item[key]).trim()) {
        return `TOPIC:${index}:${key}:${item[key] === undefined ? 'missing' : typeof item[key]}`;
      }
    }
    if (!Array.isArray(item.keywords) || !item.keywords.every((entry) => typeof entry === 'string')) {
      return `TOPIC:${index}:keywords:${Array.isArray(item.keywords) ? 'mixed' : typeof item.keywords}`;
    }
    if (item.scheduledDate !== undefined && item.scheduledDate !== null && item.scheduledDate !== '') {
      if (typeof item.scheduledDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.scheduledDate)) {
        return `TOPIC:${index}:scheduledDate`;
      }
    }
  }
  for (const [index, row] of value.pillarAllocation.entries()) {
    if (!isRecord(row)) {
      return `ALLOCATION:${index}:NOT_OBJECT`;
    }
    if (typeof row.pillarName !== 'string' || !expected.pillarNames.includes(row.pillarName)) {
      return `ALLOCATION:${index}:PILLAR_NAME_MISMATCH`;
    }
    if (typeof row.percentage !== 'number' || !Number.isFinite(row.percentage)) {
      return `ALLOCATION:${index}:percentage:${typeof row.percentage}`;
    }
    if (typeof row.topicCount !== 'number' || !Number.isInteger(row.topicCount) || row.topicCount < 0) {
      return `ALLOCATION:${index}:topicCount:${typeof row.topicCount}`;
    }
  }
  const allocated = value.pillarAllocation
    .filter(isRecord)
    .reduce((sum, row) => sum + (typeof row.topicCount === 'number' ? row.topicCount : 0), 0);
  if (allocated !== value.topics.length) {
    return `ALLOCATION_SUM:${allocated}!=${value.topics.length}`;
  }
  const titles = value.topics.filter(isRecord).map((item) => item.title);
  if (new Set(titles).size !== titles.length) {
    return 'TOPIC_TITLE_DUPLICATE';
  }
  return 'SCHEMA_FIELD_INVALID';
}

export const contentPlanningDefinition: AgentDefinition = {
  id: CONTENT_PLANNING_AGENT_ID,
  name: '内容规划',
  version: CONTENT_PLANNING_AGENT_VERSION,
  description: '根据账号定位生成 7 天结构化内容规划。',
  capabilities: ['content-planning', 'structured-output'],
  timeoutMs: productionLlmTimeoutMs(CONTENT_PLANNING_TIMEOUT_MS),
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
      acceptedPerformanceFeedback: { type: 'array' },
      learningContext: { type: 'object' },
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
    acceptedPerformanceFeedback: optionalAcceptedPerformanceFeedback(input.acceptedPerformanceFeedback),
    learningContext: optionalLearningContext(input.learningContext),
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
  value = normalizeContentPlanModelJson(value, expected.pillarNames);
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

function optionalAcceptedPerformanceFeedback(
  value: unknown,
): ContentPlanningInput['acceptedPerformanceFeedback'] {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  return value.map((item) => {
    if (!isRecord(item) || typeof item.recommendedAction !== 'string' || typeof item.category !== 'string') {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    return {
      recommendationId: typeof item.recommendationId === 'string' ? item.recommendationId : undefined,
      category: item.category,
      recommendedAction: item.recommendedAction,
      supportingEvidence: Array.isArray(item.supportingEvidence)
        ? item.supportingEvidence.filter((row): row is string => typeof row === 'string')
        : [],
      sourcePublicationId: typeof item.sourcePublicationId === 'string' ? item.sourcePublicationId : '',
      sourceAnalysisId: typeof item.sourceAnalysisId === 'string' ? item.sourceAnalysisId : '',
      reviewedAt: typeof item.reviewedAt === 'string' ? item.reviewedAt : null,
    };
  });
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

function optionalLearningContext(value: unknown): ContentPlanningInput['learningContext'] {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  const compact = (rows: unknown) =>
    Array.isArray(rows)
      ? rows
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .slice(0, 20)
          .map((item) => ({
            key: String(item.key ?? ''),
            summary: String(item.summary ?? ''),
            supportCount: typeof item.supportCount === 'number' ? item.supportCount : 0,
            status: String(item.status ?? 'candidate'),
          }))
      : [];
  return {
    confirmed: compact(value.confirmed),
    candidate: compact(value.candidate),
    ...(Array.isArray(value.latestRecommendations)
      ? {
          latestRecommendations: value.latestRecommendations
            .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
            .slice(0, 8)
            .map((item) => ({
              actionLabel: String(item.actionLabel ?? item.action ?? ''),
              rationale: String(item.rationale ?? ''),
            })),
        }
      : {}),
    ...(value.previousBatchSummary && typeof value.previousBatchSummary === 'object'
      ? {
          previousBatchSummary: {
            planId:
              typeof (value.previousBatchSummary as Record<string, unknown>).planId === 'string'
                ? ((value.previousBatchSummary as Record<string, unknown>).planId as string)
                : undefined,
            title:
              typeof (value.previousBatchSummary as Record<string, unknown>).title === 'string'
                ? ((value.previousBatchSummary as Record<string, unknown>).title as string)
                : null,
            sampleSize:
              typeof (value.previousBatchSummary as Record<string, unknown>).sampleSize === 'number'
                ? ((value.previousBatchSummary as Record<string, unknown>).sampleSize as number)
                : 0,
            publicationsConsidered:
              typeof (value.previousBatchSummary as Record<string, unknown>).publicationsConsidered === 'number'
                ? ((value.previousBatchSummary as Record<string, unknown>).publicationsConsidered as number)
                : 0,
          },
        }
      : {}),
  };
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
  return coerceScheduledDate(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
