export const MARKET_INTAKE_STRING_ARRAY_FIELDS = [
  'keywords',
  'userObservations',
  'customerQuestions',
  'commonPainPoints',
  'commonSellingPoints',
  'marketHypotheses',
] as const;

export const MARKET_INTAKE_OBJECT_ARRAY_FIELDS = [
  'competitorAccounts',
  'competitorVideos',
  'publicLinks',
] as const;

/** Fields AI may write into draftPatch / suggestions. */
export const MARKET_INTAKE_ALLOWED_FIELDS = [
  ...MARKET_INTAKE_STRING_ARRAY_FIELDS,
  ...MARKET_INTAKE_OBJECT_ARRAY_FIELDS,
] as const;

/** Forbidden for AI patches (user-only or non-AI). */
export const MARKET_INTAKE_AI_FORBIDDEN_FIELDS = [
  'userAcknowledgedLimitedData',
  'uploadedSources',
  'thirdPartyData',
] as const;

export type MarketIntakeFieldKey = (typeof MARKET_INTAKE_ALLOWED_FIELDS)[number];

export type MarketCompetitorAccountDraft = {
  displayName: string;
  note?: string;
  profileUrl?: string;
};

export type MarketLinkDraft = {
  url: string;
  label?: string;
};

export type MarketIntakeDraft = {
  keywords?: string[];
  competitorAccounts?: MarketCompetitorAccountDraft[];
  competitorVideos?: MarketLinkDraft[];
  publicLinks?: MarketLinkDraft[];
  userObservations?: string[];
  customerQuestions?: string[];
  commonPainPoints?: string[];
  commonSellingPoints?: string[];
  marketHypotheses?: string[];
};

export type MarketIntakeConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/** Safe ProductBrief payload subset for model context (no DB ids). */
export type MarketIntakeProductBriefContext = {
  productName: string;
  industry: string;
  businessGoal: string;
  targetAudience?: string;
  description?: string;
  sellingPoints?: string[];
  seedKeywords?: string[];
};

export type MarketIntakeAgentInput = {
  mode: 'market';
  confirmedProductBrief: MarketIntakeProductBriefContext;
  currentDraft: MarketIntakeDraft;
  recentConversation: MarketIntakeConversationMessage[];
  latestUserMessage: string;
  locale: string;
  noDataAllowed: true;
  improvingExisting?: boolean;
};

export type MarketIntakeSuggestion = {
  id: string;
  field: MarketIntakeFieldKey;
  value: string | string[] | MarketCompetitorAccountDraft | MarketLinkDraft;
  label?: string;
  rationale?: string;
};

export type MarketIntakeAgentOutput = {
  message: string;
  draftPatch: MarketIntakeDraft;
  missingAreas: string[];
  suggestions: MarketIntakeSuggestion[];
  readyForConfirmation: boolean;
};

export const MARKET_INTAKE_LIMITS = {
  keyword: 80,
  keywords: 40,
  competitorName: 80,
  competitors: 40,
  note: 200,
  url: 500,
  links: 40,
  observation: 500,
  observations: 40,
  question: 500,
  questions: 40,
  painPoint: 200,
  painPoints: 40,
  sellingPoint: 200,
  sellingPoints: 40,
  hypothesis: 500,
  hypotheses: 20,
  message: 4000,
  conversationMessages: 12,
  conversationContent: 2000,
  suggestions: 8,
} as const;

export const MARKET_INTAKE_FIELD_MEANINGS: Record<MarketIntakeFieldKey, string> = {
  keywords: '用户明确提到的市场/内容研究方向关键词（不是已验证热搜）',
  competitorAccounts: '用户明确提到的竞品账号（displayName + 可选 profileUrl/note）',
  competitorVideos: '用户明确给出的竞品/公开视频链接（仅记录 URL，未抓取）',
  publicLinks: '用户给出的公开资料 URL（仅记录，未抓取）',
  userObservations: '用户自己的市场观察（用户观点，非验证事实）',
  customerQuestions: '用户提到的客户常见问题',
  commonPainPoints: '用户提到的常见痛点',
  commonSellingPoints: '用户提到的常见卖点表达',
  marketHypotheses: '用户确认的研究方向假设（hypothesis，非 MarketInsight）',
};

export const MARKET_INTAKE_MISSING_AREA_ORDER = [
  'keywords',
  'competitorAccounts',
  'publicLinks',
  'userObservations',
  'customerQuestions',
  'commonPainPoints',
  'commonSellingPoints',
  'marketHypotheses',
] as const;
