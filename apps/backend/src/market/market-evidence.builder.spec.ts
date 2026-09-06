import { describe, expect, it } from 'vitest';
import { buildMarketDataQuality } from './market-data-quality.js';
import { buildMarketEvidence, evidenceWithoutGeneratedAt } from './market-evidence.builder.js';
import { MARKET_EVIDENCE_MAX_JSON_BYTES } from './market-evidence.constants.js';
import type { MarketEvidenceBuildInput } from './market-evidence.types.js';
import { normalizeMarketItems } from './market-normalizer.js';
import { buildMarketSampleStats } from './market-sample-stats.js';
import type { ProductBriefPayload } from './market.types.js';

const collectedAt = '2026-09-01T00:00:00.000Z';

const brief: ProductBriefPayload = {
  productName: '防脱精华',
  industry: '个护',
  businessGoal: '获客',
  seedKeywords: ['防脱', '头皮护理'],
  sellingPoints: ['植物防脱', '无人提及的专利成分'],
};

function fromItems(items: unknown[], queryContext: Record<string, unknown> = {}): MarketEvidenceBuildInput {
  const normalized = normalizeMarketItems({ items, collectedAt });
  return {
    marketResearchId: '11111111-1111-1111-1111-111111111111',
    marketResearchVersion: 1,
    snapshotId: '22222222-2222-2222-2222-222222222222',
    generatedAt: '2026-09-05T00:00:00.000Z',
    productBriefSnapshot: brief,
    queryContext,
    dataQuality: buildMarketDataQuality({ items: normalized.items, duplicateCount: normalized.duplicateCount }),
    sampleStats: buildMarketSampleStats(normalized.items),
    keywords: normalized.items.filter((item) => item.kind === 'KEYWORD'),
    contents: normalized.items.filter((item) => item.kind === 'CONTENT'),
    competitors: normalized.items.filter((item) => item.kind === 'COMPETITOR'),
    trends: normalized.items.filter((item) => item.kind === 'TREND'),
    audienceSignals: normalized.items.filter((item) => item.kind === 'AUDIENCE_SIGNAL'),
  };
}

function codes(items: { code: string }[]): string[] {
  return items.map((item) => item.code);
}

