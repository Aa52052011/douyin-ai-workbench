import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { buildMarketDataQuality } from '../../market/market-data-quality.js';
import { buildMarketEvidence } from '../../market/market-evidence.builder.js';
import { normalizeMarketItems } from '../../market/market-normalizer.js';
import { buildMarketSampleStats } from '../../market/market-sample-stats.js';
import type { ProductBriefPayload } from '../../market/market.types.js';
import { AgentRegistry } from '../agent.registry.js';
import type { AgentContext } from '../agent.types.js';
import { listMarketEvidenceItems } from '../definitions/market-intelligence.agent.js';
import { buildMockMarketInsightOutput } from '../definitions/market-intelligence.fixture.js';
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
  requestId: 'req-mi',
  locale: 'zh-CN',
};

const brief: ProductBriefPayload = {
  productName: '防脱精华',
  industry: '个护',
  businessGoal: '获客',
  seedKeywords: ['防脱'],
  sellingPoints: ['植物防脱'],
};

function evidenceFromItems(items: unknown[]) {
  const collectedAt = '2026-09-01T00:00:00.000Z';
  const normalized = normalizeMarketItems({ items, collectedAt });
  return buildMarketEvidence({
    marketResearchId: '11111111-1111-1111-1111-111111111111',
    marketResearchVersion: 1,
    snapshotId: '22222222-2222-2222-2222-222222222222',
    generatedAt: '2026-09-05T00:00:00.000Z',
    productBriefSnapshot: brief,
    queryContext: {},
    dataQuality: buildMarketDataQuality({ items: normalized.items, duplicateCount: normalized.duplicateCount }),
    sampleStats: buildMarketSampleStats(normalized.items),
    keywords: normalized.items.filter((item) => item.kind === 'KEYWORD'),
    contents: normalized.items.filter((item) => item.kind === 'CONTENT'),
    competitors: normalized.items.filter((item) => item.kind === 'COMPETITOR'),
    trends: normalized.items.filter((item) => item.kind === 'TREND'),
    audienceSignals: normalized.items.filter((item) => item.kind === 'AUDIENCE_SIGNAL'),
  });
}

function limitedInput() {
  return {
    productBrief: brief,
    marketEvidence: evidenceFromItems([
      { kind: 'KEYWORD', platform: 'douyin', keyword: '防脱', volumeSignal: 'high', competitionSignal: 'low' },
      {
        kind: 'CONTENT',
        platform: 'douyin',
        title: '样本A',
        views: 100,
        likes: 10,
        comments: 2,
        shares: 1,
        favorites: 1,
      },
    ]),
  };
}

function executorWith(generate: ModelRouter['generate']): InProcessAgentExecutor {
  const router = new ModelRouter(new MockModelProvider(), new RealModelProvider());
  router.generate = generate;
  return new InProcessAgentExecutor(new AgentRegistry(), router, new ToolRegistry(), new PromptRegistry());
}

describe('market.intelligence executor', () => {
  it('does not call ModelProvider for NONE and returns zero usage', async () => {
    const mock = new MockModelProvider();
    const executor = new InProcessAgentExecutor(
      new AgentRegistry(),
      new ModelRouter(mock, new RealModelProvider()),
      new ToolRegistry(),
      new PromptRegistry(),
    );
    const input = { productBrief: brief, marketEvidence: evidenceFromItems([]) };
    const result = await executor.execute(
      {
        requestId: context.requestId,
        agentId: 'market.intelligence',
        agentVersion: 'v1',
        context,
        input,
      },
      5000,
    );
    expect(mock.generateCalls).toBe(0);
    expect(mock.lastRequest).toBeNull();
    expect(result.status).toBe('COMPLETED');
    expect(result.usage?.totalTokens).toBe(0);
    expect(result.usage?.estimatedCost).toBe(0);
    expect(result.output?.marketState).toBe('INSUFFICIENT_DATA');
    expect(result.output?.dataLimitations).toEqual(expect.arrayContaining(['NO_MARKET_DATA']));
    expect(result.output?.confidence).toBe('LOW');
  });

  it('calls MockModelProvider for LIMITED and keeps LOW/MEDIUM', async () => {
    const mock = new MockModelProvider();
    const executor = new InProcessAgentExecutor(
      new AgentRegistry(),
      new ModelRouter(mock, new RealModelProvider()),
      new ToolRegistry(),
      new PromptRegistry(),
    );
    const input = limitedInput();
    expect(input.marketEvidence.dataSufficiency).toBe('LIMITED');
    const result = await executor.execute(
      {
        requestId: context.requestId,
        agentId: 'market.intelligence',
        agentVersion: 'v1',
        context,
        input,
      },
      5000,
    );
    expect(mock.generateCalls).toBe(1);
    expect(mock.lastRequest?.agentId).toBe('market.intelligence');
    expect(result.status).toBe('COMPLETED');
    expect(result.output?.confidence === 'LOW' || result.output?.confidence === 'MEDIUM').toBe(true);
    expect(result.output?.confidence).not.toBe('HIGH');
    expect(result.output?.dataLimitations).toEqual(expect.arrayContaining(['LIMITED_SAMPLE']));
    const available = new Set(listMarketEvidenceItems(input.marketEvidence).map((item) => item.code));
    const used = ((result.output?.keywordInsights as Array<{ evidenceCodes: string[] }> | undefined) ?? []).flatMap(
      (item) => item.evidenceCodes,
    );
    expect(used.every((code) => available.has(code))).toBe(true);
  });

  it('fails closed when the model invents an evidenceCode', async () => {
    const input = limitedInput();
    const forged = buildMockMarketInsightOutput(input);
    forged.keywordInsights = [
      {
        code: 'fake',
        statement: '在当前样本中编造了一个不存在的 evidence。',
        evidenceKind: 'DATA_BACKED',
        confidence: 'LOW',
        evidenceCodes: ['NOT_A_REAL_CODE'],
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
          agentId: 'market.intelligence',
          agentVersion: 'v1',
          context,
          input,
        },
        5000,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AGENT_INVALID_OUTPUT });
  });
});
