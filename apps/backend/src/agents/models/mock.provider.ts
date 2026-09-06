import { Injectable } from '@nestjs/common';
import {
  ACCOUNT_POSITIONING_AGENT_ID,
  CAMPAIGN_STRATEGY_AGENT_ID,
  CONTENT_PLANNING_AGENT_ID,
  MARKET_INTELLIGENCE_AGENT_ID,
  SCRIPT_GENERATION_AGENT_ID,
} from '../agent.types.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from '../definitions/account-positioning.fixture.js';
import { buildMockCampaignStrategyText } from '../definitions/campaign-strategy.fixture.js';
import {
  buildMockContentPlanOutput,
  extractCampaignStrategyFromPrompt,
} from '../definitions/content-planning.fixture.js';
import { buildMockMarketInsightText } from '../definitions/market-intelligence.fixture.js';
import { buildMockScriptOutput } from '../definitions/script-generation.fixture.js';
import type { ScriptTargetDuration } from '../definitions/script-generation.types.js';
import type { ModelGenerateRequest, ModelGenerateResult, ModelProvider } from './model.types.js';

@Injectable()
export class MockModelProvider implements ModelProvider {
  readonly id = 'mock';
  lastRequest: ModelGenerateRequest | null = null;
  generateCalls = 0;

  async generate(request: ModelGenerateRequest): Promise<ModelGenerateResult> {
    this.generateCalls += 1;
    this.lastRequest = request;
    const text = mockText(request);
    const inputTokens = tokenEstimate(`${request.systemPrompt ?? ''}\n${request.prompt}`);
    const outputTokens = tokenEstimate(text);
    return {
      text,
      provider: this.id,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCost: 0,
      },
    };
  }
}

function mockText(request: ModelGenerateRequest): string {
  if (
    request.agentId === ACCOUNT_POSITIONING_AGENT_ID ||
    request.task === ACCOUNT_POSITIONING_AGENT_ID
  ) {
    return JSON.stringify(MOCK_ACCOUNT_POSITIONING_OUTPUT);
  }
  if (
    request.agentId === CONTENT_PLANNING_AGENT_ID ||
    request.task === CONTENT_PLANNING_AGENT_ID
  ) {
    return JSON.stringify(
      buildMockContentPlanOutput({
        planningDays: extractNumber(request.prompt, /规划周期[：:]\s*(\d+)/, 7),
        postsPerDay: extractNumber(request.prompt, /每天发布[：:]\s*(\d+)/, 1),
        campaignStrategy: extractCampaignStrategyFromPrompt(request.prompt),
      }),
    );
  }
  if (
    request.agentId === SCRIPT_GENERATION_AGENT_ID ||
    request.task === SCRIPT_GENERATION_AGENT_ID
  ) {
    const duration = extractNumber(request.prompt, /目标时长[：:]\s*(\d+)/, 30);
    const allowed = [15, 30, 45, 60].includes(duration) ? duration : 30;
    return JSON.stringify(buildMockScriptOutput(allowed as ScriptTargetDuration));
  }
  if (
    request.agentId === MARKET_INTELLIGENCE_AGENT_ID ||
    request.task === MARKET_INTELLIGENCE_AGENT_ID
  ) {
    return buildMockMarketInsightText(request.prompt);
  }
  if (
    request.agentId === CAMPAIGN_STRATEGY_AGENT_ID ||
    request.task === CAMPAIGN_STRATEGY_AGENT_ID
  ) {
    return buildMockCampaignStrategyText(request.prompt);
  }
  return request.prompt;
}

function extractNumber(text: string, pattern: RegExp, fallback: number): number {
  const match = text.match(pattern);
  if (!match) {
    return fallback;
  }
  return Number.parseInt(match[1], 10);
}

function tokenEstimate(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
