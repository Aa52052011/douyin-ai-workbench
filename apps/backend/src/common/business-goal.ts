/**
 * Step 13.2 — Business Goal codes (backend mirror, deterministic).
 */
export const BUSINESS_GOAL_CODES = [
  "FOLLOW_GROWTH",
  "LEAD_GENERATION",
  "PRIVATE_MESSAGE",
  "STORE_VISIT",
  "SALES",
  "BRAND_AWARENESS",
  "RECRUITMENT",
  "OTHER",
] as const;

export type BusinessGoalCode = (typeof BUSINESS_GOAL_CODES)[number];

export type BusinessGoalView = {
  goalCode: BusinessGoalCode;
  goalLabel: string;
  goalDescription: string;
};

export const BUSINESS_GOAL_LABELS: Record<BusinessGoalCode, string> = {
  FOLLOW_GROWTH: "涨粉",
  LEAD_GENERATION: "获客",
  PRIVATE_MESSAGE: "私信咨询",
  STORE_VISIT: "到店",
  SALES: "成交",
  BRAND_AWARENESS: "品牌曝光",
  RECRUITMENT: "招商",
  OTHER: "其它",
};

const CODE_SET = new Set<string>(BUSINESS_GOAL_CODES);

export function isBusinessGoalCode(value: unknown): value is BusinessGoalCode {
  return typeof value === "string" && CODE_SET.has(value);
}

export function inferGoalCodeFromText(text: string): BusinessGoalCode {
  const t = text.trim().toLowerCase();
  if (!t) return "OTHER";
  if (/私信|私聊|站内信|抖音私信|留言咨询/.test(t)) return "PRIVATE_MESSAGE";
  if (/到店|进店|来店|线下到访|到店咨询/.test(t)) return "STORE_VISIT";
  if (/加盟|招商|代理商|经销商|招代理/.test(t)) return "RECRUITMENT";
  if (/成交|下单|卖货|带货|转化成单|直接卖|销量|订单/.test(t)) return "SALES";
  if (/品牌曝光|品牌认知|品牌知名|打品牌|品牌声量|知名度/.test(t)) return "BRAND_AWARENESS";
  if (/涨粉|粉丝|关注|吸粉|涨关/.test(t)) return "FOLLOW_GROWTH";
  if (/获客|客户|线索|潜客|咨询|引流|拓客|获取客户/.test(t)) return "LEAD_GENERATION";
  return "OTHER";
}

export function normalizeBusinessGoal(input: {
  businessGoal?: string | null;
  goalCode?: string | null;
  goalDescription?: string | null;
}): BusinessGoalView {
  const description = (input.goalDescription ?? input.businessGoal ?? "").trim();
  if (isBusinessGoalCode(input.goalCode)) {
    return {
      goalCode: input.goalCode,
      goalLabel: BUSINESS_GOAL_LABELS[input.goalCode],
      goalDescription: description || BUSINESS_GOAL_LABELS[input.goalCode],
    };
  }
  const code = inferGoalCodeFromText(description);
  return {
    goalCode: code,
    goalLabel: BUSINESS_GOAL_LABELS[code],
    goalDescription: description || BUSINESS_GOAL_LABELS[code],
  };
}
