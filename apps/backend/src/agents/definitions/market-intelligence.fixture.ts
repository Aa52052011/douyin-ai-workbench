import type { MarketEvidenceItem } from '../../market/market-evidence.types.js';
import { parseModelJson } from './account-positioning.agent.js';
import {
  buildInsufficientMarketInsight,
  listMarketEvidenceItems,
  parseMarketIntelligenceInput,
} from './market-intelligence.agent.js';
import {
  CONFIDENCE_RANK,
  MARKET_INSIGHT_OUTPUT_VERSION,
  asInsightKind,
  type MarketInsightItem,
  type MarketInsightOutputV1,
  type MarketInsightState,
  type MarketIntelligenceInput,
} from './market-intelligence.types.js';

export function buildMockMarketInsightOutput(input: MarketIntelligenceInput): MarketInsightOutputV1 {
  if (input.marketEvidence.dataSufficiency === 'NONE') {
    return buildInsufficientMarketInsight(input);
  }

  const evidence = input.marketEvidence;
  const ceiling = evidence.confidence;
  const marketState: MarketInsightState =
    evidence.dataSufficiency === 'USABLE' ? 'ANALYZABLE_SAMPLE' : 'LIMITED_SIGNAL';

  const keywordInsights = maybeItems('keyword', evidence.keywordEvidence, ceiling);
  const contentInsights = maybeItems('content', evidence.contentEvidence, ceiling);
  const competitorInsights = maybeItems('competitor', evidence.competitorEvidence, ceiling);
  const trendInsights = maybeItems('trend', evidence.trendEvidence, ceiling);
  const audienceInsights = maybeItems('audience', evidence.audienceEvidence, ceiling);
  const opportunityInsights = maybeItems('opportunity', evidence.opportunityEvidence, ceiling);
  const first = listMarketEvidenceItems(evidence)[0];
  const strategicImplications = first
    ? [
        insightFromEvidence('strategy', first, ceiling, '当前样本中的该信号值得在策略阶段进一步评估，而不是直接作为推广方案。'),
      ]
    : [];

  const dataLimitations =
    evidence.dataSufficiency === 'LIMITED'
      ? ['LIMITED_SAMPLE', ...evidence.dataQualityFlags.slice(0, 3)]
      : ['SAMPLE_NOT_PLATFORM_WIDE'];

  return {
    version: MARKET_INSIGHT_OUTPUT_VERSION,
    marketResearchId: evidence.marketResearchId,
    evidenceVersion: evidence.version,
    executiveSummary: '根据当前这批 MarketEvidence，只能描述研究样本内可见的相对信号，不能外推到全平台。',
    marketState,
    keywordInsights,
    contentInsights,
    competitorInsights,
    trendInsights,
    audienceInsights,
    opportunityInsights,
    strategicImplications,
    dataLimitations: dataLimitations.slice(0, 8),
    confidence: ceiling,
    evidenceCoverage: {
      evidenceItemsAvailable: 0,
      evidenceItemsReferenced: 0,
      coverageRate: 0,
    },
  };
}

export function buildMockMarketInsightText(prompt: string): string {
  const parsed = extractInputFromPrompt(prompt);
  return JSON.stringify(buildMockMarketInsightOutput(parsed));
}

function extractInputFromPrompt(prompt: string): MarketIntelligenceInput {
  const raw = parseModelJson(prompt);
  return parseMarketIntelligenceInput(raw);
}

function maybeItems(
  prefix: string,
  items: MarketEvidenceItem[],
  ceiling: MarketIntelligenceInput['marketEvidence']['confidence'],
): MarketInsightItem[] {
  const first = items[0];
  if (!first) {
    return [];
  }
  return [insightFromEvidence(prefix, first, ceiling)];
}

function insightFromEvidence(
  prefix: string,
  evidence: MarketEvidenceItem,
  ceiling: MarketIntelligenceInput['marketEvidence']['confidence'],
  statement?: string,
): MarketInsightItem {
  const kind = asInsightKind(evidence.evidenceKind);
  if (!kind) {
    throw new Error('mock evidence kind is not allowed');
  }
  const confidence =
    CONFIDENCE_RANK[evidence.confidence] <= CONFIDENCE_RANK[ceiling] ? evidence.confidence : ceiling;
  return {
    code: `${prefix}-${evidence.code}`.slice(0, 80),
    statement:
      statement ??
      `在当前样本中，evidence ${evidence.code} 表明存在可观察的分布或相对信号，不能据此声称平台级规模。`,
    evidenceKind: kind,
    confidence,
    evidenceCodes: [evidence.code],
    supportCount: evidence.supportCount,
  };
}
