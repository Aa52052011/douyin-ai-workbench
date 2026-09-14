import { describe, expect, it } from 'vitest';
import { MIN_PRODUCTION_LLM_TIMEOUT_MS, productionLlmTimeoutMs } from '../agent.types.js';
import { accountPositioningDefinition } from './account-positioning.agent.js';
import { campaignStrategyDefinition } from './campaign-strategy.agent.js';
import { contentPlanningDefinition } from './content-planning.agent.js';
import { marketIntelligenceDefinition } from './market-intelligence.agent.js';
import { scriptGenerationDefinition } from './script-generation.agent.js';

describe('production LLM timeout policy', () => {
  it('floors below-minimum values without lowering higher ones', () => {
    expect(productionLlmTimeoutMs(60_000)).toBe(MIN_PRODUCTION_LLM_TIMEOUT_MS);
    expect(productionLlmTimeoutMs(90_000)).toBe(MIN_PRODUCTION_LLM_TIMEOUT_MS);
    expect(productionLlmTimeoutMs(120_000)).toBe(MIN_PRODUCTION_LLM_TIMEOUT_MS);
    expect(productionLlmTimeoutMs(210_000)).toBe(210_000);
    expect(productionLlmTimeoutMs(240_000)).toBe(240_000);
  });

  it('keeps primary LLM agents at least 210s', () => {
    expect(accountPositioningDefinition.timeoutMs).toBeGreaterThanOrEqual(210_000);
    expect(marketIntelligenceDefinition.timeoutMs).toBeGreaterThanOrEqual(210_000);
    expect(scriptGenerationDefinition.timeoutMs).toBeGreaterThanOrEqual(210_000);
    expect(contentPlanningDefinition.timeoutMs).toBeGreaterThanOrEqual(210_000);
    expect(campaignStrategyDefinition.timeoutMs).toBeGreaterThanOrEqual(210_000);
  });
});
