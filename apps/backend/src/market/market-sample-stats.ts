import type { MarketSampleStats, NormalizedContentItem, NormalizedMarketItem } from './market.types.js';

export function contentSampleEngagementRate(item: NormalizedContentItem): number | null {
  const { views, likes, comments, shares, favorites } = item.metrics;
  if (views == null || views <= 0 || likes == null || comments == null || shares == null || favorites == null) {
    return null;
  }
  return (likes + comments + shares + favorites) / views;
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

export function buildMarketSampleStats(items: NormalizedMarketItem[]): MarketSampleStats {
  const contents = items.filter((item) => item.kind === 'CONTENT');
  const views = contents
    .map((item) => item.metrics.views)
    .filter((value): value is number => value != null);
  const engagementRates = contents
    .map((item) => contentSampleEngagementRate(item))
    .filter((value): value is number => value != null);

  return {
    contentCount: contents.length,
    keywordCount: items.filter((item) => item.kind === 'KEYWORD').length,
    competitorCount: items.filter((item) => item.kind === 'COMPETITOR').length,
    trendCount: items.filter((item) => item.kind === 'TREND').length,
    audienceSignalCount: items.filter((item) => item.kind === 'AUDIENCE_SIGNAL').length,
    medianViews: median(views),
    medianEngagementRate: median(engagementRates),
    note: 'snapshot_sample_only',
  };
}
