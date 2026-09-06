import type { AccountPositioningOutput } from '../agents/definitions/account-positioning.types.js';
import type { MarketInsightOutputV1 } from '../agents/definitions/market-intelligence.types.js';
import type { CompactPerformanceFeedback, FeedbackDataState } from '../metrics/performance-feedback.types.js';
import type { MarketConfidence, ProductBriefPayload } from '../market/market.types.js';

export const CAMPAIGN_STRATEGY_OUTPUT_VERSION = 'v1' as const;
export const CAMPAIGN_STRATEGY_INPUT_VERSION = 'v1' as const;

export const CAMPAIGN_STRATEGY_CONFIDENCES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type CampaignStrategyConfidence = (typeof CAMPAIGN_STRATEGY_CONFIDENCES)[number];

export const CAMPAIGN_STRATEGY_DATA_LEVELS = ['NONE', 'LIMITED', 'USABLE'] as const;
export type CampaignStrategyDataLevel = (typeof CAMPAIGN_STRATEGY_DATA_LEVELS)[number];

export const CAMPAIGN_STRATEGY_OVERALL_STATES = ['LIMITED', 'SUFFICIENT'] as const;
export type CampaignStrategyOverallState = (typeof CAMPAIGN_STRATEGY_OVERALL_STATES)[number];

export const CAMPAIGN_STRATEGY_EVIDENCE_TYPES = [
  'PRODUCT_BRIEF',
  'MARKET_INSIGHT',
  'PERFORMANCE_FEEDBACK',
  'ACCOUNT_POSITIONING',
  'USER_GOAL',
] as const;
export type CampaignStrategyEvidenceType = (typeof CAMPAIGN_STRATEGY_EVIDENCE_TYPES)[number];

export const CAMPAIGN_STRATEGY_FLAGS = [
  'NO_MARKET_INSIGHT',
  'NO_PERFORMANCE_HISTORY',
  'BRIEF_VERSION_MISMATCH',
] as const;
export type CampaignStrategyFlag = (typeof CAMPAIGN_STRATEGY_FLAGS)[number];

export const CAMPAIGN_STRATEGY_INPUT_PRIORITY = [
  'USER_GOAL',
  'PRODUCT_BRIEF',
  'ACCOUNT_POSITIONING',
  'MARKET_INSIGHT',
  'PERFORMANCE_FEEDBACK',
  'PROJECT_CONTEXT',
] as const;

export const CAMPAIGN_STRATEGY_FORBIDDEN_KEYS = [
  'token',
  'cookie',
  'cookies',
  'credentialRef',
  'providerMetadata',
  'collectionKey',
  'rawSnapshot',
  'snapshot',
  'csv',
  'xlsx',
  'captions',
  'comments',
  'html',
] as const;

export const CAMPAIGN_STRATEGY_LIMITS = {
  userGoal: 500,
  focus: 500,
  constraints: 1000,
  evidenceRef: 80,
  evidenceNote: 200,
  statement: 500,
  list: 8,
  mix: 8,
  hypotheses: 8,
  risks: 8,
  payloadBytes: 16 * 1024,
} as const;

export const CAMPAIGN_STRATEGY_CONFIDENCE_RANK: Record<CampaignStrategyConfidence, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

export const CAMPAIGN_STRATEGY_INPUT_KEYS = [
  'version',
  'composedAt',
  'productBrief',
  'marketInsight',
  'accountPositioning',
  'performanceFeedback',
  'currentUserGoal',
  'projectContext',
  'dataState',
  'confidenceCeiling',
  'flags',
  'inputPriority',
] as const;

export const CAMPAIGN_STRATEGY_OUTPUT_KEYS = [
  'version',
  'objective',
  'targetAudience',
  'positioning',
  'valuePropositions',
  'contentPillars',
  'contentMix',
  'creativeAngles',
  'conversionPath',
  'ctaStrategy',
  'testingStrategy',
  'publishingCadence',
  'risks',
  'confidence',
  'dataLimitations',
] as const;

export const CAMPAIGN_STRATEGY_BRIEF_REFS = [
  'productName',
  'industry',
  'businessGoal',
  'conversionGoal',
  'sellingPoints',
  'targetAudience',
  'constraints',
  'seedKeywords',
] as const;

export const CAMPAIGN_STRATEGY_POSITIONING_REFS = [
  'accountPositioning',
  'targetAudience',
  'userPainPoints',
  'contentNiches',
  'contentPillars',
  'differentiation',
  'persona',
  'profileBio',
  'contentFormats',
  'publishingStrategy',
  'initialContentDirections',
] as const;

