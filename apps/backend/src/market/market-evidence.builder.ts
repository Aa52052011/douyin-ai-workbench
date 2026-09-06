import { normalizeMarketToken } from './market-canonical-key.js';
import {
  MARKET_EVIDENCE_CODES,
  MARKET_EVIDENCE_DURATION_BUCKETS,
  MARKET_EVIDENCE_LIMITS,
  MARKET_EVIDENCE_MAX_JSON_BYTES,
  MARKET_EVIDENCE_MIN_CONTENT_FOR_PATTERN,
  MARKET_EVIDENCE_MIN_FREQUENCY,
  MARKET_EVIDENCE_VERSION,
  type MarketEvidenceCode,
  type MarketEvidenceFlag,
} from './market-evidence.constants.js';
import type {
  MarketEvidence,
  MarketEvidenceBuildInput,
  MarketEvidenceItem,
  MarketEvidenceItemKind,
} from './market-evidence.types.js';
import { contentSampleEngagementRate } from './market-sample-stats.js';
import type {
  MarketConfidence,
  MarketDataQuality,
  MarketSourceValue,
  NormalizedCompetitorItem,
  NormalizedContentItem,
  NormalizedKeywordItem,
} from './market.types.js';

const CODE_ORDER = new Map(MARKET_EVIDENCE_CODES.map((code, index) => [code, index]));
const CONFIDENCE_RANK: Record<MarketConfidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export function buildMarketEvidence(input: MarketEvidenceBuildInput): MarketEvidence {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const quality = input.dataQuality;
  const snapshotCap = snapshotConfidenceCap(quality);
  const flags = buildFlags(input);
  const base: MarketEvidence = {
    version: MARKET_EVIDENCE_VERSION,
    marketResearchId: input.marketResearchId,
    marketResearchVersion: input.marketResearchVersion,
    snapshotId: input.snapshotId,
    generatedAt,
    dataSufficiency: quality.dataSufficiency,
    confidence: quality.confidence,
    sourceSummary: {
      sources: [...quality.sources].sort(),
      manualOnly: quality.manualOnly,
      importOnly: quality.importOnly,
    },
    sampleSummary: {
      ...input.sampleStats,
      total: quality.sampleSize.total,
    },
    keywordEvidence: [],
    contentEvidence: [],
    competitorEvidence: [],
    trendEvidence: [],
    audienceEvidence: [],
    opportunityEvidence: [],
    dataQualityFlags: flags,
  };

  if (quality.dataSufficiency === 'NONE' || quality.sampleSize.total === 0) {
    base.insufficientData = makeItem({
      code: 'INSUFFICIENT_DATA',
      evidenceKind: 'INSUFFICIENT_DATA',
      supportCount: 0,
      sampleSize: 0,
      confidence: 'LOW',
    });
    return compactEvidence(base);
  }

  const ctx = { cap: snapshotCap, quality };
  base.keywordEvidence = sortItems(buildKeywordEvidence(input.keywords, ctx));
  base.contentEvidence = sortItems(buildContentEvidence(input.contents, input.sampleStats, ctx));
  base.competitorEvidence = sortItems(buildCompetitorEvidence(input.competitors, ctx));
  base.trendEvidence = sortItems(buildTrendEvidence(input.trends, ctx));
  base.audienceEvidence = sortItems(buildAudienceEvidence(input.audienceSignals, ctx));
  base.opportunityEvidence = sortItems(
    buildOpportunityEvidence(input.keywords, input.contents, input.productBriefSnapshot, ctx),
  );
  return compactEvidence(base);
}

function snapshotConfidenceCap(quality: MarketDataQuality): MarketConfidence {
  if (quality.dataSufficiency !== 'USABLE') {
    return quality.confidence === 'HIGH' ? 'MEDIUM' : quality.confidence;
  }
  return quality.confidence;
}

function capConfidence(value: MarketConfidence, cap: MarketConfidence): MarketConfidence {
  return CONFIDENCE_RANK[value] <= CONFIDENCE_RANK[cap] ? value : cap;
}

function inferConfidence(supportCount: number, cap: MarketConfidence): MarketConfidence {
  if (supportCount >= 5) {
    return capConfidence('HIGH', cap);
  }
  if (supportCount >= 3) {
    return capConfidence('MEDIUM', cap);
  }
  return capConfidence('LOW', cap);
}

function makeItem(
  item: Omit<MarketEvidenceItem, 'confidence'> & { confidence?: MarketConfidence },
  cap: MarketConfidence = 'LOW',
): MarketEvidenceItem {
  const next: MarketEvidenceItem = {
    ...item,
    confidence: capConfidence(item.confidence ?? inferConfidence(item.supportCount, cap), cap),
  };
  if (next.sourceKinds) {
    next.sourceKinds = [...new Set(next.sourceKinds)].sort();
  }
  return next;
}

function sourcesOf(items: { source: MarketSourceValue }[]): MarketSourceValue[] {
  return [...new Set(items.map((item) => item.source))].sort();
}

