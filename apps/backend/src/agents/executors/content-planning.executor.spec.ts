import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentRegistry } from '../agent.registry.js';
import type { AgentContext } from '../agent.types.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from '../definitions/account-positioning.fixture.js';
import {
  buildMockCampaignStrategyOutput,
  buildTestCampaignStrategySnapshot,
} from '../definitions/campaign-strategy.fixture.js';
import { buildMockContentPlanOutput } from '../definitions/content-planning.fixture.js';
import { MockModelProvider } from '../models/mock.provider.js';
import { ModelRouter } from '../models/model.router.js';
import { RealModelProvider } from '../models/real.provider.js';
import { PromptRegistry } from '../prompts/prompt.registry.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { AgentError } from '../agent.errors.js';
import { InProcessAgentExecutor } from './in-process.executor.js';

const context: AgentContext = {
  userId: 'u',
  tenantId: 't',
  workspaceId: 'w',
  projectId: 'p',
  requestId: 'req-cp',
  locale: 'zh-CN',
};

const input = {
  positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
  planningDays: 7,
  postsPerDay: 1,
  platform: 'douyin',
};

function executorWith(generate: ModelRouter['generate']): InProcessAgentExecutor {
  const router = new ModelRouter(new MockModelProvider(), new RealModelProvider());
  router.generate = generate;
  return new InProcessAgentExecutor(
    new AgentRegistry(),
    router,
    new ToolRegistry(),
    new PromptRegistry(),
  );
}

