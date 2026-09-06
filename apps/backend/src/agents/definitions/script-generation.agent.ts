import { ErrorCode } from '../../common/errors/app-error.js';
import { isUuid } from '../../common/ids.js';
import { AgentError } from '../agent.errors.js';
import {
  DEFAULT_AGENT_TIMEOUT_MS,
  SCRIPT_GENERATION_AGENT_ID,
  SCRIPT_GENERATION_AGENT_VERSION,
  type AgentDefinition,
} from '../agent.types.js';
import { validateAccountPositioningOutput } from './account-positioning.agent.js';
import type { ContentTopic } from './content-planning.types.js';
import {
  SCRIPT_FORBIDDEN_KEYS,
  SCRIPT_GENERATION_INPUT_KEYS,
  SCRIPT_TARGET_DURATION_VALUES,
  type ScriptGenerationInput,
  type ScriptOutput,
  type ScriptSection,
  type ScriptTargetDuration,
} from './script-generation.types.js';

const LIMITS = {
  platform: 50,
  contentStyle: 200,
  planTitle: 200,
  requirements: 2000,
} as const;

export const scriptGenerationDefinition: AgentDefinition = {
  id: SCRIPT_GENERATION_AGENT_ID,
  name: '脚本生成',
  version: SCRIPT_GENERATION_AGENT_VERSION,
  description: '根据已确认的内容规划 Topic 生成结构化短视频脚本。',
  capabilities: ['script-generation', 'content-creation', 'structured-output'],
  timeoutMs: DEFAULT_AGENT_TIMEOUT_MS,
  defaultModel: process.env.MODEL_NAME?.trim() || undefined,
  temperature: 0.4,
  maxTokens: 3500,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['contentPlanId', 'topicId', 'topic', 'positioning', 'platform', 'targetDuration'],
    properties: {
      contentPlanId: { type: 'string', format: 'uuid' },
      topicId: { type: 'string', format: 'uuid' },
      topic: { type: 'object' },
      positioning: { type: 'object' },
      platform: { type: 'string', minLength: 1, maxLength: 50 },
      contentStyle: { type: 'string', maxLength: 200 },
      planTitle: { type: 'string', maxLength: 200 },
      targetDuration: { type: 'integer', enum: [...SCRIPT_TARGET_DURATION_VALUES] },
      requirements: { type: 'string', maxLength: 2000 },
    },
  },
  outputSchema: {
    type: 'object',
    required: [
      'title',
      'hook',
      'opening',
      'sections',
      'ending',
      'cta',
      'totalDuration',
      'estimatedWordCount',
      'voiceStyle',
      'visualStyle',
      'productionNotes',
    ],
  },
};

