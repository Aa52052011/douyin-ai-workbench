export const PRODUCT_INTAKE_SCALAR_FIELDS = [
  'productName',
  'industry',
  'businessGoal',
  'targetAudience',
  'description',
  'category',
  'brand',
  'priceRange',
  'conversionGoal',
  'tone',
  'differentiation',
  'usageScenario',
] as const;

export const PRODUCT_INTAKE_ARRAY_FIELDS = [
  'sellingPoints',
  'constraints',
  'referenceCompetitors',
  'seedKeywords',
  'painPoints',
] as const;

export const PRODUCT_INTAKE_ALLOWED_FIELDS = [
  ...PRODUCT_INTAKE_SCALAR_FIELDS,
  ...PRODUCT_INTAKE_ARRAY_FIELDS,
] as const;

export type ProductIntakeFieldKey = (typeof PRODUCT_INTAKE_ALLOWED_FIELDS)[number];

export type ProductIntakeDraft = {
  productName?: string;
  industry?: string;
  businessGoal?: string;
  targetAudience?: string;
  description?: string;
  sellingPoints?: string[];
  category?: string;
  brand?: string;
  priceRange?: string;
  conversionGoal?: string;
  tone?: string;
  constraints?: string[];
  referenceCompetitors?: string[];
  seedKeywords?: string[];
  painPoints?: string[];
  differentiation?: string;
  usageScenario?: string;
};

export type ProductIntakeConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ProductIntakeAgentInput = {
  mode: 'product';
  currentDraft: ProductIntakeDraft;
  recentConversation: ProductIntakeConversationMessage[];
  latestUserMessage: string;
  locale: string;
  /** True when draft was seeded from an existing confirmed ProductBrief. */
  improvingExisting?: boolean;
};

export type ProductIntakeSuggestion = {
  id: string;
  field: ProductIntakeFieldKey;
  value: string | string[];
  label?: string;
};

export type ProductIntakeAgentOutput = {
  message: string;
  draftPatch: ProductIntakeDraft;
  missingFields: ProductIntakeFieldKey[];
  suggestions: ProductIntakeSuggestion[];
  readyForConfirmation: boolean;
};

/** Align with frontend PRODUCT_BRIEF_LIMITS + draft-only caps. */
export const PRODUCT_INTAKE_LIMITS = {
  productName: 120,
  category: 80,
  industry: 80,
  brand: 80,
  description: 2000,
  sellingPoint: 200,
  targetAudience: 500,
  priceRange: 80,
  businessGoal: 500,
  conversionGoal: 500,
  constraint: 200,
  tone: 80,
  competitor: 120,
  seedKeyword: 80,
  differentiation: 200,
  usageScenario: 500,
  painPoint: 200,
  sellingPoints: 12,
  constraints: 12,
  referenceCompetitors: 20,
  seedKeywords: 30,
  painPoints: 12,
  message: 4000,
  conversationMessages: 12,
  conversationContent: 2000,
  suggestions: 8,
} as const;

export const PRODUCT_INTAKE_FIELD_MEANINGS: Record<ProductIntakeFieldKey, string> = {
  productName: '产品或服务的名称（用户明确说出的名字；未说则不要编造）',
  industry: '所属行业',
  businessGoal: '希望通过推广获得的商业结果（如获客、到店咨询），不是内容风格',
  targetAudience: '真正希望触达或转化的人群',
  description: '产品简介：它是什么、做什么',
  sellingPoints: '用户明确认可的核心卖点',
  category: '产品类目',
  brand: '品牌名',
  priceRange: '价格区间',
  conversionGoal: '转化目标（如下单、预约）',
  tone: '内容风格偏好',
  constraints: '不能宣传的内容、法规或品牌限制',
  referenceCompetitors: '用户提到的参考竞品名称',
  seedKeywords: '可用于后续市场/内容探索的关键词',
  painPoints: '用户明确提到的痛点（草稿字段）',
  differentiation: '用户明确提到的差异化（草稿字段）',
  usageScenario: '使用场景（草稿字段）',
};

export const PRODUCT_INTAKE_REQUIRED_FOR_CONFIRM = [
  'productName',
  'industry',
  'businessGoal',
  'targetAudience',
] as const;
