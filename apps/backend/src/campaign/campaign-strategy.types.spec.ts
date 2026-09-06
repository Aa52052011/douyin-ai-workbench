import { describe, expect, it } from 'vitest';
import { emptyPerformanceFeedback } from '../metrics/performance-feedback.builder.js';
import type { MarketInsightOutputV1 } from '../agents/definitions/market-intelligence.types.js';
import {
  computeCampaignStrategyConfidenceCeiling,
  computeCampaignStrategyDataState,
} from './campaign-strategy.types.js';

function insight(overrides: Partial<MarketInsightOutputV1> = {}): MarketInsightOutputV1 {
  return {
    version: 'v1',
    marketResearchId: '11111111-1111-1111-1111-111111111111',
    evidenceVersion: 'v1',
    executiveSummary: '样本摘要',
    marketState: 'LIMITED_SIGNAL',
    keywordInsights: [],
    contentInsights: [],
    competitorInsights: [],
    trendInsights: [],
    audienceInsights: [],
    opportunityInsights: [],
    strategicImplications: [],
    dataLimitations: ['LIMITED_SAMPLE'],
    confidence: 'LOW',
    evidenceCoverage: { evidenceItemsAvailable: 1, evidenceItemsReferenced: 0, coverageRate: 0 },
    ...overrides,
  };
}

describe('campaign strategy data state and confidence ceiling', () => {
  it('marks NO market as LIMITED overall and LOW ceiling', () => {
    const performance = emptyPerformanceFeedback();
    const state = computeCampaignStrategyDataState({
      marketInsight: null,
      performance,
      briefMismatch: false,
    });
    expect(state.market).toBe('NONE');
    expect(state.performance).toBe('NONE');
    expect(state.overall).toBe('LIMITED');
    expect(computeCampaignStrategyConfidenceCeiling({ marketInsight: null, performance, briefMismatch: false })).toBe(
      'LOW',
    );
  });

  it('does not let LIMITED market imply HIGH', () => {
    const performance = {
      ...emptyPerformanceFeedback(),
      dataState: 'USABLE' as const,
    };
    const limitedHigh = insight({ marketState: 'LIMITED_SIGNAL', confidence: 'HIGH' });
    expect(
      computeCampaignStrategyConfidenceCeiling({
        marketInsight: limitedHigh,
        performance,
        briefMismatch: false,
      }),
    ).not.toBe('HIGH');
    expect(computeCampaignStrategyDataState({ marketInsight: limitedHigh, performance, briefMismatch: false }).market).toBe(
      'LIMITED',
    );
  });

  it('requires usable market, high insight, usable performance and no mismatch for HIGH', () => {
    const performance = { ...emptyPerformanceFeedback(), dataState: 'USABLE' as const };
    const usable = insight({ marketState: 'ANALYZABLE_SAMPLE', confidence: 'HIGH' });
    expect(
      computeCampaignStrategyConfidenceCeiling({
        marketInsight: usable,
        performance,
        briefMismatch: false,
      }),
    ).toBe('HIGH');
    expect(
      computeCampaignStrategyConfidenceCeiling({
        marketInsight: usable,
        performance,
        briefMismatch: true,
      }),
    ).not.toBe('HIGH');
    expect(
      computeCampaignStrategyDataState({
        marketInsight: usable,
        performance,
        briefMismatch: false,
      }).overall,
    ).toBe('SUFFICIENT');
  });
});
