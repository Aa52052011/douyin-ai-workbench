import { FORBIDDEN_CONTEXT_KEYS } from './account-positioning.types.js';
import type { MarketEvidence } from '../../market/market-evidence.types.js';
import type { MarketConfidence, MarketEvidenceKind, ProductBriefPayload } from '../../market/market.types.js';

export const MARKET_INSIGHT_OUTPUT_VERSION = 'v1' as const;

export const MARKET_INSIGHT_STATES = ['INSUFFICIENT_DATA', 'LIMITED_SIGNAL', 'ANALYZABLE_SAMPLE'] as const;
export type MarketInsightState = (typeof MARKET_INSIGHT_STATES)[number];

export const MARKET_INSIGHT_ITEM_KINDS = ['DATA_BACKED', 'INFERRED', 'INSUFFICIENT_DATA'] as const;
export type MarketInsightItemKind = (typeof MARKET_INSIGHT_ITEM_KINDS)[number];

export const MARKET_INSIGHT_CONFIDENCES = ['LOW', 'MEDIUM', 'HIGH'] as const;

export const MARKET_INSIGHT_LIMITS = {
  executiveSummary: 1000,
  statement: 500,
  caveat: 300,
  userFocus: 500,
  code: 80,
  evidenceCodes: 5,
  insightsPerCategory: 8,
  strategicImplications: 5,
  dataLimitations: 8,
  dataLimitationItem: 120,
  payloadBytes: 16 * 1024,
} as const;

export const MARKET_INTELLIGENCE_INPUT_KEYS = ['productBrief', 'marketEvidence', 'userFocus'] as const;

export const MARKET_INTELLIGENCE_FORBIDDEN_KEYS = [
  ...FORBIDDEN_CONTEXT_KEYS,
  'snapshot',
  'rawSnapshot',
  'contents',
  'keywords',
  'competitors',
  'trends',
  'audienceSignals',
  'items',
  'csv',
  'xlsx',
  'html',
  'cookies',
  'token',
  'captions',
  'comments',
  'file',
  'raw',
  'credentials',
] as const;

export const MARKET_INSIGHT_OUTPUT_KEYS = [
  'version',
  'marketResearchId',
  'evidenceVersion',
  'executiveSummary',
  'marketState',
  'keywordInsights',
  'contentInsights',
  'competitorInsights',
  'trendInsights',
  'audienceInsights',
  'opportunityInsights',
  'strategicImplications',
  'dataLimitations',
  'confidence',
  'evidenceCoverage',
] as const;

export const MARKET_INSIGHT_ITEM_KEYS = [
  'code',
  'statement',
  'evidenceKind',
  'confidence',
  'evidenceCodes',
  'supportCount',
  'caveat',
] as const;

export const MARKET_INSIGHT_CAMPAIGN_KEYS = [
  'publishingCadence',
  'budget',
  'ctaStrategy',
  'contentMix',
  'contentPillars',
  'postingSchedule',
] as const;

export const MARKET_INSIGHT_FORBIDDEN_CLAIMS = [
  '全抖音',
  '整个抖音',
  '抖音用户都',
  '行业平均',
  '市场规模',
  '搜索量为',
  '正在快速增长',
  '蓝海',
  '零竞争',
] as const;

export const NO_MARKET_DATA_LIMITATION = 'NO_MARKET_DATA';

export type MarketInsightItem = {
  code: string;
  statement: string;
  evidenceKind: MarketInsightItemKind;
  confidence: MarketConfidence;
  evidenceCodes: string[];
  supportCount?: number;
  caveat?: string;
};

export type MarketInsightEvidenceCoverage = {
  evidenceItemsAvailable: number;
  evidenceItemsReferenced: number;
  coverageRate: number;
};

export type MarketInsightOutputV1 = {
  version: typeof MARKET_INSIGHT_OUTPUT_VERSION;
  marketResearchId: string;
  evidenceVersion: string;
  executiveSummary: string;
  marketState: MarketInsightState;
  keywordInsights: MarketInsightItem[];
  contentInsights: MarketInsightItem[];
  competitorInsights: MarketInsightItem[];
  trendInsights: MarketInsightItem[];
  audienceInsights: MarketInsightItem[];
  opportunityInsights: MarketInsightItem[];
  strategicImplications: MarketInsightItem[];
  dataLimitations: string[];
  confidence: MarketConfidence;
  evidenceCoverage: MarketInsightEvidenceCoverage;
};

export type MarketIntelligenceInput = {
  productBrief: ProductBriefPayload;
  marketEvidence: MarketEvidence;
  userFocus?: string;
};

export const CONFIDENCE_RANK: Record<MarketConfidence, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

export const EVIDENCE_KIND_RANK: Record<MarketInsightItemKind, number> = {
  INSUFFICIENT_DATA: 0,
  INFERRED: 1,
  DATA_BACKED: 2,
};

export function isMarketInsightItemKind(value: unknown): value is MarketInsightItemKind {
  return typeof value === 'string' && (MARKET_INSIGHT_ITEM_KINDS as readonly string[]).includes(value);
}

export function asInsightKind(value: MarketEvidenceKind): MarketInsightItemKind | null {
  if (value === 'GENERAL_KNOWLEDGE') {
    return null;
  }
  if (isMarketInsightItemKind(value)) {
    return value;
  }
  return null;
}
