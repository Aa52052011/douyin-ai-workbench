import {
  MARKET_RESEARCH_PLAN_AGENT_ID,
  MARKET_RESEARCH_PLAN_AGENT_VERSION,
  MARKET_RESEARCH_PLAN_TIMEOUT_MS,
  type AgentDefinition,
} from '../agent.types.js';

export const marketResearchPlanDefinition: AgentDefinition = {
  id: MARKET_RESEARCH_PLAN_AGENT_ID,
  name: '市场研究计划',
  version: MARKET_RESEARCH_PLAN_AGENT_VERSION,
  description: '只规划“应该查什么”，不产出市场事实。无真实 Adapter 时不得被当成研究结果。',
  capabilities: ['research-plan', 'no-evidence'],
  timeoutMs: MARKET_RESEARCH_PLAN_TIMEOUT_MS,
  temperature: 0.2,
  maxTokens: 1200,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      product: { type: 'object' },
      goal: { type: 'string' },
      positioning: { type: 'object' },
      existingKeywords: { type: 'array' },
      competitors: { type: 'array' },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'queries', 'competitorSeeds', 'contentQuestions', 'trendQuestions', 'disclaimer'],
    properties: {
      version: { type: 'string' },
      queries: { type: 'array' },
      competitorSeeds: { type: 'array' },
      contentQuestions: { type: 'array' },
      trendQuestions: { type: 'array' },
      disclaimer: { type: 'string' },
    },
  },
};
