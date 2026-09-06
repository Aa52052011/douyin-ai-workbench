import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { buildMarketDataQuality } from '../../market/market-data-quality.js';
import { buildMarketEvidence } from '../../market/market-evidence.builder.js';
import type { MarketEvidence } from '../../market/market-evidence.types.js';
import { normalizeMarketItems } from '../../market/market-normalizer.js';
import { buildMarketSampleStats } from '../../market/market-sample-stats.js';
import type { ProductBriefPayload } from '../../market/market.types.js';
import { parseModelJson } from './account-positioning.agent.js';
import {
  buildInsufficientMarketInsight,
  listMarketEvidenceItems,
  parseMarketIntelligenceInput,
  validateMarketInsightOutput,
} from './market-intelligence.agent.js';
import { buildMockMarketInsightOutput } from './market-intelligence.fixture.js';
import {
  MARKET_INSIGHT_LIMITS,
  type MarketInsightItem,
  type MarketInsightOutputV1,
  type MarketIntelligenceInput,
} from './market-intelligence.types.js';

const brief: ProductBriefPayload = {
  productName: '防脱精华',
  industry: '个护',
  businessGoal: '获客',
  seedKeywords: ['防脱', '头皮护理'],
  sellingPoints: ['植物防脱', '无人提及的专利成分'],
};

const collectedAt = '2026-09-01T00:00:00.000Z';

function evidenceFromItems(items: unknown[]): MarketEvidence {
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

function limitedEvidence(): MarketEvidence {
  const contents = Array.from({ length: 10 }, (_, index) => ({
    kind: 'CONTENT',
    platform: 'douyin',
    title: `样本${index + 1}`,
    author: index < 4 ? 'same-author' : `author-${index}`,
    views: (index + 1) * 80,
    likes: 10,
    comments: 2,
    shares: 1,
    favorites: 1,
    hashtags: ['防脱'],
    keywords: ['防脱'],
    durationSeconds: index === 0 ? 15 : 40,
  }));
  return evidenceFromItems([
    { kind: 'KEYWORD', platform: 'douyin', keyword: '防脱', relatedKeywords: ['掉发'], volumeSignal: 'high', competitionSignal: 'low', searchRank: 1 },
    { kind: 'KEYWORD', platform: 'douyin', keyword: '头皮护理', relatedKeywords: ['掉发'], volumeSignal: 'high', competitionSignal: 'high' },
    ...contents,
    { kind: 'COMPETITOR', platform: 'douyin', displayName: '竞品A', followerCount: 1200, contentThemes: ['防脱'] },
  ]);
}

function noneInput(): MarketIntelligenceInput {
  return { productBrief: brief, marketEvidence: evidenceFromItems([]) };
}

function limitedInput(): MarketIntelligenceInput {
  return { productBrief: brief, marketEvidence: limitedEvidence() };
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('expected throw');
  } catch (error) {
    expect((error as { code: string }).code).toBe(code);
  }
}

function itemFromEvidence(evidence: MarketEvidence, overrides: Partial<MarketInsightItem> = {}): MarketInsightItem {
  const source = listMarketEvidenceItems(evidence).find((row) => row.evidenceKind !== 'INSUFFICIENT_DATA') ??
    listMarketEvidenceItems(evidence)[0];
  return {
    code: 'sample-insight',
    statement: '在当前样本中，该 evidence 表明存在可观察的相对信号。',
    evidenceKind: source.evidenceKind === 'DATA_BACKED' ? 'DATA_BACKED' : source.evidenceKind === 'INFERRED' ? 'INFERRED' : 'INSUFFICIENT_DATA',
    confidence: source.confidence,
    evidenceCodes: [source.code],
    ...overrides,
  };
}