export function parseScriptGenerationInput(input: unknown): ScriptGenerationInput {
  if (!isRecord(input)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  for (const key of Object.keys(input)) {
    if ((SCRIPT_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    if (!(SCRIPT_GENERATION_INPUT_KEYS as readonly string[]).includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
  }
  const contentPlanId = requireUuid(input, 'contentPlanId');
  const topicId = requireUuid(input, 'topicId');
  const topic = requireTopic(input.topic);
  if (topic.id !== topicId) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  const targetDuration = requireDuration(input.targetDuration);
  try {
    return {
      contentPlanId,
      topicId,
      topic,
      positioning: validateAccountPositioningOutput(input.positioning),
      platform: requiredString(input, 'platform', LIMITS.platform),
      contentStyle: optionalString(input, 'contentStyle', LIMITS.contentStyle),
      planTitle: optionalString(input, 'planTitle', LIMITS.planTitle),
      targetDuration,
      requirements: optionalString(input, 'requirements', LIMITS.requirements),
    };
  } catch (error) {
    if (error instanceof AgentError && error.code === ErrorCode.AGENT_INVALID_OUTPUT) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    throw error;
  }
}

export function parseTargetDuration(value: unknown, fallbackFromTopic?: string): ScriptTargetDuration {
  if (value === undefined || value === null || value === '') {
    return parseDurationHint(fallbackFromTopic) ?? 30;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new AgentError(ErrorCode.SCRIPT_DURATION_NOT_AVAILABLE);
  }
  if (!(SCRIPT_TARGET_DURATION_VALUES as readonly number[]).includes(value)) {
    throw new AgentError(ErrorCode.SCRIPT_DURATION_NOT_AVAILABLE);
  }
  return value as ScriptTargetDuration;
}

export function validateScriptOutput(
  value: unknown,
  targetDuration: ScriptTargetDuration,
): ScriptOutput {
  if (!isRecord(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const sections = requireSections(value.sections);
  const totalDuration = requireInt(value, 'totalDuration');
  const sectionSum = sections.reduce((sum, item) => sum + item.duration, 0);
  if (totalDuration !== sectionSum) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (Math.abs(totalDuration - targetDuration) > 5) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const hook = requireString(value, 'hook');
  const opening = requireString(value, 'opening');
  const ending = requireString(value, 'ending');
  const cta = requireString(value, 'cta');
  const narration = [hook, opening, ...sections.map((item) => item.narration), ending, cta].join('');
  const actual = countWords(narration);
  if (actual === 0) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const estimatedWordCount = actual;
  const notes = value.productionNotes;
  if (!Array.isArray(notes) || notes.length === 0 || !notes.every((item) => isNonEmptyString(item))) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return {
    title: requireString(value, 'title'),
    hook,
    opening,
    sections,
    ending,
    cta,
    totalDuration,
    estimatedWordCount,
    voiceStyle: requireString(value, 'voiceStyle'),
    visualStyle: requireString(value, 'visualStyle'),
    productionNotes: notes.map((item) => item.trim()),
  };
}

export function concatNarration(output: ScriptOutput): string {
  return [output.hook, output.opening, ...output.sections.map((item) => item.narration), output.ending, output.cta]
    .join('\n');
}

function requireDuration(value: unknown): ScriptTargetDuration {
  return parseTargetDuration(value);
}

function parseDurationHint(hint?: string): ScriptTargetDuration | undefined {
  if (!hint) {
    return undefined;
  }
  const match = hint.match(/(\d{2})/);
  if (!match) {
    return undefined;
  }
  const parsed = Number.parseInt(match[1], 10);
  if ((SCRIPT_TARGET_DURATION_VALUES as readonly number[]).includes(parsed)) {
    return parsed as ScriptTargetDuration;
  }
  return undefined;
}

function requireTopic(value: unknown): ContentTopic {
  if (!isRecord(value) || !isUuid(String(value.id ?? '')) || !isNonEmptyString(value.title)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  return {
    id: String(value.id),
    dayIndex: typeof value.dayIndex === 'number' ? value.dayIndex : 1,
    title: String(value.title).trim(),
    hook: requiredTopicString(value, 'hook'),
    contentPillar: requiredTopicString(value, 'contentPillar'),
    targetAudience: requiredTopicString(value, 'targetAudience'),
    painPoint: requiredTopicString(value, 'painPoint'),
    contentAngle: requiredTopicString(value, 'contentAngle'),
    format: requiredTopicString(value, 'format'),
    estimatedDuration: requiredTopicString(value, 'estimatedDuration'),
    priority: value.priority === 'high' || value.priority === 'low' ? value.priority : 'medium',
    reason: requiredTopicString(value, 'reason'),
    keywords: Array.isArray(value.keywords)
      ? value.keywords.filter((item): item is string => typeof item === 'string')
      : [],
    cta: requiredTopicString(value, 'cta'),
    status: 'planned',
    scheduledDate: typeof value.scheduledDate === 'string' ? value.scheduledDate : undefined,
  };
}

function requiredTopicString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (!isNonEmptyString(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  return value.trim();
}

function requireSections(value: unknown): ScriptSection[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const sequence = item.sequence;
    if (typeof sequence !== 'number' || sequence !== index + 1) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const duration = item.duration;
    if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 1) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    return {
      sequence,
      narration: requireString(item, 'narration'),
      visualSuggestion: requireString(item, 'visualSuggestion'),
      subtitle: requireString(item, 'subtitle'),
      duration,
    };
  });
}

function requireUuid(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !isUuid(value)) {
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

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (!isNonEmptyString(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return value.trim();
}

function requireInt(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function countWords(text: string): number {
  return text.replace(/\s+/g, '').length;
}
