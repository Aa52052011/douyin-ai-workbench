export const MARKET_INSIGHT_STATES = ["INSUFFICIENT_DATA", "LIMITED_SIGNAL", "ANALYZABLE_SAMPLE"] as const;
export type MarketInsightState = (typeof MARKET_INSIGHT_STATES)[number];

export const MARKET_EVIDENCE_KINDS = ["DATA_BACKED", "INFERRED", "INSUFFICIENT_DATA"] as const;
export type MarketEvidenceKindView = (typeof MARKET_EVIDENCE_KINDS)[number];

export const MARKET_CONFIDENCES = ["LOW", "MEDIUM", "HIGH"] as const;
export type MarketConfidence = (typeof MARKET_CONFIDENCES)[number];

export type MarketEvidenceItemRecord = {
  code?: string;
  evidenceKind?: string;
  supportCount?: number;
  sampleSize?: number;
  confidence?: string;
  params?: Record<string, string | number | null>;
  examples?: string[];
};

export type MarketEvidenceRecord = {
  version?: string;
  marketResearchId?: string;
  marketResearchVersion?: number;
  dataSufficiency?: string;
  confidence?: string;
  sourceSummary?: {
    sources?: string[];
    manualOnly?: boolean;
    importOnly?: boolean;
  };
  sampleSummary?: {
    total?: number;
    keywordCount?: number;
    contentCount?: number;
    competitorCount?: number;
    trendCount?: number;
    audienceSignalCount?: number;
  };
  keywordEvidence?: MarketEvidenceItemRecord[];
  contentEvidence?: MarketEvidenceItemRecord[];
  competitorEvidence?: MarketEvidenceItemRecord[];
  trendEvidence?: MarketEvidenceItemRecord[];
  audienceEvidence?: MarketEvidenceItemRecord[];
  opportunityEvidence?: MarketEvidenceItemRecord[];
  dataQualityFlags?: string[];
  insufficientData?: MarketEvidenceItemRecord;
};

export type MarketInsightItemRecord = {
  code?: string;
  statement?: string;
  evidenceKind?: string;
  confidence?: string;
  evidenceCodes?: string[];
  supportCount?: number;
  caveat?: string;
};

export type MarketInsightPayload = {
  version?: string;
  marketResearchId?: string;
  evidenceVersion?: string;
  executiveSummary?: string;
  marketState?: string;
  keywordInsights?: MarketInsightItemRecord[];
  contentInsights?: MarketInsightItemRecord[];
  competitorInsights?: MarketInsightItemRecord[];
  trendInsights?: MarketInsightItemRecord[];
  audienceInsights?: MarketInsightItemRecord[];
  opportunityInsights?: MarketInsightItemRecord[];
  strategicImplications?: MarketInsightItemRecord[];
  dataLimitations?: string[];
  confidence?: string;
};

export type MarketInsightRecord = {
  id: string;
  projectId?: string;
  marketResearchId: string;
  version: number;
  payload: MarketInsightPayload;
  createdAt: string;
};

export type MarketInsightCreateResult = {
  insight: MarketInsightRecord;
};

export type HumanEvidenceView = {
  title: string;
  description: string;
  supportLabel: string;
  confidenceLabel: string;
  kindLabel: string;
};

export type EvidenceGroupView = {
  heading: string;
  items: HumanEvidenceView[];
};

export type EvidenceSummaryView = {
  keywordCount: number;
  contentCount: number;
  competitorCount: number;
  trendCount: number;
  audienceCount: number;
  sufficiencyLabel: string;
  confidenceLabel: string;
  shortConfidenceLabel: string;
};

export type InsightItemView = {
  statement: string;
  confidenceLabel: string;
  evidenceCountLabel: string;
  caveat?: string;
  traces: HumanEvidenceView[];
};

export type InsightSectionView = {
  heading: string;
  items: InsightItemView[];
};

export type InsightView = {
  executiveSummary: string;
  marketStateLabel: string;
  sections: InsightSectionView[];
  dataLimitations: string[];
  confidenceLabel: string;
  confidenceNote: string;
};

export type ResearchOptionView = {
  id: string;
  ordinalLabel: string;
  kindLabel: string;
  sampleCount: number;
  qualityLabel: string;
  createdAtLabel: string;
};

export type ResearchSummaryView = {
  ordinalLabel: string;
  productBriefVersionLabel: string;
  sampleCount: number;
  kindLabel: string;
  sourceLabel: string;
  qualityLabel: string;
  createdAtLabel: string;
  sampleScopeNote: string;
};

export type HistoryItemView = {
  version: number;
  title: string;
  createdAtLabel: string;
  confidenceLabel: string;
  summary: string;
};

export const MARKET_INSIGHT_CAMPAIGN_KEYS = [
  "publishingCadence",
  "budget",
  "ctaStrategy",
  "contentMix",
  "contentPillars",
  "postingSchedule",
] as const;

export const MARKET_ANALYSIS_RAW_CONTRACT_TERMS = [
  "MarketInsight",
  "MarketEvidence",
  "AgentRun",
  "evidenceCodes",
  "supportCount",
  "payload",
  "sourceAgentRunId",
  "KEYWORD_SAMPLE_SIZE",
  "CONTENT_SAMPLE_SIZE",
  "DATA_BACKED",
  "INFERRED",
] as const;

export const CONFIDENCE_NOTE = "可信度反映的是“当前样本对这次分析的支持程度”，不是预测准确率。";
export const SAMPLE_SCOPE_NOTE = "分析结果只代表当前调研样本，不代表平台整体。";
export const USER_FOCUS_MAX = 500;
