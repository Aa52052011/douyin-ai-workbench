import { AgentError } from '../agent.errors.js';
import {
  DEFAULT_AGENT_TIMEOUT_MS,
  PRODUCT_INTAKE_AGENT_ID,
  PRODUCT_INTAKE_AGENT_VERSION,
  PRODUCT_INTAKE_TIMEOUT_MS,
  type AgentDefinition,
} from '../agent.types.js';
import { ErrorCode } from '../../common/errors/app-error.js';
import {
  applyDeterministicReadiness,
  getProductIntakeReadiness,
  mergeProductIntakeDraft,
  sanitizeProductIntakeDraftPatch,
  sanitizeProductIntakeSuggestions,
} from './product-intake.patch.js';
import {
  PRODUCT_INTAKE_LIMITS,
  type ProductIntakeAgentInput,
  type ProductIntakeAgentOutput,
  type ProductIntakeConversationMessage,
  type ProductIntakeDraft,
} from './product-intake.types.js';
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

export const productIntakeDefinition: AgentDefinition = {
  id: PRODUCT_INTAKE_AGENT_ID,
  name: 'Product Intake',
  version: PRODUCT_INTAKE_AGENT_VERSION,
  description: 'Guided conversation that extracts ProductBrief facts into a draft patch. Does not write ProductBrief or positioning.',
  capabilities: ['product-intake', 'draft-patch'],
  timeoutMs: PRODUCT_INTAKE_TIMEOUT_MS || DEFAULT_AGENT_TIMEOUT_MS,
  temperature: 0.3,
  maxTokens: 1200,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['mode', 'currentDraft', 'recentConversation', 'latestUserMessage', 'locale'],
    properties: {
      mode: { const: 'product' },
      currentDraft: { type: 'object' },
      recentConversation: { type: 'array' },
      latestUserMessage: { type: 'string' },
      locale: { type: 'string' },
      improvingExisting: { type: 'boolean' },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['message', 'draftPatch', 'missingFields', 'suggestions', 'readyForConfirmation'],
    properties: {
      message: { type: 'string' },
      draftPatch: { type: 'object' },
      missingFields: { type: 'array', items: { type: 'string' } },
      suggestions: { type: 'array' },
      readyForConfirmation: { type: 'boolean' },
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseConversation(raw: unknown): ProductIntakeConversationMessage[] {
  if (!Array.isArray(raw)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (raw.length > PRODUCT_INTAKE_LIMITS.conversationMessages) {
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
    if (!trimmed || trimmed.length > PRODUCT_INTAKE_LIMITS.conversationContent) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    return { role, content: trimmed };
  });
}

export function parseProductIntakeInput(input: unknown): ProductIntakeAgentInput {
  if (!isRecord(input)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
  }
  if (input.mode !== 'product') {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (typeof input.latestUserMessage !== 'string') {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  const latestUserMessage = input.latestUserMessage.trim();
  if (!latestUserMessage || latestUserMessage.length > PRODUCT_INTAKE_LIMITS.message) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  const locale = typeof input.locale === 'string' && input.locale.trim() ? input.locale.trim().slice(0, 32) : 'zh-CN';
  const currentDraft = sanitizeProductIntakeDraftPatch(input.currentDraft ?? {});
  const recentConversation = parseConversation(input.recentConversation ?? []);
  const improvingExisting = input.improvingExisting === true;
  return {
    mode: 'product',
    currentDraft,
    recentConversation,
    latestUserMessage,
    locale,
    ...(improvingExisting ? { improvingExisting: true } : {}),
  };
}

export function validateProductIntakeOutput(
  value: unknown,
  currentDraft: ProductIntakeDraft,
): ProductIntakeAgentOutput {
  if (!isRecord(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  // Reject positioning / strategy leakage
  const forbidden = [
    'accountPositioning',
    'persona',
    'contentPillars',
    'publishingStrategy',
    'marketInsight',
    'campaignStrategy',
    'tenantId',
    'workspaceId',
    'productBriefId',
    'version',
  ];
  for (const key of forbidden) {
    if (key in value) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
  }
  if (typeof value.message !== 'string' || !value.message.trim()) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const message = value.message.trim().slice(0, PRODUCT_INTAKE_LIMITS.message);
  const draftPatch = sanitizeProductIntakeDraftPatch(value.draftPatch ?? {});
  const suggestions = sanitizeProductIntakeSuggestions(value.suggestions);
  const draftAfterMerge = mergeProductIntakeDraft(currentDraft, draftPatch);
  return applyDeterministicReadiness({
    message,
    draftPatch,
    suggestions,
    draftAfterMerge,
  });
}

export function parseAndValidateProductIntakeModelText(
  text: string,
  currentDraft: ProductIntakeDraft,
): ProductIntakeAgentOutput {
  return validateProductIntakeOutput(parseModelJson(text), currentDraft);
}

export { getProductIntakeReadiness, mergeProductIntakeDraft, sanitizeProductIntakeDraftPatch };