describe('buildMarketEvidence', () => {
  it('returns NONE / INSUFFICIENT_DATA for an empty snapshot', () => {
    const evidence = buildMarketEvidence(fromItems([]));
    expect(evidence.dataSufficiency).toBe('NONE');
    expect(evidence.confidence).toBe('LOW');
    expect(evidence.keywordEvidence).toEqual([]);
    expect(evidence.contentEvidence).toEqual([]);
    expect(evidence.competitorEvidence).toEqual([]);
    expect(evidence.trendEvidence).toEqual([]);
    expect(evidence.audienceEvidence).toEqual([]);
    expect(evidence.opportunityEvidence).toEqual([]);
    expect(evidence.dataQualityFlags).toContain('NO_DATA');
    expect(evidence.insufficientData?.evidenceKind).toBe('INSUFFICIENT_DATA');
  });

  it('keeps LIMITED snapshots conservative and is deterministic', () => {
    const items = [
      { kind: 'KEYWORD', platform: 'douyin', keyword: '防脱', relatedKeywords: ['掉发', '头皮'], volumeSignal: 'high', competitionSignal: 'low' },
      { kind: 'KEYWORD', platform: 'douyin', keyword: '洗发水', relatedKeywords: ['掉发'], volumeSignal: 'high', competitionSignal: 'high', searchRank: 3 },
      {
        kind: 'CONTENT',
        platform: 'douyin',
        title: 'A',
        author: 'acc-a',
        views: 100,
        likes: 10,
        comments: 2,
        shares: 1,
        favorites: 1,
        hashtags: ['防脱', '护理'],
        keywords: ['防脱'],
        durationSeconds: 20,
      },
      {
        kind: 'CONTENT',
        platform: 'douyin',
        title: 'B',
        author: 'acc-a',
        views: 300,
        likes: 12,
        comments: 3,
        shares: 2,
        favorites: 1,
        hashtags: ['防脱'],
        keywords: ['头皮'],
        durationSeconds: 45,
      },
      {
        kind: 'CONTENT',
        platform: 'douyin',
        title: 'C',
        author: 'acc-b',
        views: 200,
        likes: 8,
        comments: 1,
        shares: 1,
        favorites: 0,
        hashtags: ['护理'],
        durationSeconds: 80,
      },
      {
        kind: 'CONTENT',
        platform: 'douyin',
        title: 'D',
        views: 50,
        likes: 1,
        comments: 0,
        shares: 0,
        favorites: 0,
        hashtags: ['防脱'],
        durationSeconds: 15,
      },
      {
        kind: 'CONTENT',
        platform: 'douyin',
        title: 'E',
        views: 80,
        likes: 2,
        comments: 0,
        shares: 0,
        favorites: 0,
      },
      { kind: 'COMPETITOR', platform: 'douyin', displayName: '竞品A', followerCount: 1000, contentThemes: ['防脱'] },
      { kind: 'TREND', platform: 'douyin', name: '防脱热', rank: 2, heatSignal: 'high', category: '个护' },
      { kind: 'AUDIENCE_SIGNAL', platform: 'douyin', topic: '掉发', signalType: 'pain', frequency: 4, examples: ['头发稀疏', '头皮痒', '第三'] },
    ];
    const first = buildMarketEvidence(fromItems(items, { selectionMethod: 'UNKNOWN', collectedAtAssumed: true }));
    const second = buildMarketEvidence(fromItems(items, { selectionMethod: 'UNKNOWN', collectedAtAssumed: true }));
    expect(first.dataSufficiency).toBe('LIMITED');
    expect(first.confidence).not.toBe('HIGH');
    expect(first.keywordEvidence.every((item) => item.confidence !== 'HIGH')).toBe(true);
    expect(evidenceWithoutGeneratedAt(first)).toEqual(evidenceWithoutGeneratedAt(second));
    expect(codes(first.keywordEvidence)).toEqual([...codes(first.keywordEvidence)].sort((left, right) => codes(first.keywordEvidence).indexOf(left) - codes(first.keywordEvidence).indexOf(right)));
    expect(first.dataQualityFlags).toEqual(
      expect.arrayContaining(['LIMITED_DATA', 'MANUAL_ONLY', 'WEAK_IDENTITIES', 'COLLECTED_AT_ASSUMED', 'UNKNOWN_SELECTION_METHOD']),
    );
  });

  it('builds keyword evidence without inventing searchVolume', () => {
    const evidence = buildMarketEvidence(
      fromItems([
        { kind: 'KEYWORD', platform: 'douyin', keyword: '防脱', relatedKeywords: ['掉发'], volumeSignal: 'high', competitionSignal: 'low', searchRank: 1 },
        { kind: 'KEYWORD', platform: 'douyin', keyword: '头皮', relatedKeywords: ['掉发'], volumeSignal: 'medium', competitionSignal: 'high' },
      ]),
    );
    expect(codes(evidence.keywordEvidence)).toEqual(
      expect.arrayContaining([
        'KEYWORD_SAMPLE_SIZE',
        'TOP_REPEATED_RELATED_KEYWORDS',
        'SEARCH_RANK_PRESENT',
        'VOLUME_SIGNAL_DISTRIBUTION',
        'HIGH_VOLUME_SIGNAL_KEYWORDS',
        'HIGH_COMPETITION_SIGNAL_KEYWORDS',
        'LOW_COMPETITION_SIGNAL_KEYWORDS',
      ]),
    );
    expect(JSON.stringify(evidence)).not.toMatch(/searchVolume|搜索量|蓝海|行业平均|正在增长/);
  });

  it('reuses sample medians and only emits relative content patterns when sample is large enough', () => {
    const small = buildMarketEvidence(
      fromItems([
        { kind: 'CONTENT', platform: 'douyin', title: 'A', views: 100, likes: 10, comments: 2, shares: 1, favorites: 1 },
        { kind: 'CONTENT', platform: 'douyin', title: 'B', views: 200, likes: 4, comments: 1, shares: 1, favorites: 1 },
      ]),
    );
    expect(small.sampleSummary.medianViews).toBe(150);
    expect(small.sampleSummary.note).toBe('snapshot_sample_only');
    expect(codes(small.contentEvidence)).toContain('SAMPLE_MEDIANS');
    expect(codes(small.contentEvidence)).not.toContain('ABOVE_SAMPLE_MEDIAN_VIEWS');
    expect(small.dataQualityFlags).toContain('SMALL_CONTENT_SAMPLE');

    const largeItems = ['A', 'B', 'C', 'D', 'E'].map((title, index) => ({
      kind: 'CONTENT' as const,
      platform: 'douyin',
      title,
      author: index < 3 ? 'same-author' : `author-${index}`,
      views: (index + 1) * 100,
      likes: 10,
      comments: 2,
      shares: 1,
      favorites: 1,
      hashtags: ['防脱', index === 0 ? '护理' : '防脱'],
      keywords: ['防脱'],
      durationSeconds: index === 0 ? 15 : index === 1 ? 40 : 90,
    }));
    const large = buildMarketEvidence(fromItems(largeItems));
    expect(codes(large.contentEvidence)).toEqual(
      expect.arrayContaining([
        'ABOVE_SAMPLE_MEDIAN_VIEWS',
        'ABOVE_SAMPLE_MEDIAN_ENGAGEMENT',
        'TOP_SAMPLE_VIEWS_CONTENT',
        'HASHTAG_FREQUENCY',
        'CONTENT_KEYWORD_FREQUENCY',
        'AUTHOR_FREQUENCY',
        'DURATION_BUCKET_DISTRIBUTION',
      ]),
    );
    const topViews = large.contentEvidence.find((item) => item.code === 'TOP_SAMPLE_VIEWS_CONTENT');
    expect(topViews?.contentKeys?.[0]).toContain('e');
    expect(large.contentEvidence.find((item) => item.code === 'DURATION_BUCKET_DISTRIBUTION')?.params).toMatchObject({
      SHORT: 1,
      MEDIUM: 1,
      LONG: 3,
    });
  });

  it('handles missing content metrics without inventing engagement', () => {
    const evidence = buildMarketEvidence(
      fromItems([
        { kind: 'CONTENT', platform: 'douyin', title: 'zero', views: 0, likes: 10, comments: 1, shares: 0, favorites: 0 },
        { kind: 'CONTENT', platform: 'douyin', title: 'gap', views: 100 },
      ]),
    );
    expect(evidence.sampleSummary.medianEngagementRate).toBeNull();
    expect(codes(evidence.contentEvidence)).toContain('MISSING_CONTENT_METRICS');
    expect(evidence.dataQualityFlags).toContain('MISSING_METRICS');
  });

  it('builds competitor, trend and audience evidence without growth claims', () => {
    const evidence = buildMarketEvidence(
      fromItems([
        {
          kind: 'COMPETITOR',
          platform: 'douyin',
          displayName: '强账号',
          externalAccountId: 'acc-1',
          followerCount: 9000,
          recentPostCount: 12,
          postingFrequencySignal: 'high',
          engagementSignal: 'medium',
          contentThemes: ['防脱', '护理'],
        },
        {
          kind: 'COMPETITOR',
          platform: 'douyin',
          displayName: '弱身份',
          followerCount: 100,
          contentThemes: ['防脱'],
        },
        { kind: 'TREND', platform: 'douyin', name: '话题A', rank: 1, heatSignal: 'high', category: '个护', startedAt: '2026-08-01T00:00:00.000Z' },
        { kind: 'TREND', platform: 'douyin', name: '话题B', rank: 3, heatSignal: 'low', category: '个护' },
        { kind: 'AUDIENCE_SIGNAL', platform: 'douyin', topic: '掉发', signalType: 'pain', frequency: 5, examples: ['头发稀疏', '头皮痒'] },
        { kind: 'AUDIENCE_SIGNAL', platform: 'douyin', topic: '掉发', signalType: 'need', frequency: 2, examples: ['想了解成分'] },
      ]),
    );
    expect(codes(evidence.competitorEvidence)).toEqual(
      expect.arrayContaining([
        'COMPETITOR_SAMPLE_SIZE',
        'FOLLOWER_COUNT_DISTRIBUTION',
        'CONTENT_THEME_FREQUENCY',
        'TOP_FOLLOWER_COUNT_IN_SAMPLE',
        'WEAK_COMPETITOR_IDENTITY_COUNT',
      ]),
    );
    expect(evidence.competitorEvidence.find((item) => item.code === 'WEAK_COMPETITOR_IDENTITY_COUNT')?.confidence).toBe('LOW');
    expect(codes(evidence.trendEvidence)).toEqual(
      expect.arrayContaining(['TREND_SAMPLE_SIZE', 'TOP_RANKED_TRENDS', 'HEAT_SIGNAL_DISTRIBUTION', 'TREND_CATEGORY_FREQUENCY']),
    );
    expect(JSON.stringify(evidence.trendEvidence)).not.toMatch(/GROWING|DECLINING|正在上升/);
    const topics = evidence.audienceEvidence.find((item) => item.code === 'TOP_REPEATED_TOPICS');
    expect(topics?.examples).toHaveLength(2);
    expect(JSON.stringify(evidence.audienceEvidence)).not.toMatch(/username|userId|profileUrl/);
  });

  it('marks opportunity evidence as INFERRED and never uses blue-ocean language', () => {
    const evidence = buildMarketEvidence(
      fromItems([
        { kind: 'KEYWORD', platform: 'douyin', keyword: '防脱', volumeSignal: 'high', competitionSignal: 'low' },
        { kind: 'KEYWORD', platform: 'douyin', keyword: '头皮护理', volumeSignal: 'medium', competitionSignal: 'medium' },
      ]),
    );
    expect(codes(evidence.opportunityEvidence)).toEqual(
      expect.arrayContaining([
        'PRODUCT_MARKET_KEYWORD_OVERLAP',
        'LOW_SAMPLE_COVERAGE_FOR_SELLING_POINT',
        'HIGH_VOLUME_LOW_COMPETITION_SIGNAL',
      ]),
    );
    expect(evidence.opportunityEvidence.every((item) => item.evidenceKind === 'INFERRED')).toBe(true);
    expect(JSON.stringify(evidence.opportunityEvidence)).not.toMatch(/蓝海|市场空白|抖音没人做/);
  });

  it('flags IMPORT_ONLY from snapshot quality and caps arrays / JSON size', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      kind: 'KEYWORD' as const,
      platform: 'douyin',
      source: 'IMPORT' as const,
      keyword: `词${index}`,
      relatedKeywords: ['重复词', `相关${index}`],
      volumeSignal: 'high' as const,
      competitionSignal: index % 2 === 0 ? ('low' as const) : ('high' as const),
    }));
    const evidence = buildMarketEvidence(fromItems(items, { selectionMethod: 'THIRD_PARTY_EXPORT' }));
    expect(evidence.dataQualityFlags).toContain('IMPORT_ONLY');
    expect(evidence.keywordEvidence.length).toBeLessThanOrEqual(10);
    expect(evidence.keywordEvidence.every((item) => (item.keywordKeys?.length ?? 0) <= 5)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(evidence), 'utf8')).toBeLessThanOrEqual(MARKET_EVIDENCE_MAX_JSON_BYTES);
  });
});
