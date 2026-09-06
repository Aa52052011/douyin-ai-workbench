import { describe, expect, it } from 'vitest';
import { buildMarketDataQuality } from './market-data-quality.js';
import { normalizeMarketItems } from './market-normalizer.js';
import { buildMarketSampleStats } from './market-sample-stats.js';

const collectedAt = '2026-09-01T00:00:00.000Z';

describe('buildMarketDataQuality + sampleStats', () => {
  it('maps zero items to NONE / LOW', () => {
    const quality = buildMarketDataQuality({ items: [], duplicateCount: 0 });
    expect(quality.dataSufficiency).toBe('NONE');
    expect(quality.confidence).toBe('LOW');
    expect(quality.sampleSize.total).toBe(0);
    expect(quality.manualOnly).toBe(false);
    expect(quality.officialUsed).toBe(false);
    expect(buildMarketSampleStats([]).medianViews).toBeNull();
  });

  it('keeps small MANUAL samples LIMITED and counts duplicates', () => {
    const normalized = normalizeMarketItems({
      collectedAt,
      items: [
        { kind: 'KEYWORD', platform: 'douyin', keyword: '职场沟通' },
        { kind: 'KEYWORD', platform: 'douyin', keyword: '职场沟通' },
        {
          kind: 'CONTENT',
          platform: 'douyin',
          title: 'manual sample A',
          views: 100,
          likes: 10,
          comments: 2,
          shares: 1,
          favorites: 1,
        },
        { kind: 'CONTENT', platform: 'douyin', title: 'manual sample B', views: 200 },
      ],
    });
    const quality = buildMarketDataQuality({
      items: normalized.items,
      duplicateCount: normalized.duplicateCount,
    });
    expect(quality.dataSufficiency).toBe('LIMITED');
    expect(quality.manualOnly).toBe(true);
    expect(quality.duplicateCount).toBe(1);
    expect(quality.sampleSize.keywords).toBe(1);
    expect(quality.sampleSize.contents).toBe(2);
    expect(quality.missingFieldRate).toBeGreaterThan(0);
    expect(quality.confidence).toBe('LOW');
    const stats = buildMarketSampleStats(normalized.items);
    expect(stats.note).toBe('snapshot_sample_only');
    expect(stats.medianViews).toBe(150);
    expect(stats.medianEngagementRate).toBe(0.14);
  });
});
