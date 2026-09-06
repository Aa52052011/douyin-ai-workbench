import type {
  MarketConfidence,
  MarketDataQuality,
  MarketDataSufficiency,
  MarketSourceValue,
  NormalizedMarketItem,
} from './market.types.js';

function missingRate(item: NormalizedMarketItem): number {
  const flags: boolean[] = [];
  if (item.kind === 'KEYWORD') {
    flags.push(item.searchRank == null, item.trendScore == null, item.volumeSignal == null, item.competitionSignal == null);
  } else if (item.kind === 'CONTENT') {
    flags.push(
      item.title == null,
      item.publishedAt == null,
      item.metrics.views == null,
      item.metrics.likes == null,
      item.metrics.comments == null,
      item.metrics.shares == null,
      item.metrics.favorites == null,
      item.metrics.completionRate == null,
    );
  } else if (item.kind === 'COMPETITOR') {
    flags.push(
      item.externalAccountId == null,
      item.followerCount == null,
      item.recentPostCount == null,
      item.postingFrequencySignal == null,
      item.engagementSignal == null,
    );
  } else if (item.kind === 'TREND') {
    flags.push(item.rank == null, item.heatSignal == null, item.startedAt == null);
  } else {
    flags.push(item.frequency == null, item.examples.length === 0);
  }
  if (flags.length === 0) {
    return 0;
  }
  return flags.filter(Boolean).length / flags.length;
}

function coverageDates(items: NormalizedMarketItem[]): { from: string | null; to: string | null } {
  const stamps = items
    .flatMap((item) => {
      const values = [item.collectedAt];
      if (item.kind === 'CONTENT' && item.publishedAt) {
        values.push(item.publishedAt);
      }
      if (item.kind === 'TREND') {
        values.push(item.observedAt);
        if (item.startedAt) {
          values.push(item.startedAt);
        }
      }
      return values;
    })
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (stamps.length === 0) {
    return { from: null, to: null };
  }
  return {
    from: new Date(stamps[0]!).toISOString(),
    to: new Date(stamps[stamps.length - 1]!).toISOString(),
  };
}

function sufficiency(total: number, sources: MarketSourceValue[]): MarketDataSufficiency {
  if (total === 0) {
    return 'NONE';
  }
  if (sources.every((source) => source === 'MANUAL')) {
    return 'LIMITED';
  }
  if (sources.includes('DOUYIN_OFFICIAL') && total >= 20) {
    return 'USABLE';
  }
  return 'LIMITED';
}

function confidenceFor(level: MarketDataSufficiency, total: number): MarketConfidence {
  if (level === 'NONE') {
    return 'LOW';
  }
  if (level === 'USABLE') {
    return 'HIGH';
  }
  return total >= 5 ? 'MEDIUM' : 'LOW';
}

export function buildMarketDataQuality(input: {
  items: NormalizedMarketItem[];
  duplicateCount: number;
}): MarketDataQuality {
  const sources = [...new Set(input.items.map((item) => item.source))].sort();
  const sampleSize = {
    total: input.items.length,
    keywords: input.items.filter((item) => item.kind === 'KEYWORD').length,
    contents: input.items.filter((item) => item.kind === 'CONTENT').length,
    competitors: input.items.filter((item) => item.kind === 'COMPETITOR').length,
    trends: input.items.filter((item) => item.kind === 'TREND').length,
    audienceSignals: input.items.filter((item) => item.kind === 'AUDIENCE_SIGNAL').length,
  };
  const coverage = coverageDates(input.items);
  const missingFieldRate =
    input.items.length === 0
      ? 0
      : input.items.reduce((sum, item) => sum + missingRate(item), 0) / input.items.length;
  const dataSufficiency = sufficiency(sampleSize.total, sources);
  return {
    sourceCount: sources.length,
    sources,
    sampleSize,
    duplicateCount: input.duplicateCount,
    missingFieldRate,
    coverageFrom: coverage.from,
    coverageTo: coverage.to,
    manualOnly: sampleSize.total > 0 && sources.length === 1 && sources[0] === 'MANUAL',
    importOnly: sampleSize.total > 0 && sources.length === 1 && sources[0] === 'IMPORT',
    officialUsed: sources.includes('DOUYIN_OFFICIAL'),
    thirdPartyUsed: sources.includes('THIRD_PARTY'),
    desktopLocalSearchOnly: sampleSize.total > 0 && sources.length === 1 && sources[0] === 'DESKTOP_ASSISTED',
    dataSufficiency,
    confidence: confidenceFor(dataSufficiency, sampleSize.total),
  };
}