function sortItems(items: MarketEvidenceItem[]): MarketEvidenceItem[] {
  return [...items].sort((left, right) => {
    const codeDiff = (CODE_ORDER.get(left.code) ?? 99) - (CODE_ORDER.get(right.code) ?? 99);
    if (codeDiff !== 0) {
      return codeDiff;
    }
    if (right.supportCount !== left.supportCount) {
      return right.supportCount - left.supportCount;
    }
    return left.code.localeCompare(right.code);
  });
}

function frequencyMap(values: string[]): Map<string, { key: string; count: number; refs: string[] }> {
  const map = new Map<string, { key: string; count: number; refs: string[] }>();
  for (const raw of values) {
    const key = normalizeMarketToken(raw);
    if (!key) {
      continue;
    }
    const current = map.get(key) ?? { key, count: 0, refs: [] };
    current.count += 1;
    map.set(key, current);
  }
  return map;
}

function topFrequency(
  map: Map<string, { key: string; count: number; refs: string[] }>,
  minCount = MARKET_EVIDENCE_MIN_FREQUENCY,
): { key: string; count: number; refs: string[] }[] {
  return [...map.values()]
    .filter((entry) => entry.count >= minCount)
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, MARKET_EVIDENCE_LIMITS.topN);
}

function signalDistribution(values: Array<string | null>): Record<string, number> {
  const next = { low: 0, medium: 0, high: 0, missing: 0 };
  for (const value of values) {
    if (value === 'low' || value === 'medium' || value === 'high') {
      next[value] += 1;
    } else {
      next.missing += 1;
    }
  }
  return next;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function durationBucket(seconds: number): 'SHORT' | 'MEDIUM' | 'LONG' {
  if (seconds <= MARKET_EVIDENCE_DURATION_BUCKETS.SHORT_MAX) {
    return 'SHORT';
  }
  if (seconds <= MARKET_EVIDENCE_DURATION_BUCKETS.MEDIUM_MAX) {
    return 'MEDIUM';
  }
  return 'LONG';
}

function isWeakContent(item: NormalizedContentItem): boolean {
  return !item.externalContentId && !item.externalUrl && !item.title && !item.author && !item.publishedAt;
}

function isWeakCompetitor(item: NormalizedCompetitorItem): boolean {
  return !item.externalAccountId && !item.profileUrl;
}

function buildFlags(input: MarketEvidenceBuildInput): MarketEvidenceFlag[] {
  const flags: MarketEvidenceFlag[] = [];
  const quality = input.dataQuality;
  if (quality.dataSufficiency === 'NONE' || quality.sampleSize.total === 0) {
    flags.push('NO_DATA');
  }
  if (quality.dataSufficiency === 'LIMITED') {
    flags.push('LIMITED_DATA');
  }
  if (quality.manualOnly) {
    flags.push('MANUAL_ONLY');
  }
  if (quality.importOnly) {
    flags.push('IMPORT_ONLY');
  }
  if (quality.missingFieldRate > 0 || input.contents.some((item) => item.metrics.views == null)) {
    flags.push('MISSING_METRICS');
  }
  if (input.contents.some(isWeakContent) || input.competitors.some(isWeakCompetitor)) {
    flags.push('WEAK_IDENTITIES');
  }
  if (input.contents.length > 0 && input.contents.length < MARKET_EVIDENCE_MIN_CONTENT_FOR_PATTERN) {
    flags.push('SMALL_CONTENT_SAMPLE');
  }
  if (input.keywords.length > 0 && input.keywords.length < MARKET_EVIDENCE_MIN_CONTENT_FOR_PATTERN) {
    flags.push('SMALL_KEYWORD_SAMPLE');
  }
  const context = isRecord(input.queryContext) ? input.queryContext : {};
  if (context.collectedAtAssumed === true) {
    flags.push('COLLECTED_AT_ASSUMED');
  }
  if (context.selectionMethod === 'UNKNOWN') {
    flags.push('UNKNOWN_SELECTION_METHOD');
  }
  return flags;
}

function buildKeywordEvidence(
  keywords: NormalizedKeywordItem[],
  ctx: { cap: MarketConfidence },
): MarketEvidenceItem[] {
  const items: MarketEvidenceItem[] = [];
  items.push(
    makeItem(
      {
        code: 'KEYWORD_SAMPLE_SIZE',
        evidenceKind: 'DATA_BACKED',
        metric: 'keywordCount',
        value: keywords.length,
        supportCount: keywords.length,
        sampleSize: keywords.length,
        sourceKinds: sourcesOf(keywords),
      },
      ctx.cap,
    ),
  );
  if (keywords.length === 0) {
    return items;
  }

  const related = keywords.flatMap((item) => item.relatedKeywords.map((word) => ({ word, key: item.canonicalKey })));
  const relatedMap = frequencyMap(related.map((entry) => entry.word));
  for (const entry of related) {
    const current = relatedMap.get(normalizeMarketToken(entry.word));
    if (current && current.refs.length < MARKET_EVIDENCE_LIMITS.keywordKeys) {
      current.refs.push(entry.key);
    }
  }
  const repeated = topFrequency(relatedMap);
  if (repeated.length > 0) {
    items.push(
      makeItem(
        {
          code: 'TOP_REPEATED_RELATED_KEYWORDS',
          evidenceKind: 'DATA_BACKED',
          params: Object.fromEntries(repeated.map((entry) => [entry.key, entry.count])),
          supportCount: repeated.reduce((sum, entry) => sum + entry.count, 0),
          sampleSize: keywords.length,
          sourceKinds: sourcesOf(keywords),
          keywordKeys: uniqueKeys(repeated.flatMap((entry) => entry.refs), MARKET_EVIDENCE_LIMITS.keywordKeys),
        },
        ctx.cap,
      ),
    );
  }

  const ranked = keywords.filter((item) => item.searchRank != null);
  if (ranked.length > 0) {
    items.push(
      makeItem(
        {
          code: 'SEARCH_RANK_PRESENT',
          evidenceKind: 'DATA_BACKED',
          metric: 'searchRankPresentCount',
          value: ranked.length,
          supportCount: ranked.length,
          sampleSize: keywords.length,
          sourceKinds: sourcesOf(ranked),
          keywordKeys: uniqueKeys(ranked.map((item) => item.canonicalKey), MARKET_EVIDENCE_LIMITS.keywordKeys),
        },
        ctx.cap,
      ),
    );
  }

  const volume = signalDistribution(keywords.map((item) => item.volumeSignal));
  items.push(
    makeItem(
      {
        code: 'VOLUME_SIGNAL_DISTRIBUTION',
        evidenceKind: 'DATA_BACKED',
        params: volume,
        supportCount: keywords.length - volume.missing,
        sampleSize: keywords.length,
        sourceKinds: sourcesOf(keywords),
      },
      ctx.cap,
    ),
  );
  const competition = signalDistribution(keywords.map((item) => item.competitionSignal));
  items.push(
    makeItem(
      {
        code: 'COMPETITION_SIGNAL_DISTRIBUTION',
        evidenceKind: 'DATA_BACKED',
        params: competition,
        supportCount: keywords.length - competition.missing,
        sampleSize: keywords.length,
        sourceKinds: sourcesOf(keywords),
      },
      ctx.cap,
    ),
  );

  pushSignalGroup(items, keywords, 'volumeSignal', 'high', 'HIGH_VOLUME_SIGNAL_KEYWORDS', ctx.cap);
  pushSignalGroup(items, keywords, 'competitionSignal', 'high', 'HIGH_COMPETITION_SIGNAL_KEYWORDS', ctx.cap);
  pushSignalGroup(items, keywords, 'competitionSignal', 'low', 'LOW_COMPETITION_SIGNAL_KEYWORDS', ctx.cap);
  return items;
}

function pushSignalGroup(
  items: MarketEvidenceItem[],
  keywords: NormalizedKeywordItem[],
  field: 'volumeSignal' | 'competitionSignal',
  signal: 'low' | 'medium' | 'high',
  code: MarketEvidenceCode,
  cap: MarketConfidence,
): void {
  const matched = keywords.filter((item) => item[field] === signal);
  if (matched.length === 0) {
    return;
  }
  items.push(
    makeItem(
      {
        code,
        evidenceKind: 'DATA_BACKED',
        metric: field,
        value: signal,
        supportCount: matched.length,
        sampleSize: keywords.length,
        sourceKinds: sourcesOf(matched),
        keywordKeys: uniqueKeys(matched.map((item) => item.canonicalKey), MARKET_EVIDENCE_LIMITS.keywordKeys),
      },
      cap,
    ),
  );
}

function buildContentEvidence(
  contents: NormalizedContentItem[],
  sampleStats: MarketEvidenceBuildInput['sampleStats'],
  ctx: { cap: MarketConfidence },
): MarketEvidenceItem[] {
  const items: MarketEvidenceItem[] = [
    makeItem(
      {
        code: 'CONTENT_SAMPLE_SIZE',
        evidenceKind: 'DATA_BACKED',
        metric: 'contentCount',
        value: contents.length,
        supportCount: contents.length,
        sampleSize: contents.length,
        sourceKinds: sourcesOf(contents),
      },
      ctx.cap,
    ),
  ];
  if (contents.length === 0) {
    return items;
  }

  if (sampleStats.medianViews != null || sampleStats.medianEngagementRate != null) {
    items.push(
      makeItem(
        {
          code: 'SAMPLE_MEDIANS',
          evidenceKind: 'DATA_BACKED',
          params: {
            medianViews: sampleStats.medianViews,
            medianEngagementRate: sampleStats.medianEngagementRate,
          },
          supportCount: contents.filter((item) => item.metrics.views != null || contentSampleEngagementRate(item) != null)
            .length,
          sampleSize: contents.length,
          sourceKinds: sourcesOf(contents),
        },
        ctx.cap,
      ),
    );
  }

  const missingMetrics = contents.filter(
    (item) =>
      item.metrics.views == null ||
      item.metrics.likes == null ||
      item.metrics.comments == null ||
      item.metrics.shares == null ||
      item.metrics.favorites == null,
  );
  if (missingMetrics.length > 0) {
    items.push(
      makeItem(
        {
          code: 'MISSING_CONTENT_METRICS',
          evidenceKind: 'DATA_BACKED',
          value: missingMetrics.length,
          supportCount: missingMetrics.length,
          sampleSize: contents.length,
          sourceKinds: sourcesOf(missingMetrics),
        },
        ctx.cap,
      ),
    );
  }

  if (contents.length < MARKET_EVIDENCE_MIN_CONTENT_FOR_PATTERN) {
    return items;
  }

  const aboveViews = contents.filter(
    (item) => sampleStats.medianViews != null && item.metrics.views != null && item.metrics.views > sampleStats.medianViews,
  );
  if (aboveViews.length > 0) {
    items.push(
      makeItem(
        {
          code: 'ABOVE_SAMPLE_MEDIAN_VIEWS',
          evidenceKind: 'DATA_BACKED',
          metric: 'views',
          supportCount: aboveViews.length,
          sampleSize: contents.length,
          sourceKinds: sourcesOf(aboveViews),
          contentKeys: uniqueKeys(
            sortByMetric(aboveViews, (item) => item.metrics.views ?? -1).map((item) => item.canonicalKey),
            MARKET_EVIDENCE_LIMITS.contentKeys,
          ),
        },
        ctx.cap,
      ),
    );
  }

  const withEngagement = contents
    .map((item) => ({ item, rate: contentSampleEngagementRate(item) }))
    .filter((entry): entry is { item: NormalizedContentItem; rate: number } => entry.rate != null);
  const aboveEngagement = withEngagement.filter(
    (entry) => sampleStats.medianEngagementRate != null && entry.rate > sampleStats.medianEngagementRate,
  );
  if (aboveEngagement.length > 0) {
    items.push(
      makeItem(
        {
          code: 'ABOVE_SAMPLE_MEDIAN_ENGAGEMENT',
          evidenceKind: 'DATA_BACKED',
          metric: 'engagementRate',
          supportCount: aboveEngagement.length,
          sampleSize: contents.length,
          sourceKinds: sourcesOf(aboveEngagement.map((entry) => entry.item)),
          contentKeys: uniqueKeys(
            sortByMetric(aboveEngagement, (entry) => entry.rate).map((entry) => entry.item.canonicalKey),
            MARKET_EVIDENCE_LIMITS.contentKeys,
          ),
        },
        ctx.cap,
      ),
    );
  }

  const topViews = sortByMetric(
    contents.filter((item) => item.metrics.views != null),
    (item) => item.metrics.views ?? -1,
  ).slice(0, MARKET_EVIDENCE_LIMITS.topN);
  if (topViews.length > 0) {
    items.push(
      makeItem(
        {
          code: 'TOP_SAMPLE_VIEWS_CONTENT',
          evidenceKind: 'DATA_BACKED',
          metric: 'views',
          supportCount: topViews.length,
          sampleSize: contents.length,
          sourceKinds: sourcesOf(topViews),
          contentKeys: uniqueKeys(topViews.map((item) => item.canonicalKey), MARKET_EVIDENCE_LIMITS.contentKeys),
        },
        ctx.cap,
      ),
    );
  }
  const topEngagement = sortByMetric(withEngagement, (entry) => entry.rate).slice(0, MARKET_EVIDENCE_LIMITS.topN);
  if (topEngagement.length > 0) {
    items.push(
      makeItem(
        {
          code: 'TOP_SAMPLE_ENGAGEMENT_CONTENT',
          evidenceKind: 'DATA_BACKED',
          metric: 'engagementRate',
          supportCount: topEngagement.length,
          sampleSize: contents.length,
          sourceKinds: sourcesOf(topEngagement.map((entry) => entry.item)),
          contentKeys: uniqueKeys(
            topEngagement.map((entry) => entry.item.canonicalKey),
            MARKET_EVIDENCE_LIMITS.contentKeys,
          ),
        },
        ctx.cap,
      ),
    );
  }

  pushTokenFrequency(
    items,
    contents.flatMap((item) => item.hashtags.map((tag) => ({ token: tag, key: item.canonicalKey }))),
    contents,
    'HASHTAG_FREQUENCY',
    ctx.cap,
  );
  pushTokenFrequency(
    items,
    contents.flatMap((item) => item.keywords.map((word) => ({ token: word, key: item.canonicalKey }))),
    contents,
    'CONTENT_KEYWORD_FREQUENCY',
    ctx.cap,
  );
  pushTokenFrequency(
    items,
    contents.filter((item) => item.author).map((item) => ({ token: item.author as string, key: item.canonicalKey })),
    contents,
    'AUTHOR_FREQUENCY',
    ctx.cap,
  );

  const timed = contents.filter((item) => item.durationSeconds != null);
  if (timed.length >= 3) {
    const buckets = { SHORT: 0, MEDIUM: 0, LONG: 0 };
    for (const item of timed) {
      buckets[durationBucket(item.durationSeconds!)] += 1;
    }
    items.push(
      makeItem(
        {
          code: 'DURATION_BUCKET_DISTRIBUTION',
          evidenceKind: 'DATA_BACKED',
          params: buckets,
          supportCount: timed.length,
          sampleSize: contents.length,
          sourceKinds: sourcesOf(timed),
        },
        ctx.cap,
      ),
    );
  }
  return items;
}

function pushTokenFrequency(
  items: MarketEvidenceItem[],
  pairs: { token: string; key: string }[],
  contents: NormalizedContentItem[],
  code: MarketEvidenceCode,
  cap: MarketConfidence,
): void {
  const map = frequencyMap(pairs.map((pair) => pair.token));
  for (const pair of pairs) {
    const current = map.get(normalizeMarketToken(pair.token));
    if (current && current.refs.length < MARKET_EVIDENCE_LIMITS.contentKeys) {
      current.refs.push(pair.key);
    }
  }
  const top = topFrequency(map);
  if (top.length === 0) {
    return;
  }
  items.push(
    makeItem(
      {
        code,
        evidenceKind: 'DATA_BACKED',
        params: Object.fromEntries(top.map((entry) => [entry.key, entry.count])),
        supportCount: top.reduce((sum, entry) => sum + entry.count, 0),
        sampleSize: contents.length,
        sourceKinds: sourcesOf(contents),
        contentKeys: uniqueKeys(top.flatMap((entry) => entry.refs), MARKET_EVIDENCE_LIMITS.contentKeys),
      },
      cap,
    ),
  );
}

function buildCompetitorEvidence(
  competitors: NormalizedCompetitorItem[],
  ctx: { cap: MarketConfidence },
): MarketEvidenceItem[] {
  const items: MarketEvidenceItem[] = [
    makeItem(
      {
        code: 'COMPETITOR_SAMPLE_SIZE',
        evidenceKind: 'DATA_BACKED',
        metric: 'competitorCount',
        value: competitors.length,
        supportCount: competitors.length,
        sampleSize: competitors.length,
        sourceKinds: sourcesOf(competitors),
      },
      ctx.cap,
    ),
  ];
  if (competitors.length === 0) {
    return items;
  }

  pushNumericDistribution(
    items,
    competitors,
    (item) => item.followerCount,
    'FOLLOWER_COUNT_DISTRIBUTION',
    'followerCount',
    ctx.cap,
  );
  pushNumericDistribution(
    items,
    competitors,
    (item) => item.recentPostCount,
    'RECENT_POST_COUNT_DISTRIBUTION',
    'recentPostCount',
    ctx.cap,
  );
  items.push(
    makeItem(
      {
        code: 'POSTING_FREQUENCY_SIGNAL_DISTRIBUTION',
        evidenceKind: 'DATA_BACKED',
        params: signalDistribution(competitors.map((item) => item.postingFrequencySignal)),
        supportCount: competitors.filter((item) => item.postingFrequencySignal != null).length,
        sampleSize: competitors.length,
        sourceKinds: sourcesOf(competitors),
      },
      ctx.cap,
    ),
  );
  items.push(
    makeItem(
      {
        code: 'ENGAGEMENT_SIGNAL_DISTRIBUTION',
        evidenceKind: 'DATA_BACKED',
        params: signalDistribution(competitors.map((item) => item.engagementSignal)),
        supportCount: competitors.filter((item) => item.engagementSignal != null).length,
        sampleSize: competitors.length,
        sourceKinds: sourcesOf(competitors),
      },
      ctx.cap,
    ),
  );

  const themes = competitors.flatMap((item) => item.contentThemes.map((theme) => ({ token: theme, key: item.canonicalKey })));
  const themeMap = frequencyMap(themes.map((entry) => entry.token));
  for (const entry of themes) {
    const current = themeMap.get(normalizeMarketToken(entry.token));
    if (current && current.refs.length < MARKET_EVIDENCE_LIMITS.competitorKeys) {
      current.refs.push(entry.key);
    }
  }
  const topThemes = topFrequency(themeMap);
  if (topThemes.length > 0) {
    items.push(
      makeItem(
        {
          code: 'CONTENT_THEME_FREQUENCY',
          evidenceKind: 'DATA_BACKED',
          params: Object.fromEntries(topThemes.map((entry) => [entry.key, entry.count])),
          supportCount: topThemes.reduce((sum, entry) => sum + entry.count, 0),
          sampleSize: competitors.length,
          sourceKinds: sourcesOf(competitors),
          competitorKeys: uniqueKeys(topThemes.flatMap((entry) => entry.refs), MARKET_EVIDENCE_LIMITS.competitorKeys),
        },
        ctx.cap,
      ),
    );
  }

  const withFollowers = sortByMetric(
    competitors.filter((item) => item.followerCount != null),
    (item) => item.followerCount ?? -1,
  ).slice(0, MARKET_EVIDENCE_LIMITS.topN);
  if (withFollowers.length > 0) {
    items.push(
      makeItem(
        {
          code: 'TOP_FOLLOWER_COUNT_IN_SAMPLE',
          evidenceKind: 'DATA_BACKED',
          metric: 'followerCount',
          supportCount: withFollowers.length,
          sampleSize: competitors.length,
          sourceKinds: sourcesOf(withFollowers),
          competitorKeys: uniqueKeys(withFollowers.map((item) => item.canonicalKey), MARKET_EVIDENCE_LIMITS.competitorKeys),
        },
        ctx.cap,
      ),
    );
  }

  const weak = competitors.filter(isWeakCompetitor);
  if (weak.length > 0) {
    items.push(
      makeItem(
        {
          code: 'WEAK_COMPETITOR_IDENTITY_COUNT',
          evidenceKind: 'DATA_BACKED',
          value: weak.length,
          supportCount: weak.length,
          sampleSize: competitors.length,
          confidence: 'LOW',
          sourceKinds: sourcesOf(weak),
        },
        ctx.cap,
      ),
    );
  }
  return items;
}

function pushNumericDistribution(
  items: MarketEvidenceItem[],
  competitors: NormalizedCompetitorItem[],
  read: (item: NormalizedCompetitorItem) => number | null,
  code: MarketEvidenceCode,
  metric: string,
  cap: MarketConfidence,
): void {
  const values = competitors.map(read).filter((value): value is number => value != null);
  if (values.length === 0) {
    return;
  }
  const sorted = [...values].sort((left, right) => left - right);
  items.push(
    makeItem(
      {
        code,
        evidenceKind: 'DATA_BACKED',
        metric,
        params: {
          min: sorted[0]!,
          max: sorted[sorted.length - 1]!,
          median: median(sorted) ?? 0,
          present: values.length,
        },
        supportCount: values.length,
        sampleSize: competitors.length,
        sourceKinds: sourcesOf(competitors),
      },
      cap,
    ),
  );
}

function buildTrendEvidence(
  trends: MarketEvidenceBuildInput['trends'],
  ctx: { cap: MarketConfidence },
): MarketEvidenceItem[] {
  const items: MarketEvidenceItem[] = [
    makeItem(
      {
        code: 'TREND_SAMPLE_SIZE',
        evidenceKind: 'DATA_BACKED',
        metric: 'trendCount',
        value: trends.length,
        supportCount: trends.length,
        sampleSize: trends.length,
        sourceKinds: sourcesOf(trends),
      },
      ctx.cap,
    ),
  ];
  if (trends.length === 0) {
    return items;
  }

  const ranked = [...trends]
    .filter((item) => item.rank != null)
    .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0) || left.canonicalKey.localeCompare(right.canonicalKey))
    .slice(0, MARKET_EVIDENCE_LIMITS.topN);
  if (ranked.length > 0) {
    items.push(
      makeItem(
        {
          code: 'TOP_RANKED_TRENDS',
          evidenceKind: 'DATA_BACKED',
          metric: 'rank',
          supportCount: ranked.length,
          sampleSize: trends.length,
          sourceKinds: sourcesOf(ranked),
          trendKeys: uniqueKeys(ranked.map((item) => item.canonicalKey), MARKET_EVIDENCE_LIMITS.trendKeys),
        },
        ctx.cap,
      ),
    );
  }

  const heat = signalDistribution(trends.map((item) => item.heatSignal));
  if (heat.low + heat.medium + heat.high > 0) {
    items.push(
      makeItem(
        {
          code: 'HEAT_SIGNAL_DISTRIBUTION',
          evidenceKind: 'DATA_BACKED',
          params: heat,
          supportCount: trends.length - heat.missing,
          sampleSize: trends.length,
          sourceKinds: sourcesOf(trends),
        },
        ctx.cap,
      ),
    );
  }

  const categories = trends.filter((item) => item.category).map((item) => ({ token: item.category as string, key: item.canonicalKey }));
  const categoryMap = frequencyMap(categories.map((entry) => entry.token));
  for (const entry of categories) {
    const current = categoryMap.get(normalizeMarketToken(entry.token));
    if (current && current.refs.length < MARKET_EVIDENCE_LIMITS.trendKeys) {
      current.refs.push(entry.key);
    }
  }
  const topCategories = topFrequency(categoryMap, 1);
  if (topCategories.length > 0) {
    items.push(
      makeItem(
        {
          code: 'TREND_CATEGORY_FREQUENCY',
          evidenceKind: 'DATA_BACKED',
          params: Object.fromEntries(topCategories.map((entry) => [entry.key, entry.count])),
          supportCount: categories.length,
          sampleSize: trends.length,
          sourceKinds: sourcesOf(trends),
          trendKeys: uniqueKeys(topCategories.flatMap((entry) => entry.refs), MARKET_EVIDENCE_LIMITS.trendKeys),
        },
        ctx.cap,
      ),
    );
  }
  return items;
}

