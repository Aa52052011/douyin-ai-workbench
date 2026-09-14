export type MarketSourceRole = "MARKET_EVIDENCE" | "REFERENCE_CONTENT" | "OWN_CONTENT" | "PRODUCTION_ASSET";
export type MarketSourceType =
  | "KEYWORD"
  | "DOUYIN_VIDEO_URL"
  | "DOUYIN_ACCOUNT_URL"
  | "DOUYIN_URL_UNKNOWN"
  | "WEB_URL"
  | "UPLOAD_VIDEO"
  | "UPLOAD_SCREENSHOT"
  | "UPLOAD_IMAGE"
  | "TEXT"
  | "MANUAL_TEXT"
  | "COMPETITOR_NAME"
  | "SPREADSHEET";
export type MarketSourceProvenance = "USER_PROVIDED" | "IMPORTED_SOURCE" | "UPLOADED";

export type MarketSourceDraftEntry = {
  id: string;
  role: MarketSourceRole;
  sourceType: MarketSourceType;
  provenance?: MarketSourceProvenance | string;
  capturedAt?: string;
  keyword?: string;
  url?: string;
  canonicalUrl?: string;
  competitorName?: string;
  assetId?: string;
  userNote?: string;
  reasonForReference?: string;
  platform?: string;
  title?: string;
  text?: string;
  label?: string;
};

const ROLES: MarketSourceRole[] = ["MARKET_EVIDENCE", "REFERENCE_CONTENT", "OWN_CONTENT", "PRODUCTION_ASSET"];
const TYPES: MarketSourceType[] = [
  "KEYWORD",
  "DOUYIN_VIDEO_URL",
  "DOUYIN_ACCOUNT_URL",
  "DOUYIN_URL_UNKNOWN",
  "WEB_URL",
  "UPLOAD_VIDEO",
  "UPLOAD_SCREENSHOT",
  "UPLOAD_IMAGE",
  "TEXT",
  "MANUAL_TEXT",
  "COMPETITOR_NAME",
  "SPREADSHEET",
];

export function isMarketSourceRole(value: unknown): value is MarketSourceRole {
  return typeof value === "string" && ROLES.includes(value as MarketSourceRole);
}

export function isMarketSourceType(value: unknown): value is MarketSourceType {
  return typeof value === "string" && TYPES.includes(value as MarketSourceType);
}

export function createSourceId(): string {
  return `src_${Math.random().toString(36).slice(2, 10)}`;
}

export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.forEach((_, key) => {
      if (key.toLowerCase().startsWith("utm_")) parsed.searchParams.delete(key);
    });
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function classifyMarketUrl(raw: string): {
  valid: boolean;
  sourceType: MarketSourceType;
  canonicalUrl?: string;
  platform?: string;
} {
  const value = raw.trim();
  if (!/^https?:\/\//i.test(value)) return { valid: false, sourceType: "WEB_URL" };
  const canonicalUrl = canonicalizeUrl(value);
  if (/douyin\.com\/video\//i.test(value)) {
    return { valid: true, sourceType: "DOUYIN_VIDEO_URL", canonicalUrl, platform: "douyin" };
  }
  if (/douyin\.com\/user\//i.test(value)) {
    return { valid: true, sourceType: "DOUYIN_ACCOUNT_URL", canonicalUrl, platform: "douyin" };
  }
  if (/v\.douyin\.com/i.test(value) || /douyin\.com/i.test(value)) {
    return { valid: true, sourceType: "DOUYIN_URL_UNKNOWN", canonicalUrl, platform: "douyin" };
  }
  return { valid: true, sourceType: "WEB_URL", canonicalUrl };
}

export function marketSourceRoleLabel(role: MarketSourceRole): string {
  return {
    MARKET_EVIDENCE: "市场证据",
    REFERENCE_CONTENT: "爆款参考",
    OWN_CONTENT: "自己的内容",
    PRODUCTION_ASSET: "制作素材",
  }[role];
}

export function marketSourceTypeLabel(type: MarketSourceType): string {
  return {
    KEYWORD: "关键词",
    DOUYIN_VIDEO_URL: "公开视频链接",
    DOUYIN_ACCOUNT_URL: "账号主页",
    DOUYIN_URL_UNKNOWN: "抖音链接",
    WEB_URL: "网页链接",
    UPLOAD_VIDEO: "上传视频",
    UPLOAD_SCREENSHOT: "市场截图",
    UPLOAD_IMAGE: "上传图片",
    TEXT: "文字说明",
    MANUAL_TEXT: "文字说明",
    COMPETITOR_NAME: "竞品账号",
    SPREADSHEET: "表格",
  }[type];
}

export function sourceDedupeKey(entry: MarketSourceDraftEntry): string {
  return [entry.role, entry.sourceType, entry.canonicalUrl || entry.url || entry.keyword || entry.assetId || ""].join("|");
}

export function upsertMarketSource(
  list: MarketSourceDraftEntry[],
  entry: MarketSourceDraftEntry,
): { list: MarketSourceDraftEntry[]; created: boolean } {
  const key = sourceDedupeKey(entry);
  const existing = list.find((item) => sourceDedupeKey(item) === key);
  if (existing) return { list, created: false };
  return { list: [...list, entry], created: true };
}

export function buildMarketResearchContext(input: { sources: MarketSourceDraftEntry[]; keywords?: string[] }) {
  return {
    evidenceSummaries: input.sources.filter((item) => item.role === "MARKET_EVIDENCE"),
    referenceSeeds: input.sources.filter((item) => item.role === "REFERENCE_CONTENT"),
    ownContentSeeds: input.sources.filter((item) => item.role === "OWN_CONTENT"),
  };
}
