import { assertCampaignStrategyInputSnapshot } from '../../campaign/campaign-strategy.validation.js';
import {
  CAMPAIGN_STRATEGY_FORBIDDEN_KEYS,
  CAMPAIGN_STRATEGY_INPUT_KEYS,
  CAMPAIGN_STRATEGY_INPUT_VERSION,
  type CampaignStrategyInputSnapshot,
} from '../../campaign/campaign-strategy.types.js';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import {
  CAMPAIGN_STRATEGY_AGENT_ID,
  CAMPAIGN_STRATEGY_AGENT_VERSION,
  CAMPAIGN_STRATEGY_TIMEOUT_MS,
  productionLlmTimeoutMs,
  type AgentDefinition,
} from '../agent.types.js';

export const campaignStrategyDefinition: AgentDefinition = {
  id: CAMPAIGN_STRATEGY_AGENT_ID,
  name: '推广策略',
  version: CAMPAIGN_STRATEGY_AGENT_VERSION,
  description: '基于 ProductBrief、MarketInsight、账号定位与历史反馈生成项目级推广策略。',
  capabilities: ['campaign-strategy', 'structured-output', 'evidence-grounded'],
  timeoutMs: productionLlmTimeoutMs(CAMPAIGN_STRATEGY_TIMEOUT_MS),
  defaultModel: process.env.MODEL_NAME?.trim() || undefined,
  temperature: 0.3,
  maxTokens: 3500,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: [...CAMPAIGN_STRATEGY_INPUT_KEYS],
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'version',
      'objective',
      'targetAudience',
      'positioning',
      'valuePropositions',
      'contentPillars',
      'contentMix',
      'creativeAngles',
      'conversionPath',
      'ctaStrategy',
      'testingStrategy',
      'risks',
      'confidence',
      'dataLimitations',
    ],
  },
};

export function parseCampaignStrategyInput(input: unknown): CampaignStrategyInputSnapshot {
  if (!isRecord(input)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  for (const key of Object.keys(input)) {
    if ((CAMPAIGN_STRATEGY_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    if (!(CAMPAIGN_STRATEGY_INPUT_KEYS as readonly string[]).includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
  }
  if (input.version !== CAMPAIGN_STRATEGY_INPUT_VERSION) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (input.marketEvidence || input.snapshot || input.rawSnapshot || input.collectionKey) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (!isRecord(input.productBrief) || !isRecord(input.accountPositioning) || !isRecord(input.performanceFeedback)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (!isRecord(input.dataState) || !Array.isArray(input.flags) || !Array.isArray(input.inputPriority)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  try {
    return assertCampaignStrategyInputSnapshot(input as CampaignStrategyInputSnapshot);
  } catch (error) {
    if (error instanceof AgentError) {
      throw error;
    }
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