function buildAudienceEvidence(
  signals: MarketEvidenceBuildInput['audienceSignals'],
  ctx: { cap: MarketConfidence },
): MarketEvidenceItem[] {
  const items: MarketEvidenceItem[] = [
    makeItem(
      {
        code: 'AUDIENCE_SIGNAL_SAMPLE_SIZE',
        evidenceKind: 'DATA_BACKED',
        metric: 'audienceSignalCount',
        value: signals.length,
        supportCount: signals.length,
        sampleSize: signals.length,
        sourceKinds: sourcesOf(signals),
      },
      ctx.cap,
    ),
  ];
  if (signals.length === 0) {
    return items;
  }

  const topicPairs = signals.map((item) => ({ token: item.topic, key: item.canonicalKey }));
  const topicMap = frequencyMap(topicPairs.map((entry) => entry.token));
  for (const entry of topicPairs) {
    const current = topicMap.get(normalizeMarketToken(entry.token));
    if (current && current.refs.length < MARKET_EVIDENCE_LIMITS.audienceKeys) {
      current.refs.push(entry.key);
    }
  }
  const topTopics = topFrequency(topicMap, 1);
  items.push(
    makeItem(
      {
        code: 'TOP_REPEATED_TOPICS',
        evidenceKind: 'DATA_BACKED',
        params: Object.fromEntries(topTopics.map((entry) => [entry.key, entry.count])),
        supportCount: signals.length,
        sampleSize: signals.length,
        sourceKinds: sourcesOf(signals),
        audienceKeys: uniqueKeys(topTopics.flatMap((entry) => entry.refs), MARKET_EVIDENCE_LIMITS.audienceKeys),
        examples: uniqueKeys(signals.flatMap((item) => item.examples), MARKET_EVIDENCE_LIMITS.examples),
      },
      ctx.cap,
    ),
  );

  const typeMap = frequencyMap(signals.map((item) => item.signalType));
  items.push(
    makeItem(
      {
        code: 'SIGNAL_TYPE_DISTRIBUTION',
        evidenceKind: 'DATA_BACKED',
        params: Object.fromEntries(
          [...typeMap.values()]
            .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
            .map((entry) => [entry.key, entry.count]),
        ),
        supportCount: signals.length,
        sampleSize: signals.length,
        sourceKinds: sourcesOf(signals),
      },
      ctx.cap,
    ),
  );

  const withFrequency = [...signals]
    .filter((item) => item.frequency != null)
    .sort((left, right) => (right.frequency ?? 0) - (left.frequency ?? 0) || left.canonicalKey.localeCompare(right.canonicalKey))
    .slice(0, MARKET_EVIDENCE_LIMITS.topN);
  if (withFrequency.length > 0) {
    items.push(
      makeItem(
        {
          code: 'FREQUENCY_RANKING',
          evidenceKind: 'DATA_BACKED',
          metric: 'frequency',
          supportCount: withFrequency.length,
          sampleSize: signals.length,
          sourceKinds: sourcesOf(withFrequency),
          audienceKeys: uniqueKeys(withFrequency.map((item) => item.canonicalKey), MARKET_EVIDENCE_LIMITS.audienceKeys),
        },
        ctx.cap,
      ),
    );
  }
  return items;
}

