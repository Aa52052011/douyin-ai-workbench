import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentRegistry } from '../agent.registry.js';
import type { AgentContext } from '../agent.types.js';
import {
  buildMockCampaignStrategyOutput,
  buildTestCampaignStrategySnapshot,
} from '../definitions/campaign-strategy.fixture.js';
import { MockModelProvider } from '../models/mock.provider.js';
import { ModelRouter } from '../models/model.router.js';
import { RealModelProvider } from '../models/real.provider.js';
import { PromptRegistry } from '../prompts/prompt.registry.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { InProcessAgentExecutor } from './in-process.executor.js';

const context: AgentContext = {
  userId: 'u',
  tenantId: 't',
  workspaceId: 'w',
  projectId: 'p',
  requestId: 'req-cs',
  locale: 'zh-CN',
};

function executorWith(generate: ModelRouter['generate']): InProcessAgentExecutor {
  const router = new ModelRouter(new MockModelProvider(), new RealModelProvider());
  router.generate = generate;
  return new InProcessAgentExecutor(new AgentRegistry(), router, new ToolRegistry(), new PromptRegistry());
}

describe('campaign.strategy executor', () => {
  it('calls MockModelProvider and returns a grounded strategy from real input', async () => {
    const mock = new MockModelProvider();
    const executor = new InProcessAgentExecutor(
      new AgentRegistry(),
      new ModelRouter(mock, new RealModelProvider()),
      new ToolRegistry(),
      new PromptRegistry(),
    );
    const input = buildTestCampaignStrategySnapshot();
    const result = await executor.execute(
      {
        requestId: context.requestId,
        agentId: 'campaign.strategy',
        agentVersion: 'v1',
        context,
        input,
      },
      5000,
    );
    expect(mock.generateCalls).toBe(1);
    expect(mock.lastRequest?.agentId).toBe('campaign.strategy');
    expect(result.status).toBe('COMPLETED');
    expect(result.output?.confidence).toBe('LOW');
    expect(result.output?.dataLimitations).toEqual(
      expect.arrayContaining(['NO_MARKET_INSIGHT', 'NO_PERFORMANCE_HISTORY']),
    );
    expect(JSON.stringify(result.output)).not.toMatch(/根据市场数据|历史表现表明/);
  });

  it('fails closed when the model invents a market insight ref', async () => {
    const input = buildTestCampaignStrategySnapshot();
    const forged = buildMockCampaignStrategyOutput(input);
    forged.valuePropositions = [
      {
        proposition: '编造洞察',
        priority: 'high',
        evidenceBasis: [{ type: 'MARKET_INSIGHT', ref: 'NOT_REAL' }],
      },
    ];
    const executor = executorWith(async () => ({
      text: JSON.stringify(forged),
      provider: 'mock',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: 0 },
    }));
    await expect(
      executor.execute(
        {
          requestId: context.requestId,
          agentId: 'campaign.strategy',
          agentVersion: 'v1',
          context,
          input,
        },
        5000,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AGENT_INVALID_OUTPUT });
  });

  it('repairs once after invalid first output then completes', async () => {
    const input = buildTestCampaignStrategySnapshot();
    const forged = buildMockCampaignStrategyOutput(input);
    forged.valuePropositions = [
      {
        proposition: '编造洞察',
        priority: 'high',
        evidenceBasis: [{ type: 'MARKET_INSIGHT', ref: 'NOT_REAL' }],
      },
    ];
    const valid = buildMockCampaignStrategyOutput(input);
    let calls = 0;
    const executor = executorWith(async () => {
      calls += 1;
      return {
        text: JSON.stringify(calls === 1 ? forged : valid),
        provider: 'mock',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: 0 },
      };
    });
    const result = await executor.execute(
      {
        requestId: context.requestId,
        agentId: 'campaign.strategy',
        agentVersion: 'v1',
        context,
        input,
      },
      5000,
    );
    expect(calls).toBe(2);
    expect(result.status).toBe('COMPLETED');
    expect(result.output?.version).toBe('v1');
  });
});