function validOutput(input: MarketIntelligenceInput, overrides: Partial<MarketInsightOutputV1> = {}): MarketInsightOutputV1 {
  const first = itemFromEvidence(input.marketEvidence);
  return {
    version: 'v1',
    marketResearchId: input.marketEvidence.marketResearchId,
    evidenceVersion: input.marketEvidence.version,
    executiveSummary: '根据当前这批 MarketEvidence，只能描述研究样本内可见的相对信号。',
    marketState: input.marketEvidence.dataSufficiency === 'NONE' ? 'INSUFFICIENT_DATA' : 'LIMITED_SIGNAL',
    keywordInsights: input.marketEvidence.keywordEvidence.length ? [first] : [],
    contentInsights: [],
    competitorInsights: [],
    trendInsights: [],
    audienceInsights: [],
    opportunityInsights: [],
    strategicImplications: [],
    dataLimitations: input.marketEvidence.dataSufficiency === 'NONE' ? ['NO_MARKET_DATA'] : ['LIMITED_SAMPLE'],
    confidence: input.marketEvidence.confidence,
    evidenceCoverage: { evidenceItemsAvailable: 0, evidenceItemsReferenced: 0, coverageRate: 0 },
    ...overrides,
  };
}

describe('market.intelligence input/output', () => {
  it('accepts compact ProductBrief + MarketEvidence and rejects raw snapshot keys', () => {
    const input = limitedInput();
    const parsed = parseMarketIntelligenceInput(input);
    expect(parsed.marketEvidence.marketResearchId).toBe(input.marketEvidence.marketResearchId);
    expect(parsed.productBrief.productName).toBe('防脱精华');
    expectCode(() => parseMarketIntelligenceInput({ ...input, snapshot: {} }), ErrorCode.AGENT_INVALID_INPUT);
    expectCode(() => parseMarketIntelligenceInput({ ...input, contents: [] }), ErrorCode.AGENT_INVALID_INPUT);
    expectCode(() => parseMarketIntelligenceInput({ ...input, csv: 'a,b' }), ErrorCode.AGENT_INVALID_INPUT);
    expectCode(() => parseMarketIntelligenceInput({ ...input, tenantId: 't' }), ErrorCode.AGENT_INVALID_INPUT);
  });

  it('builds deterministic insufficient output for NONE without model-shaped claims', () => {
    const input = noneInput();
    const output = buildInsufficientMarketInsight(input);
    expect(output.marketState).toBe('INSUFFICIENT_DATA');
    expect(output.confidence).toBe('LOW');
    expect(output.keywordInsights).toEqual([]);
    expect(output.dataLimitations).toContain('NO_MARKET_DATA');
    expect(output.evidenceCoverage.evidenceItemsReferenced).toBe(0);
    expect(output.evidenceCoverage.coverageRate).toBe(0);
    expect(validateMarketInsightOutput(output, input).confidence).toBe('LOW');
  });

  it('accepts valid LIMITED output and overwrites coverage from real evidence codes', () => {
    const input = limitedInput();
    const codes = listMarketEvidenceItems(input.marketEvidence).map((item) => item.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'KEYWORD_SAMPLE_SIZE',
        'HIGH_VOLUME_SIGNAL_KEYWORDS',
        'ABOVE_SAMPLE_MEDIAN_VIEWS',
        'PRODUCT_MARKET_KEYWORD_OVERLAP',
      ]),
    );
    const output = validateMarketInsightOutput(validOutput(input), input);
    expect(output.evidenceCoverage.evidenceItemsAvailable).toBe(codes.length);
    expect(output.evidenceCoverage.evidenceItemsReferenced).toBeGreaterThan(0);
    expect(output.evidenceCoverage.coverageRate).toBeGreaterThan(0);
    expect(output.confidence).not.toBe('HIGH');
    expect(JSON.stringify(output)).not.toMatch(/publishingCadence|budget|ctaStrategy|contentMix|contentPillars|postingSchedule/);
  });

  it('rejects nonexistent evidenceCode and extra fields', () => {
    const input = limitedInput();
    expectCode(
      () =>
        validateMarketInsightOutput(
          validOutput(input, {
            keywordInsights: [itemFromEvidence(input.marketEvidence, { evidenceCodes: ['NOT_A_REAL_CODE'] })],
          }),
          input,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () => validateMarketInsightOutput({ ...validOutput(input), extra: true } as never, input),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
  });

  it('rejects evidenceKind upgrade and confidence upgrade', () => {
    const input = limitedInput();
    const inferred = input.marketEvidence.opportunityEvidence.find((item) => item.evidenceKind === 'INFERRED');
    expect(inferred).toBeTruthy();
    expectCode(
      () =>
        validateMarketInsightOutput(
          validOutput(input, {
            opportunityInsights: [
              itemFromEvidence(input.marketEvidence, {
                evidenceKind: 'DATA_BACKED',
                evidenceCodes: [inferred!.code],
                confidence: inferred!.confidence,
              }),
            ],
          }),
          input,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () => validateMarketInsightOutput(validOutput(input, { confidence: 'HIGH' }), input),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () =>
        validateMarketInsightOutput(
          validOutput(input, {
            keywordInsights: [itemFromEvidence(input.marketEvidence, { confidence: 'HIGH' })],
          }),
          input,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
  });

  it('rejects forbidden platform-wide claims and campaign fields', () => {
    const input = limitedInput();
    expectCode(
      () => validateMarketInsightOutput(validOutput(input, { executiveSummary: '全抖音用户都在买这个' }), input),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () =>
        validateMarketInsightOutput(
          validOutput(input, {
            keywordInsights: [itemFromEvidence(input.marketEvidence, { statement: '这是蓝海，搜索量为 10000' })],
          }),
          input,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () =>
        validateMarketInsightOutput(
          validOutput(input, {
            keywordInsights: [itemFromEvidence(input.marketEvidence, { statement: '正在快速增长且零竞争' })],
          }),
          input,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () => validateMarketInsightOutput({ ...validOutput(input), budget: 100 } as never, input),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
  });

  it('rejects oversized statement and over-cap arrays', () => {
    const input = limitedInput();
    expectCode(
      () =>
        validateMarketInsightOutput(
          validOutput(input, {
            keywordInsights: [itemFromEvidence(input.marketEvidence, { statement: 'x'.repeat(MARKET_INSIGHT_LIMITS.statement + 1) })],
          }),
          input,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () =>
        validateMarketInsightOutput(
          validOutput(input, {
            keywordInsights: Array.from({ length: 9 }, (_, index) =>
              itemFromEvidence(input.marketEvidence, { code: `item-${index}` }),
            ),
          }),
          input,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
  });

  it('normalizes duplicate evidenceCodes and requires LIMITED limitations', () => {
    const input = limitedInput();
    const source = listMarketEvidenceItems(input.marketEvidence)[0];
    const output = validateMarketInsightOutput(
      validOutput(input, {
        keywordInsights: [
          itemFromEvidence(input.marketEvidence, { evidenceCodes: [source.code, source.code] }),
        ],
      }),
      input,
    );
    expect(output.keywordInsights[0].evidenceCodes).toEqual([source.code]);
    expectCode(
      () => validateMarketInsightOutput(validOutput(input, { dataLimitations: [] }), input),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
  });

  it('builds mock output from real evidence codes without fake volume or keywords', () => {
    const input = limitedInput();
    const mock = buildMockMarketInsightOutput(input);
    const available = new Set(listMarketEvidenceItems(input.marketEvidence).map((item) => item.code));
    const used = [
      ...mock.keywordInsights,
      ...mock.contentInsights,
      ...mock.competitorInsights,
      ...mock.opportunityInsights,
      ...mock.strategicImplications,
    ].flatMap((item) => item.evidenceCodes);
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((code) => available.has(code))).toBe(true);
    expect(JSON.stringify(mock)).not.toMatch(/searchVolume|搜索量为|蓝海|行业平均|正在快速增长/);
    expect(mock.confidence).not.toBe('HIGH');
    expect(mock.dataLimitations.length).toBeGreaterThan(0);
    expect(parseModelJson(JSON.stringify(mock))).toMatchObject({ version: 'v1' });
  });
});