function buildOpportunityEvidence(
  keywords: NormalizedKeywordItem[],
  contents: NormalizedContentItem[],
  brief: MarketEvidenceBuildInput['productBriefSnapshot'],
  ctx: { cap: MarketConfidence },
): MarketEvidenceItem[] {
  const items: MarketEvidenceItem[] = [];
  const marketKeywordTokens = new Set(
    keywords.flatMap((item) => [normalizeMarketToken(item.keyword), ...item.relatedKeywords.map(normalizeMarketToken)]),
  );
  const contentTokens = new Set(
    contents.flatMap((item) => [...item.hashtags, ...item.keywords].map(normalizeMarketToken)),
  );
  const sampleTokens = new Set([...marketKeywordTokens, ...contentTokens]);

  const seeds = (brief?.seedKeywords ?? []).map(normalizeMarketToken).filter(Boolean);
  if (seeds.length > 0 && sampleTokens.size > 0) {
    const overlap = seeds.filter((seed) => sampleHasToken(sampleTokens, seed));
    items.push(
      makeItem(
        {
          code: 'PRODUCT_MARKET_KEYWORD_OVERLAP',
          evidenceKind: 'INFERRED',
          metric: 'overlapCount',
          value: overlap.length,
          params: { seedCount: seeds.length, overlapCount: overlap.length },
          supportCount: overlap.length,
          sampleSize: keywords.length + contents.length,
          sourceKinds: sourcesOf([...keywords, ...contents]),
          keywordKeys: uniqueKeys(
            keywords.filter((item) => overlap.includes(normalizeMarketToken(item.keyword))).map((item) => item.canonicalKey),
            MARKET_EVIDENCE_LIMITS.keywordKeys,
          ),
        },
        ctx.cap,
      ),
    );
  }

  const sellingPoints = (brief?.sellingPoints ?? []).map((point) => point.trim()).filter(Boolean);
  const uncovered = sellingPoints.filter((point) => !sampleHasToken(sampleTokens, normalizeMarketToken(point)));
  if (uncovered.length > 0 && sampleTokens.size > 0) {
    items.push(
      makeItem(
        {
          code: 'LOW_SAMPLE_COVERAGE_FOR_SELLING_POINT',
          evidenceKind: 'INFERRED',
          value: uncovered.length,
          params: { uncoveredCount: uncovered.length, sellingPointCount: sellingPoints.length },
          supportCount: uncovered.length,
          sampleSize: keywords.length + contents.length,
          sourceKinds: sourcesOf([...keywords, ...contents]),
        },
        ctx.cap,
      ),
    );
  }

  const highLow = keywords.filter((item) => item.volumeSignal === 'high' && item.competitionSignal === 'low');
  if (highLow.length > 0) {
    items.push(
      makeItem(
        {
          code: 'HIGH_VOLUME_LOW_COMPETITION_SIGNAL',
          evidenceKind: 'INFERRED',
          supportCount: highLow.length,
          sampleSize: keywords.length,
          sourceKinds: sourcesOf(highLow),
          keywordKeys: uniqueKeys(highLow.map((item) => item.canonicalKey), MARKET_EVIDENCE_LIMITS.keywordKeys),
        },
        ctx.cap,
      ),
    );
  }
  return items;
}