export const CAMPAIGN_STRATEGY_USER_GOAL_REFS = ['userGoal', 'focus', 'constraints'] as const;

export const CAMPAIGN_STRATEGY_PRIORITIES = ['high', 'medium', 'low'] as const;
export type CampaignStrategyPriority = (typeof CAMPAIGN_STRATEGY_PRIORITIES)[number];

export const CAMPAIGN_STRATEGY_FORBIDDEN_CLAIMS = [
  '全抖音',
  '整个抖音',
  '抖音用户都',
  '行业平均',
  '市场规模',
  '官方搜索量',
  '搜索量为',
  '正在快速增长',
  '蓝海',
  '零竞争',
  '必然爆款',
  '保证转化',
  '保证收益',
] as const;

export const CAMPAIGN_STRATEGY_LEAKAGE_KEYS = [
  'topics',
  'topic',
  'script',
  'narration',
  'shots',
  'storyboard',
  'voiceover',
  'sections',
  'contentPlan',
  'days',
] as const;

export const NO_MARKET_INSIGHT_LIMITATION = 'NO_MARKET_INSIGHT';
export const NO_PERFORMANCE_HISTORY_LIMITATION = 'NO_PERFORMANCE_HISTORY';
export const LIMITED_MARKET_SAMPLE_LIMITATION = 'LIMITED_MARKET_SAMPLE';

export const CAMPAIGN_STRATEGY_NO_MARKET_PHRASES = [
  '根据市场数据',
  '当前市场显示',
  '市场数据表明',
  '根据市场分析',
] as const;

export const CAMPAIGN_STRATEGY_NO_PERFORMANCE_PHRASES = [
  '历史数据证明',
  '历史表现表明',
  '历史表现证明',
] as const;

export type CampaignStrategyEvidenceBasis = {
  type: CampaignStrategyEvidenceType;
  ref: string;
  note?: string;
};

export type CampaignStrategyDataState = {
  market: CampaignStrategyDataLevel;
  performance: CampaignStrategyDataLevel;
  positioning: 'AVAILABLE';
  productBrief: 'AVAILABLE';
  overall: CampaignStrategyOverallState;
};

export type CampaignStrategyProjectContext = {
  name: string;
  industry?: string;
  platform?: string;
  description?: string;
};

export type CampaignStrategyUserGoal = {
  userGoal?: string;
  focus?: string;
  constraints?: string;
};

export type CampaignStrategyBriefRef = {
  id: string;
  version: number;
  payload: ProductBriefPayload;
};

export type CampaignStrategyInsightRef = {
  id: string;
  version: number;
  marketResearchId: string;
  productBriefId: string | null;
  productBriefVersion: number | null;
  payload: MarketInsightOutputV1;
};

export type CampaignStrategyPositioningRef = {
  positioningRunId: string;
  output: AccountPositioningOutput;
};

export type CampaignStrategyInputSnapshot = {
  version: typeof CAMPAIGN_STRATEGY_INPUT_VERSION;
  composedAt: string;
  productBrief: CampaignStrategyBriefRef;
  marketInsight: CampaignStrategyInsightRef | null;
  accountPositioning: CampaignStrategyPositioningRef;
  performanceFeedback: CompactPerformanceFeedback;
  currentUserGoal: CampaignStrategyUserGoal | null;
  projectContext: CampaignStrategyProjectContext;
  dataState: CampaignStrategyDataState;
  confidenceCeiling: CampaignStrategyConfidence;
  flags: CampaignStrategyFlag[];
  inputPriority: typeof CAMPAIGN_STRATEGY_INPUT_PRIORITY;
};