describe('content.planning executor', () => {
  it('returns structured output through ModelRouter mock', async () => {
    const executor = new InProcessAgentExecutor(
      new AgentRegistry(),
      new ModelRouter(new MockModelProvider(), new RealModelProvider()),
      new ToolRegistry(),
      new PromptRegistry(),
    );
    const result = await executor.execute(
      {
        requestId: context.requestId,
        agentId: 'content.planning',
        agentVersion: 'v1',
        context,
        input,
      },
      5000,
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.output?.topics).toHaveLength(7);
    expect(result.output?.usedTrendData).toBe(false);
    expect(result.output?.trendNote).toBe('未使用实时趋势数据');
    expect(result.usage?.totalTokens).toBeGreaterThan(0);
  });

  it('puts compact performanceFeedback in the mock prompt without changing output contract', async () => {
    const mock = new MockModelProvider();
    const executor = new InProcessAgentExecutor(
      new AgentRegistry(),
      new ModelRouter(mock, new RealModelProvider()),
      new ToolRegistry(),
      new PromptRegistry(),
    );
    const result = await executor.execute(
      {
        requestId: context.requestId,
        agentId: 'content.planning',
        agentVersion: 'v1',
        context,
        input: {
          ...input,
          performanceFeedback: {
            version: 'v1',
            generatedAt: '2026-08-10T00:00:00.000Z',
            dataState: 'USABLE',
            sampleSize: 2,
            publicationsConsidered: 2,
            dataQuality: { sufficientCount: 2, partialCount: 0, insufficientCount: 0 },
            positiveSignals: [
              {
                code: 'HIGH_SHARE_RATE',
                category: 'ENGAGEMENT',
                confidence: 'HIGH',
                supportCount: 2,
                publicationIds: ['11111111-1111-4111-8111-111111111111'],
                representativeEvidence: [{ metric: 'shareRate', value: 0.06, threshold: 0.02, window: 'H24' }],
              },
            ],
            cautionSignals: [],
            dataQualitySignals: [],
            inconsistentPerformance: false,
            avoidOvergeneralization: true,
          },
        },
      },
      5000,
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.output?.topics).toHaveLength(7);
    expect(result.output).not.toHaveProperty('performanceFeedback');
    expect(mock.lastRequest?.prompt).toContain('历史表现反馈 JSON');
    expect(mock.lastRequest?.prompt).toContain('HIGH_SHARE_RATE');
    expect(mock.lastRequest?.prompt).not.toContain('providerMetadata');
    expect(mock.lastRequest?.prompt).not.toContain('collectionKey');
    expect(mock.lastRequest?.systemPrompt).toContain('账号定位');
  });

  it('injects compact campaignStrategy without changing output contract', async () => {
    const mock = new MockModelProvider();
    const executor = new InProcessAgentExecutor(
      new AgentRegistry(),
      new ModelRouter(mock, new RealModelProvider()),
      new ToolRegistry(),
      new PromptRegistry(),
    );
    const snapshot = buildTestCampaignStrategySnapshot();
    const payload = buildMockCampaignStrategyOutput(snapshot);
    payload.contentPillars = [
      {
        name: '样本验证支柱',
        purpose: '验证策略方向',
        priority: 'high',
        evidenceBasis: [{ type: 'PRODUCT_BRIEF', ref: 'productName' }],
      },
    ];
    const campaignStrategy = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      version: 2,
      status: 'READY' as const,
      payload,
    };
    const result = await executor.execute(
      {
        requestId: context.requestId,
        agentId: 'content.planning',
        agentVersion: 'v1',
        context,
        input: { ...input, strategyId: campaignStrategy.id, campaignStrategy },
      },
      5000,
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.output?.topics).toHaveLength(7);
    expect(result.output).not.toHaveProperty('campaignStrategy');
    expect(mock.lastRequest?.prompt).toContain('样本验证支柱');
    expect(mock.lastRequest?.prompt).not.toContain('inputSnapshot');
    expect(JSON.stringify(result.output?.topics)).toContain('样本验证支柱');
    expect(
      (result.output?.topics as Array<{ contentPillar: string }>).every((topic) =>
        MOCK_ACCOUNT_POSITIONING_OUTPUT.contentPillars.some((pillar) => pillar.name === topic.contentPillar),
      ),
    ).toBe(true);
  });

  it('fails non-JSON model output as AGENT_INVALID_OUTPUT', async () => {
    const executor = executorWith(async () => ({
      text: 'plain text from the model',
      provider: 'mock',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: 0 },
    }));
    await expect(
      executor.execute(
        {
          requestId: context.requestId,
          agentId: 'content.planning',
          agentVersion: 'v1',
          context,
          input,
        },
        5000,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AGENT_INVALID_OUTPUT });
  });

  it('fails schema-invalid JSON as AGENT_INVALID_OUTPUT', async () => {
    const executor = executorWith(async () => ({
      text: JSON.stringify({ title: 'broken' }),
      provider: 'mock',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: 0 },
    }));
    await expect(
      executor.execute(
        {
          requestId: context.requestId,
          agentId: 'content.planning',
          agentVersion: 'v1',
          context,
          input,
        },
        5000,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AGENT_INVALID_OUTPUT });
  });

  it('surfaces real provider errors and timeouts', async () => {
    const errorExecutor = executorWith(async () => {
      throw new AgentError(ErrorCode.MODEL_ERROR);
    });
    await expect(
      errorExecutor.execute(
        {
          requestId: context.requestId,
          agentId: 'content.planning',
          agentVersion: 'v1',
          context,
          input,
        },
        5000,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.MODEL_ERROR });

    const timeoutExecutor = executorWith(async () => {
      throw new AgentError(ErrorCode.MODEL_TIMEOUT);
    });
    await expect(
      timeoutExecutor.execute(
        {
          requestId: context.requestId,
          agentId: 'content.planning',
          agentVersion: 'v1',
          context,
          input,
        },
        5000,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.MODEL_TIMEOUT });
  });

  it('times out when the model hangs', async () => {
    const executor = executorWith(
      () =>
        new Promise(() => {
          /* hang */
        }),
    );
    await expect(
      executor.execute(
        {
          requestId: context.requestId,
          agentId: 'content.planning',
          agentVersion: 'v1',
          context,
          input,
        },
        30,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AGENT_TIMEOUT });
  });

  it('accepts a full mock payload for 7x5', async () => {
    const executor = executorWith(async () => ({
      text: JSON.stringify(buildMockContentPlanOutput({ planningDays: 7, postsPerDay: 5 })),
      provider: 'mock',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: 0 },
    }));
    const result = await executor.execute(
      {
        requestId: context.requestId,
        agentId: 'content.planning',
        agentVersion: 'v1',
        context,
        input: { ...input, postsPerDay: 5 },
      },
      5000,
    );
    expect(result.output?.topics).toHaveLength(35);
  });
});