function sampleHasToken(sampleTokens: Set<string>, token: string): boolean {
  if (!token) {
    return false;
  }
  if (sampleTokens.has(token)) {
    return true;
  }
  for (const sample of sampleTokens) {
    if (sample.includes(token) || token.includes(sample)) {
      return true;
    }
  }
  return false;
}

function uniqueKeys(values: string[], max: number): string[] {
  return uniquePreserveOrder(values, max);
}

function uniquePreserveOrder(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    next.push(value);
    if (next.length >= max) {
      break;
    }
  }
  return next;
}

function sortByMetric<T>(items: T[], read: (item: T) => number): T[] {
  return [...items].sort((left, right) => {
    const diff = read(right) - read(left);
    if (diff !== 0) {
      return diff;
    }
    const leftKey = 'canonicalKey' in (left as object) ? String((left as { canonicalKey: string }).canonicalKey) : '';
    const rightKey = 'canonicalKey' in (right as object) ? String((right as { canonicalKey: string }).canonicalKey) : '';
    if (leftKey || rightKey) {
      return leftKey.localeCompare(rightKey);
    }
    const nestedLeft = (left as { item?: { canonicalKey?: string } }).item?.canonicalKey ?? '';
    const nestedRight = (right as { item?: { canonicalKey?: string } }).item?.canonicalKey ?? '';
    return nestedLeft.localeCompare(nestedRight);
  });
}