export type CampaignStrategyOutputV1 = {
  version: typeof CAMPAIGN_STRATEGY_OUTPUT_VERSION;
  objective: {
    businessGoal: string;
    conversionGoal?: string;
    primaryObjective: string;
  };
  targetAudience: {
    primary: string;
    secondary?: string;
    pains: string[];
    motivations: string[];
  };
  positioning: {
    accountRole: string;
    marketPosition: string;
    differentiation: string[];
  };
  valuePropositions: Array<{
    proposition: string;
    evidenceBasis: CampaignStrategyEvidenceBasis[];
    priority: 'high' | 'medium' | 'low';
  }>;
  contentPillars: Array<{
    name: string;
    purpose: string;
    priority: 'high' | 'medium' | 'low';
    evidenceBasis: CampaignStrategyEvidenceBasis[];
  }>;
  contentMix: Array<{
    type: string;
    percentage?: number;
    purpose: string;
  }>;
  creativeAngles: Array<{
    angle: string;
    rationale: string;
    evidenceBasis: CampaignStrategyEvidenceBasis[];
  }>;
  conversionPath: {
    awareness: string;
    consideration: string;
    conversion: string;
  };
  ctaStrategy: {
    principles: string[];
    allowedDirections: string[];
  };
  testingStrategy: {
    hypotheses: Array<{
      hypothesis: string;
      evidenceBasis: CampaignStrategyEvidenceBasis[];
    }>;
    variables: string[];
    successSignals: string[];
  };
  publishingCadence?: {
    guidance: string;
  };
  risks: Array<{
    risk: string;
    mitigation?: string;
  }>;
  confidence: CampaignStrategyConfidence;
  dataLimitations: string[];
};

export type CampaignStrategyComposeRequest = {
  productBriefId?: string;
  marketResearchId?: string;
  marketInsightId?: string;
  positioningRunId: string;
  userGoal?: string;
  focus?: string;
  constraints?: string;
};

export function mapFeedbackDataLevel(state: FeedbackDataState): CampaignStrategyDataLevel {
  if (state === 'USABLE') {
    return 'USABLE';
  }
  if (state === 'NONE') {
    return 'NONE';
  }
  return 'LIMITED';
}

export function mapMarketInsightLevel(payload: MarketInsightOutputV1 | null): CampaignStrategyDataLevel {
  if (!payload) {
    return 'NONE';
  }
  if (payload.marketState === 'ANALYZABLE_SAMPLE') {
    return 'USABLE';
  }
  if (payload.marketState === 'INSUFFICIENT_DATA') {
    return 'NONE';
  }
  return 'LIMITED';
}

export function computeCampaignStrategyDataState(input: {
  marketInsight: MarketInsightOutputV1 | null;
  performance: CompactPerformanceFeedback;
  briefMismatch: boolean;
}): CampaignStrategyDataState {
  const market = mapMarketInsightLevel(input.marketInsight);
  const performance = mapFeedbackDataLevel(input.performance.dataState);
  const overall: CampaignStrategyOverallState =
    market === 'USABLE' && !input.briefMismatch ? 'SUFFICIENT' : 'LIMITED';
  return {
    market,
    performance,
    positioning: 'AVAILABLE',
    productBrief: 'AVAILABLE',
    overall,
  };
}

export function computeCampaignStrategyConfidenceCeiling(input: {
  marketInsight: MarketInsightOutputV1 | null;
  performance: CompactPerformanceFeedback;
  briefMismatch: boolean;
}): CampaignStrategyConfidence {
  if (!input.marketInsight) {
    return 'LOW';
  }
  const marketLevel = mapMarketInsightLevel(input.marketInsight);
  const insightConfidence = input.marketInsight.confidence;
  const performanceLevel = mapFeedbackDataLevel(input.performance.dataState);

  if (marketLevel === 'NONE') {
    return 'LOW';
  }
  if (
    marketLevel === 'USABLE' &&
    insightConfidence === 'HIGH' &&
    !input.briefMismatch &&
    performanceLevel === 'USABLE'
  ) {
    return 'HIGH';
  }
  if (marketLevel === 'LIMITED' || input.briefMismatch || insightConfidence === 'LOW') {
    return insightConfidence === 'MEDIUM' && !input.briefMismatch ? 'MEDIUM' : 'LOW';
  }
  if (insightConfidence === 'MEDIUM' || insightConfidence === 'HIGH') {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function isMarketConfidence(value: unknown): value is MarketConfidence {
  return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH';
}

export function collectMarketInsightCodes(payload: MarketInsightOutputV1): string[] {
  return [
    ...payload.keywordInsights,
    ...payload.contentInsights,
    ...payload.competitorInsights,
    ...payload.trendInsights,
    ...payload.audienceInsights,
    ...payload.opportunityInsights,
    ...payload.strategicImplications,
  ]
    .map((item) => item.code)
    .filter((code) => typeof code === 'string' && code.trim());
}

export function collectPerformanceSignalCodes(feedback: CompactPerformanceFeedback): string[] {
  return [...feedback.positiveSignals, ...feedback.cautionSignals, ...feedback.dataQualitySignals].map(
    (item) => item.code,
  );
}
