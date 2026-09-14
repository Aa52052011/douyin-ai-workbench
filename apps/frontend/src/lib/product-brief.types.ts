export type ProductBriefPayload = {
  productName: string;
  industry: string;
  businessGoal: string;
  /** Optional normalized goal code (Step 13.2). Missing on legacy briefs — normalize on read. */
  goalCode?: string;
  category?: string;
  brand?: string;
  description?: string;
  sellingPoints?: string[];
  targetAudience?: string;
  priceRange?: string;
  conversionGoal?: string;
  constraints?: string[];
  tone?: string;
  referenceCompetitors?: string[];
  seedKeywords?: string[];
};

export type ProductBriefRecord = {
  id: string;
  projectId: string;
  version: number;
  payload: ProductBriefPayload;
  createdAt: string;
  updatedAt: string;
};

export const PRODUCT_BRIEF_LIMITS = {
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
  sellingPoints: 12,
  constraints: 12,
  referenceCompetitors: 20,
  seedKeywords: 30,
} as const;

export const PRODUCT_BRIEF_FIELD_LABELS = {
  productName: "产品名称",
  brand: "品牌",
  industry: "行业",
  category: "产品类目",
  description: "产品简介",
  businessGoal: "推广目标",
  conversionGoal: "转化目标",
  priceRange: "价格区间",
  sellingPoints: "核心卖点",
  targetAudience: "目标人群",
  seedKeywords: "种子关键词",
  referenceCompetitors: "参考竞品",
  tone: "内容风格",
  constraints: "内容限制",
} as const;

export const PRODUCT_BRIEF_REQUIRED_FIELDS = ["productName", "industry", "businessGoal"] as const;