function compactEvidence(evidence: MarketEvidence): MarketEvidence {
  evidence.keywordEvidence = evidence.keywordEvidence.slice(0, MARKET_EVIDENCE_LIMITS.keywordEvidence);
  evidence.contentEvidence = evidence.contentEvidence.slice(0, MARKET_EVIDENCE_LIMITS.contentEvidence);
  evidence.competitorEvidence = evidence.competitorEvidence.slice(0, MARKET_EVIDENCE_LIMITS.competitorEvidence);
  evidence.trendEvidence = evidence.trendEvidence.slice(0, MARKET_EVIDENCE_LIMITS.trendEvidence);
  evidence.audienceEvidence = evidence.audienceEvidence.slice(0, MARKET_EVIDENCE_LIMITS.audienceEvidence);
  evidence.opportunityEvidence = evidence.opportunityEvidence.slice(0, MARKET_EVIDENCE_LIMITS.opportunityEvidence);

  const dropOrder: Array<keyof Pick<
    MarketEvidence,
    'opportunityEvidence' | 'audienceEvidence' | 'trendEvidence' | 'competitorEvidence' | 'contentEvidence' | 'keywordEvidence'
  >> = [
    'opportunityEvidence',
    'audienceEvidence',
    'trendEvidence',
    'competitorEvidence',
    'contentEvidence',
    'keywordEvidence',
  ];
  while (jsonSize(evidence) > MARKET_EVIDENCE_MAX_JSON_BYTES) {
    const target = dropOrder.find((key) => evidence[key].length > 1);
    if (!target) {
      break;
    }
    evidence[target] = evidence[target].slice(0, evidence[target].length - 1);
  }
  return evidence;
}

function jsonSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function evidenceWithoutGeneratedAt(evidence: MarketEvidence): Omit<MarketEvidence, 'generatedAt'> {
  const { generatedAt: _generatedAt, ...rest } = evidence;
  return rest;
}

export type { MarketEvidenceItemKind };
