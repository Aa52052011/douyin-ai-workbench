import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import {
  ACCOUNT_POSITIONING_AGENT_ID,
  ACCOUNT_POSITIONING_AGENT_VERSION,
  DEFAULT_AGENT_TIMEOUT_MS,
  productionLlmTimeoutMs,
  type AgentDefinition,
} from '../agent.types.js';
import {
  ACCOUNT_POSITIONING_INPUT_KEYS,
  FORBIDDEN_CONTEXT_KEYS,
  type AccountPositioningInput,
  type AccountPositioningOutput,
} from './account-positioning.types.js';

const LIMITS = {
  industry: 100,
  platform: 50,
  accountType: 100,
  goal: 500,
  targetAudience: 500,
  expertise: 1000,
  additionalInfo: 2000,
} as const;

export const accountPositioningDefinition: AgentDefinition = {
  id: ACCOUNT_POSITIONING_AGENT_ID,
  name: '账号定位',
  version: ACCOUNT_POSITIONING_AGENT_VERSION,
  description: '根据账号基础信息生成结构化定位方案。',
  capabilities: ['account-positioning', 'structured-output'],
  timeoutMs: productionLlmTimeoutMs(DEFAULT_AGENT_TIMEOUT_MS),
  defaultModel: process.env.MODEL_NAME?.trim() || undefined,
  temperature: 0.4,
  maxTokens: 2500,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['industry', 'platform', 'accountType', 'goal'],
    properties: {
      industry: { type: 'string', minLength: 1, maxLength: 100 },
      platform: { type: 'string', minLength: 1, maxLength: 50 },
      accountType: { type: 'string', minLength: 1, maxLength: 100 },
      goal: { type: 'string', minLength: 1, maxLength: 500 },
      targetAudience: { type: 'string', maxLength: 500 },
      expertise: { type: 'string', maxLength: 1000 },
      additionalInfo: { type: 'string', maxLength: 2000 },
    },
  },
  outputSchema: {
    type: 'object',
    required: [
      'accountPositioning',
      'targetAudience',
      'userPainPoints',
      'contentNiches',
      'contentPillars',
      'differentiation',
      'persona',
      'profileBio',
      'contentFormats',
      'publishingStrategy',
      'initialContentDirections',
    ],
  },
};

export function parseAccountPositioningInput(input: unknown): AccountPositioningInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if ((FORBIDDEN_CONTEXT_KEYS as readonly string[]).includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    if (!(ACCOUNT_POSITIONING_INPUT_KEYS as readonly string[]).includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
  }

  return {
    industry: requiredString(record, 'industry', LIMITS.industry),
    platform: requiredString(record, 'platform', LIMITS.platform),
    accountType: requiredString(record, 'accountType', LIMITS.accountType),
    goal: requiredString(record, 'goal', LIMITS.goal),
    targetAudience: optionalString(record, 'targetAudience', LIMITS.targetAudience),
    expertise: optionalString(record, 'expertise', LIMITS.expertise),
    additionalInfo: optionalString(record, 'additionalInfo', LIMITS.additionalInfo),
  };
}

export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
      }
    }
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
}

export function validateAccountPositioningOutput(value: unknown): AccountPositioningOutput {
  if (!isRecord(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const targetAudience = value.targetAudience;
  if (!isRecord(targetAudience) || !isNonEmptyString(targetAudience.description)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const persona = value.persona;
  if (
    !isRecord(persona) ||
    !isNonEmptyString(persona.identity) ||
    !isNonEmptyString(persona.tone) ||
    !isStringArray(persona.characteristics)
  ) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const publishing = value.publishingStrategy;
  if (!isRecord(publishing) || !isNonEmptyString(publishing.frequency)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }

  const output: AccountPositioningOutput = {
    accountPositioning: requireString(value, 'accountPositioning'),
    targetAudience: {
      description: targetAudience.description,
      demographics: optionalRecordString(targetAudience, 'demographics'),
      interests: optionalStringArray(targetAudience, 'interests'),
      painPoints: optionalStringArray(targetAudience, 'painPoints'),
    },
    userPainPoints: requireStringArray(value, 'userPainPoints'),
    contentNiches: requireNamedList(value.contentNiches, ['name', 'reason']) as Array<{
      name: string;
      reason: string;
    }>,
    contentPillars: requirePillars(value.contentPillars),
    differentiation: requireStringArray(value, 'differentiation'),
    persona: {
      identity: persona.identity,
      tone: persona.tone,
      characteristics: persona.characteristics,
    },
    profileBio: requireString(value, 'profileBio'),
    contentFormats: requireStringArray(value, 'contentFormats'),
    publishingStrategy: {
      frequency: publishing.frequency,
      recommendedLength: optionalRecordString(publishing, 'recommendedLength'),
      recommendedStyle: optionalRecordString(publishing, 'recommendedStyle'),
    },
    initialContentDirections: requireNamedList(value.initialContentDirections, [
      'title',
      'description',
      'reason',
    ]) as Array<{ title: string; description: string; reason: string }>,
  };
  return output;
}

function requiredString(
  record: Record<string, unknown>,
  key: keyof typeof LIMITS,
  max: number,
): string {
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
  key: keyof typeof LIMITS,
  max: number,
): string | undefined {
  if (!(key in record) || record[key] === undefined || record[key] === null) {
    return undefined;
  }
  return requiredString(record, key, max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (!isNonEmptyString(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return value.trim();
}

function requireStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!isStringArray(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return value.map((item) => item.trim());
}

function optionalRecordString(record: Record<string, unknown>, key: string): string | undefined {
  if (!(key in record) || record[key] === undefined || record[key] === null) {
    return undefined;
  }
  if (!isNonEmptyString(record[key])) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return record[key].trim();
}

function optionalStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  if (!(key in record) || record[key] === undefined || record[key] === null) {
    return undefined;
  }
  if (!isStringArray(record[key])) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return record[key].map((item) => item.trim());
}

function requireNamedList(value: unknown, keys: string[]): Array<Record<string, string>> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const row: Record<string, string> = {};
    for (const key of keys) {
      if (!isNonEmptyString(item[key])) {
        throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
      }
      row[key] = item[key].trim();
    }
    return row;
  });
}

function requirePillars(
  value: unknown,
): Array<{ name: string; description: string; percentage?: number }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return value.map((item) => {
    if (!isRecord(item) || !isNonEmptyString(item.name) || !isNonEmptyString(item.description)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const percentage = item.percentage;
    if (
      percentage !== undefined &&
      percentage !== null &&
      (typeof percentage !== 'number' || !Number.isFinite(percentage))
    ) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    return {
      name: item.name.trim(),
      description: item.description.trim(),
      percentage: typeof percentage === 'number' ? percentage : undefined,
    };
  });
}
