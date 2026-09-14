import { AgentError } from '../agent.errors.js';
import {
  DEFAULT_AGENT_TIMEOUT_MS,
  MARKET_INTAKE_AGENT_ID,
  MARKET_INTAKE_AGENT_VERSION,
  MARKET_INTAKE_TIMEOUT_MS,
  type AgentDefinition,
} from '../agent.types.js';
import { ErrorCode } from '../../common/errors/app-error.js';
import {
  applyDeterministicMarketReadiness,
  getMarketIntakeReadinessFromDraft,
  mergeMarketIntakeDraft,
  sanitizeMarketIntakeDraftPatch,
  sanitizeMarketIntakeSuggestions,
  sanitizeMarketIntakeUserDraft,
} from './market-intake.patch.js';
import {
  MARKET_INTAKE_LIMITS,
  type MarketIntakeAgentInput,
  type MarketIntakeAgentOutput,
  type MarketIntakeConversationMessage,
  type MarketIntakeDraft,
  type MarketIntakeProductBriefContext,
} from './market-intake.types.js';
import { parseModelJson } from './account-positioning.agent.js';

const FORBIDDEN_INPUT_KEYS = new Set([
  'tenantId',
  'workspaceId',
  'userId',
  'jwt',
  'accessToken',
  'refreshToken',
  'authorization',
  'apiKey',
  'MODEL_API_KEY',
  'password',
  'cookie',
]);

export const marketIntakeDefinition: AgentDefinition = {
  id: MARKET_INTAKE_AGENT_ID,
  name: 'Market Intake',
  version: MARKET_INTAKE_AGENT_VERSION,
  description:
    'Guided conversation that collects market research materials into a draft. Does not write MarketResearch, MarketInsight, or run Market Intelligence.',
  capabilities: ['market-intake', 'draft-patch'],
  timeoutMs: MARKET_INTAKE_TIMEOUT_MS || DEFAULT_AGENT_TIMEOUT_MS,
  temperature: 0.3,
  maxTokens: 1400,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'mode',
      'confirmedProductBrief',
      'currentDraft',
      'recentConversation',
      'latestUserMessage',
      'locale',
      'noDataAllowed',
    ],
    properties: {
      mode: { const: 'market' },
      confirmedProductBrief: { type: 'object' },
      currentDraft: { type: 'object' },
      recentConversation: { type: 'array' },
      latestUserMessage: { type: 'string' },
      locale: { type: 'string' },
      noDataAllowed: { const: true },
      improvingExisting: { type: 'boolean' },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['message', 'draftPatch', 'missingAreas', 'suggestions', 'readyForConfirmation'],
    properties: {
      message: { type: 'string' },
      draftPatch: { type: 'object' },
      missingAreas: { type: 'array', items: { type: 'string' } },
      suggestions: { type: 'array' },
      readyForConfirmation: { type: 'boolean' },
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseConversation(raw: unknown): MarketIntakeConversationMessage[] {
  if (!Array.isArray(raw)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (raw.length > MARKET_INTAKE_LIMITS.conversationMessages) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  return raw.map((item) => {
    if (!isRecord(item)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    const role = item.role;
    const content = item.content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > MARKET_INTAKE_LIMITS.conversationContent) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    return { role, content: trimmed };
  });
}

function parseProductBriefContext(raw: unknown): MarketIntakeProductBriefContext {
  if (!isRecord(raw)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_INPUT_KEYS.has(key) || key === 'id' || key === 'version' || key === 'tenantId') {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
  }
  const productName = typeof raw.productName === 'string' ? raw.productName.trim() : '';
  const industry = typeof raw.industry === 'string' ? raw.industry.trim() : '';
  const businessGoal = typeof raw.businessGoal === 'string' ? raw.businessGoal.trim() : '';
  if (!productName || !industry || !businessGoal) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  const ctx: MarketIntakeProductBriefContext = { productName, industry, businessGoal };
  if (typeof raw.targetAudience === 'string' && raw.targetAudience.trim()) {
    ctx.targetAudience = raw.targetAudience.trim();
  }
  if (typeof raw.description === 'string' && raw.description.trim()) {
    ctx.description = raw.description.trim();
  }
  if (Array.isArray(raw.sellingPoints)) {
    ctx.sellingPoints = raw.sellingPoints.filter((item): item is string => typeof item === 'string');
  }
  if (Array.isArray(raw.seedKeywords)) {
    ctx.seedKeywords = raw.seedKeywords.filter((item): item is string => typeof item === 'string');
  }
  return ctx;
}

export function parseMarketIntakeInput(input: unknown): MarketIntakeAgentInput {
  if (!isRecord(input)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
  }
  if (input.mode !== 'market') {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (input.noDataAllowed !== true) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (typeof input.latestUserMessage !== 'string') {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  const latestUserMessage = input.latestUserMessage.trim();
  if (!latestUserMessage || latestUserMessage.length > MARKET_INTAKE_LIMITS.message) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  const locale = typeof input.locale === 'string' && input.locale.trim() ? input.locale.trim().slice(0, 32) : 'zh-CN';
  const currentDraft = sanitizeMarketIntakeDraftPatch(input.currentDraft ?? {});
  const recentConversation = parseConversation(input.recentConversation ?? []);
  const confirmedProductBrief = parseProductBriefContext(input.confirmedProductBrief);
  const improvingExisting = input.improvingExisting === true;
  return {
    mode: 'market',
    confirmedProductBrief,
    currentDraft,
    recentConversation,
    latestUserMessage,
    locale,
    noDataAllowed: true,
    ...(improvingExisting ? { improvingExisting: true } : {}),
  };
}

export function validateMarketIntakeOutput(
  value: unknown,
  currentDraft: MarketIntakeDraft,
  options?: { userAcknowledgedLimitedData?: boolean },
): MarketIntakeAgentOutput {
  if (!isRecord(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const forbidden = [
    'marketInsight',
    'executiveSummary',
    'opportunities',
    'risks',
    'confidence',
    'marketState',
    'strategicImplications',
    'campaignStrategy',
    'contentPlan',
    'accountPositioning',
    'playCount',
    'likeCount',
    'marketSize',
    'growthRate',
    'tenantId',
    'workspaceId',
    'productBriefId',
    'version',
    'status',
    'source',
    'collectedAt',
    'userAcknowledgedLimitedData',
  ];
  for (const key of forbidden) {
    if (key in value) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
  }
  if (typeof value.message !== 'string' || !value.message.trim()) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const message = value.message.trim().slice(0, MARKET_INTAKE_LIMITS.message);
  const draftPatch = sanitizeMarketIntakeDraftPatch(value.draftPatch ?? {});
  const suggestions = sanitizeMarketIntakeSuggestions(value.suggestions);
  const draftAfterMerge = mergeMarketIntakeDraft(currentDraft, draftPatch);
  return applyDeterministicMarketReadiness({
    message,
    draftPatch,
    suggestions,
    draftAfterMerge,
    userAcknowledgedLimitedData: options?.userAcknowledgedLimitedData,
  });
}

export function parseAndValidateMarketIntakeModelText(
  text: string,
  currentDraft: MarketIntakeDraft,
  options?: { userAcknowledgedLimitedData?: boolean },
): MarketIntakeAgentOutput {
  return validateMarketIntakeOutput(parseModelJson(text), currentDraft, options);
}

export {
  getMarketIntakeReadinessFromDraft,
  mergeMarketIntakeDraft,
  sanitizeMarketIntakeDraftPatch,
  sanitizeMarketIntakeUserDraft,
};
