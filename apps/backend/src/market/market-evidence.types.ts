import type {
  MarketConfidence,
  MarketDataQuality,
  MarketDataSufficiency,
  MarketEvidenceKind,
  MarketSampleStats,
  MarketSourceValue,
  NormalizedAudienceSignalItem,
  NormalizedCompetitorItem,
  NormalizedContentItem,
  NormalizedKeywordItem,
  NormalizedTrendItem,
  ProductBriefPayload,
} from './market.types.js';
import type { MarketEvidenceCode, MarketEvidenceFlag } from './market-evidence.constants.js';

export type MarketEvidenceItemKind = Exclude<MarketEvidenceKind, 'GENERAL_KNOWLEDGE'>;

export type MarketEvidenceItem = {
  code: MarketEvidenceCode;
  evidenceKind: MarketEvidenceItemKind;
  metric?: string;
  value?: string | number | null;
  params?: Record<string, string | number | null>;
  supportCount: number;
  sampleSize: number;
  confidence: MarketConfidence;
  sourceKinds?: MarketSourceValue[];
  contentKeys?: string[];
  keywordKeys?: string[];
  competitorKeys?: string[];
  trendKeys?: string[];
  audienceKeys?: string[];
  examples?: string[];
};

export type MarketEvidence = {
  version: 'v1';
  marketResearchId: string;
  marketResearchVersion: number;
  snapshotId: string;
  generatedAt: string;
  dataSufficiency: MarketDataSufficiency;
  confidence: MarketConfidence;
  sourceSummary: {
    sources: MarketSourceValue[];
    manualOnly: boolean;
    importOnly: boolean;
  };
  sampleSummary: MarketSampleStats & { total: number };
  keywordEvidence: MarketEvidenceItem[];
  contentEvidence: MarketEvidenceItem[];
  competitorEvidence: MarketEvidenceItem[];
  trendEvidence: MarketEvidenceItem[];
  audienceEvidence: MarketEvidenceItem[];
  opportunityEvidence: MarketEvidenceItem[];
  dataQualityFlags: MarketEvidenceFlag[];
  insufficientData?: MarketEvidenceItem;
};

export type MarketEvidenceBuildInput = {
  marketResearchId: string;
  marketResearchVersion: number;
  snapshotId: string;
  generatedAt?: string;
  productBriefSnapshot?: ProductBriefPayload | null;
  queryContext?: unknown;
  dataQuality: MarketDataQuality;
  sampleStats: MarketSampleStats;
  keywords: NormalizedKeywordItem[];
  contents: NormalizedContentItem[];
  competitors: NormalizedCompetitorItem[];
  trends: NormalizedTrendItem[];
  audienceSignals: NormalizedAudienceSignalItem[];
};
