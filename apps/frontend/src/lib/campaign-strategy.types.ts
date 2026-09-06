export const CAMPAIGN_STRATEGY_STATUSES = ["READY", "CONFIRMED", "ARCHIVED"] as const;
export type CampaignStrategyStatus = (typeof CAMPAIGN_STRATEGY_STATUSES)[number];

export const CAMPAIGN_STRATEGY_CONFIDENCES = ["LOW", "MEDIUM", "HIGH"] as const;
export type CampaignStrategyConfidence = (typeof CAMPAIGN_STRATEGY_CONFIDENCES)[number];

export const CAMPAIGN_STRATEGY_PRIORITIES = ["high", "medium", "low"] as const;
export type CampaignStrategyPriority = (typeof CAMPAIGN_STRATEGY_PRIORITIES)[number];

export const CAMPAIGN_STRATEGY_EVIDENCE_TYPES = [
  "PRODUCT_BRIEF",
  "MARKET_INSIGHT",
  "PERFORMANCE_FEEDBACK",
  "ACCOUNT_POSITIONING",
  "USER_GOAL",
] as const;
export type CampaignStrategyEvidenceType = (typeof CAMPAIGN_STRATEGY_EVIDENCE_TYPES)[number];

export const STRATEGY_USER_GOAL_MAX = 500;
export const STRATEGY_FOCUS_MAX = 500;
export const STRATEGY_CONSTRAINTS_MAX = 1000;

export type CampaignStrategyEvidenceBasisRecord = {
  type?: string;
  ref?: string;
  note?: string;
};

export type CampaignStrategyOutputRecord = {
  version?: string;
  objective?: {
    businessGoal?: string;
    conversionGoal?: string;
    primaryObjective?: string;
  };
  targetAudience?: {
    primary?: string;
    secondary?: string;
    pains?: string[];
    motivations?: string[];
  };
  positioning?: {
    accountRole?: string;
    marketPosition?: string;
    differentiation?: string[];
  };
  valuePropositions?: Array<{
    proposition?: string;
    priority?: string;
    evidenceBasis?: CampaignStrategyEvidenceBasisRecord[];
  }>;
  contentPillars?: Array<{
    name?: string;
    purpose?: string;
    priority?: string;
    evidenceBasis?: CampaignStrategyEvidenceBasisRecord[];
  }>;
  contentMix?: Array<{
    type?: string;
    percentage?: number;
    purpose?: string;
  }>;
  creativeAngles?: Array<{
    angle?: string;
    rationale?: string;
    evidenceBasis?: CampaignStrategyEvidenceBasisRecord[];
  }>;
  conversionPath?: {
    awareness?: string;
    consideration?: string;
    conversion?: string;
  };
  ctaStrategy?: {
    principles?: string[];
    allowedDirections?: string[];
  };
  testingStrategy?: {
    hypotheses?: Array<{ hypothesis?: string }>;
    variables?: string[];
    successSignals?: string[];
  };
  publishingCadence?: {
    guidance?: string;
  };
  risks?: Array<{
    risk?: string;
    mitigation?: string;
  }>;
  confidence?: string;
  dataLimitations?: string[];
};

export type CampaignStrategyRecord = {
  id: string;
  projectId?: string;
  version: number;
  status: string;
  productBriefId?: string | null;
  marketResearchId?: string | null;
  marketInsightId?: string | null;
  positioningRunId?: string;
  payload?: unknown;
  inputSnapshot?: unknown;
  createdAt: string;
};

export type CampaignStrategyGenerateResult = {
  strategy: CampaignStrategyRecord;
};

export type StrategyFormState = {
  positioningRunId: string;
  marketResearchId: string;
  marketInsightId: string;
  userGoal: string;
  focus: string;
  constraints: string;
};

export type SourceLabel = string;

export type StrategyItemView = {
  title: string;
  detail?: string;
  priorityLabel?: string;
  sources: SourceLabel[];
};

export type ContentMixItemView = {
  type: string;
  purpose: string;
  percentage?: number;
};

export type StrategyView = {
  objective?: { businessGoal: string; primaryObjective: string; conversionGoal?: string };
  targetAudience?: { primary: string; secondary?: string; pains: string[]; motivations: string[] };
  positioning?: { accountRole: string; marketPosition: string; differentiation: string[] };
  valuePropositions: StrategyItemView[];
  contentPillars: StrategyItemView[];
  contentMix: ContentMixItemView[];
  creativeAngles: StrategyItemView[];
  conversionPath?: { awareness: string; consideration: string; conversion: string };
  ctaStrategy?: { principles: string[]; allowedDirections: string[] };
  testingStrategy?: { hypotheses: string[]; variables: string[]; successSignals: string[] };
  publishingCadence?: string;
  risks: Array<{ risk: string; mitigation?: string }>;
  dataLimitations: string[];
  confidenceLabel: string;
  confidenceNote: string;
};

export type StrategyHistoryItemView = {
  version: number;
  createdAtLabel: string;
  statusLabel: string;
  confidenceLabel: string;
  summary: string;
  readable: boolean;
};

export type PositioningOptionView = {
  runId: string;
  createdAtLabel: string;
  accountPositioning: string;
  audienceSummary: string;
};

export type InsightOptionView = {
  id: string;
  researchId: string;
  researchLabel: string;
  insightLabel: string;
  confidenceLabel: string;
  summary: string;
};

export const STRATEGY_RAW_CONTRACT_TERMS = [
  "CampaignStrategy",
  "inputSnapshot",
  "sourceAgentRunId",
  "AgentRun",
  "payload",
  "confidenceCeiling",
  "dataState",
  "PRODUCT_BRIEF",
  "MARKET_INSIGHT",
  "PERFORMANCE_FEEDBACK",
] as const;

export const STRATEGY_CONFIDENCE_NOTE =
  "可信度表示当前产品、定位、市场和历史数据对这份策略的支持程度。";
