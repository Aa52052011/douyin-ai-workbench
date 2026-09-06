import type {
  MARKET_COMPETITION_SIGNALS,
  MARKET_ENGAGEMENT_SIGNALS,
  MARKET_FREQUENCY_SIGNALS,
  MARKET_HEAT_SIGNALS,
  MARKET_ITEM_KINDS,
  MARKET_SOURCES,
  MARKET_VOLUME_SIGNALS,
} from './market.constants.js';

export type MarketSourceValue = (typeof MARKET_SOURCES)[number];
export type MarketItemKind = (typeof MARKET_ITEM_KINDS)[number];
export type MarketVolumeSignal = (typeof MARKET_VOLUME_SIGNALS)[number];
export type MarketCompetitionSignal = (typeof MARKET_COMPETITION_SIGNALS)[number];
export type MarketFrequencySignal = (typeof MARKET_FREQUENCY_SIGNALS)[number];
export type MarketEngagementSignal = (typeof MARKET_ENGAGEMENT_SIGNALS)[number];
export type MarketHeatSignal = (typeof MARKET_HEAT_SIGNALS)[number];

export type MarketProvenance = {
  source: MarketSourceValue;
  pageContext?: string;
  importFileFingerprint?: string;
  providerRequestId?: string;
};

export type MarketContentMetrics = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  completionRate: number | null;
};

export type MarketItemBase = {
  kind: MarketItemKind;
  platform: string;
  source: MarketSourceValue;
  collectedAt: string;
  canonicalKey: string;
  externalId?: string;
  externalUrl?: string;
  metrics?: MarketContentMetrics;
  signals?: Record<string, string | number | null>;
  provenance?: MarketProvenance;
};

export type NormalizedKeywordItem = MarketItemBase & {
  kind: 'KEYWORD';
  keyword: string;
  relatedKeywords: string[];
  searchRank: number | null;
  trendScore: number | null;
  volumeSignal: MarketVolumeSignal | null;
  competitionSignal: MarketCompetitionSignal | null;
};

export type NormalizedContentItem = MarketItemBase & {
  kind: 'CONTENT';
  externalContentId: string | null;
  title: string | null;
  caption: string | null;
  author: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  hashtags: string[];
  keywords: string[];
  metrics: MarketContentMetrics;
};

export type NormalizedCompetitorItem = MarketItemBase & {
  kind: 'COMPETITOR';
  displayName: string;
  externalAccountId: string | null;
  profileUrl: string | null;
  followerCount: number | null;
  recentPostCount: number | null;
  postingFrequencySignal: MarketFrequencySignal | null;
  engagementSignal: MarketEngagementSignal | null;
  contentThemes: string[];
};

export type NormalizedTrendItem = MarketItemBase & {
  kind: 'TREND';
  name: string;
  rank: number | null;
  heatSignal: MarketHeatSignal | null;
  category: string | null;
  startedAt: string | null;
  observedAt: string;
};

export type NormalizedAudienceSignalItem = MarketItemBase & {
  kind: 'AUDIENCE_SIGNAL';
  topic: string;
  signalType: string;
  frequency: number | null;
  examples: string[];
};

export type NormalizedMarketItem =
  | NormalizedKeywordItem
  | NormalizedContentItem
  | NormalizedCompetitorItem
  | NormalizedTrendItem
  | NormalizedAudienceSignalItem;

export type MarketDataSufficiency = 'NONE' | 'LIMITED' | 'USABLE';
export type MarketConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type MarketSampleSize = {
  total: number;
  keywords: number;
  contents: number;
  competitors: number;
  trends: number;
  audienceSignals: number;
};

export type MarketDataQuality = {
  sourceCount: number;
  sources: MarketSourceValue[];
  sampleSize: MarketSampleSize;
  duplicateCount: number;
  missingFieldRate: number;
  coverageFrom: string | null;
  coverageTo: string | null;
  manualOnly: boolean;
  importOnly: boolean;
  officialUsed: boolean;
  thirdPartyUsed: boolean;
  desktopLocalSearchOnly: boolean;
  dataSufficiency: MarketDataSufficiency;
  confidence: MarketConfidence;
};

export type MarketSampleStats = {
  contentCount: number;
  keywordCount: number;
  competitorCount: number;
  trendCount: number;
  audienceSignalCount: number;
  medianViews: number | null;
  medianEngagementRate: number | null;
  note: 'snapshot_sample_only';
};

export type MarketEvidenceKind = 'DATA_BACKED' | 'INFERRED' | 'GENERAL_KNOWLEDGE' | 'INSUFFICIENT_DATA';

export type MarketNormalizeResult = {
  items: NormalizedMarketItem[];
  duplicateCount: number;
  warnings: string[];
};

export type ProductBriefPayload = {
  productName: string;
  category?: string;
  industry: string;
  brand?: string;
  description?: string;
  sellingPoints?: string[];
  targetAudience?: string;
  priceRange?: string;
  businessGoal: string;
  conversionGoal?: string;
  constraints?: string[];
  tone?: string;
  referenceCompetitors?: string[];
  seedKeywords?: string[];
};
