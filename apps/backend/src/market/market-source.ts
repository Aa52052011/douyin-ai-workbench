/**
 * Step 13.4 — Market source / reference intake (deterministic, no network).
 */

export const MARKET_SOURCE_ROLES = ["MARKET_EVIDENCE", "REFERENCE_CONTENT", "OWN_CONTENT", "PRODUCTION_ASSET"] as const;
export type MarketSourceRole = (typeof MARKET_SOURCE_ROLES)[number];

export const MARKET_SOURCE_TYPES = [
  "MANUAL_TEXT",
  "KEYWORD",
  "COMPETITOR_NAME",
  "DOUYIN_VIDEO_URL",
  "DOUYIN_ACCOUNT_URL",
  "DOUYIN_URL_UNKNOWN",
  "WEB_URL",
  "UPLOAD_VIDEO",
  "UPLOAD_IMAGE",
  "UPLOAD_SCREENSHOT",
  "SPREADSHEET",
  "SYSTEM_DISCOVERED",
  "PLATFORM_API",
  "OWN_ACCOUNT_METRIC",
  "OTHER",
] as const;
export type MarketSourceType = (typeof MARKET_SOURCE_TYPES)[number];

export const MARKET_SOURCE_PROVENANCE = [
  "USER_PROVIDED",
  "SYSTEM_DISCOVERED",
  "PLATFORM_API",
  "UPLOADED",
  "MANUAL",
] as const;
export type MarketSourceProvenance = (typeof MARKET_SOURCE_PROVENANCE)[number];

export type UrlClassification = {
  sourceType: Extract<
    MarketSourceType,
    "DOUYIN_VIDEO_URL" | "DOUYIN_ACCOUNT_URL" | "DOUYIN_URL_UNKNOWN" | "WEB_URL" | "OTHER"
  >;
  platform: "douyin" | "web" | "unknown";
  canonicalUrl: string | null;
  valid: boolean;
  reason?: string;
};

export type MarketSourceDraftEntry = {
  id: string;
  role: MarketSourceRole;
  sourceType: MarketSourceType;
  platform?: string;
  title?: string;
  text?: string;
  url?: string;
  canonicalUrl?: string;
  assetId?: string;
  competitorName?: string;
  keyword?: string;
  label?: string;
  userNote?: string;
  reasonForReference?: string;
  provenance: MarketSourceProvenance;
  capturedAt: string;
};

export type NormalizedMarketResearchContext = {
  keywords: string[];
  competitors: string[];
  evidenceSummaries: Array<{ id: string; label: string; sourceType: string; url?: string }>;
  referenceSeeds: Array<{ id: string; label: string; sourceType: string; url?: string; assetId?: string }>;
  ownContentSeeds: Array<{ id: string; label: string; sourceType: string; url?: string; assetId?: string }>;
  systemEvidenceSummaries?: Array<{ id: string; label: string; sourceType: string; capturedAt?: string; provenance?: string }>;
  researchCoverage?: {
    keywordsCovered: number;
    competitorsCovered: number;
    videosCovered: number;
    commentsCovered: number;
  } | null;
  researchFreshness?: { latestEvidenceAt: string | null; ageDays: number | null; freshnessLabel: string };
  dataSufficiency: "NONE" | "LIMITED" | "PARTIAL" | "RICH";
  provenanceSummary: {
    userProvidedCount: number;
    uploadedCount: number;
    systemDiscoveredCount: number;
    researchRequested: boolean;
  };
};

const ROLE_LABELS: Record<MarketSourceRole, string> = {
  MARKET_EVIDENCE: "市场研究资料",
  REFERENCE_CONTENT: "爆款参考",
  OWN_CONTENT: "我的历史内容",
  PRODUCTION_ASSET: "可用制作素材",
};

const TYPE_LABELS: Record<MarketSourceType, string> = {
  MANUAL_TEXT: "文字资料",
  KEYWORD: "关键词",
  COMPETITOR_NAME: "竞品",
  DOUYIN_VIDEO_URL: "抖音视频链接",
  DOUYIN_ACCOUNT_URL: "抖音账号",
  DOUYIN_URL_UNKNOWN: "抖音链接（待解析）",
  WEB_URL: "网页链接",
  UPLOAD_VIDEO: "上传视频",
  UPLOAD_IMAGE: "上传图片",
  UPLOAD_SCREENSHOT: "市场截图",
  SPREADSHEET: "表格导入",
  SYSTEM_DISCOVERED: "系统发现",
  PLATFORM_API: "平台接口",
  OWN_ACCOUNT_METRIC: "自有账号数据",
  OTHER: "其它",
};

const TRACKING_QUERY = /^(utm_|spm|from_|share|tt_|campaign|mc_|gclid|fbclid)/i;

export function marketSourceRoleLabel(role: MarketSourceRole): string {
  return ROLE_LABELS[role];
}

export function marketSourceTypeLabel(type: MarketSourceType): string {
  return TYPE_LABELS[type] ?? "其它";
}

export function isMarketSourceRole(value: unknown): value is MarketSourceRole {
  return typeof value === "string" && (MARKET_SOURCE_ROLES as readonly string[]).includes(value);
}

export function isMarketSourceType(value: unknown): value is MarketSourceType {
  return typeof value === "string" && (MARKET_SOURCE_TYPES as readonly string[]).includes(value);
}

/** Deterministic URL classification — never fetches network. */
export function classifyMarketUrl(raw: string): UrlClassification {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { sourceType: "OTHER", platform: "unknown", canonicalUrl: null, valid: false, reason: "empty" };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return { sourceType: "OTHER", platform: "unknown", canonicalUrl: null, valid: false, reason: "invalid" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { sourceType: "OTHER", platform: "unknown", canonicalUrl: null, valid: false, reason: "protocol" };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname;
  const canonical = canonicalizeUrl(parsed);

  // Douyin short links — do not pretend we know the target.
  if (host === "v.douyin.com" || host === "iesdouyin.com") {
    return { sourceType: "DOUYIN_URL_UNKNOWN", platform: "douyin", canonicalUrl: canonical, valid: true };
  }

  if (host === "douyin.com" || host.endsWith(".douyin.com")) {
    if (/\/video\/\d+/i.test(path) || /\/share\/video\//i.test(path)) {
      return { sourceType: "DOUYIN_VIDEO_URL", platform: "douyin", canonicalUrl: canonical, valid: true };
    }
    if (/\/user\//i.test(path) || /\/share\/user\//i.test(path)) {
      return { sourceType: "DOUYIN_ACCOUNT_URL", platform: "douyin", canonicalUrl: canonical, valid: true };
    }
    return { sourceType: "DOUYIN_URL_UNKNOWN", platform: "douyin", canonicalUrl: canonical, valid: true };
  }

  return { sourceType: "WEB_URL", platform: "web", canonicalUrl: canonical, valid: true };
}

export function canonicalizeUrl(input: string | URL): string {
  const url = typeof input === "string" ? new URL(input.includes("://") ? input : `https://${input}`) : new URL(input.toString());
  url.hash = "";
  const kept = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (!TRACKING_QUERY.test(key)) kept.set(key, value);
  });
  url.search = kept.toString() ? `?${kept.toString()}` : "";
  // Prefer https canonical host without www for douyin
  let host = url.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  url.hostname = host;
  url.protocol = "https:";
  // Strip trailing slash except root
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function sourceDedupeKey(entry: Pick<MarketSourceDraftEntry, "role" | "canonicalUrl" | "url" | "assetId" | "keyword" | "competitorName" | "text" | "sourceType">): string {
  if (entry.assetId) return `asset:${entry.role}:${entry.assetId}`;
  if (entry.canonicalUrl || entry.url) {
    const canon = entry.canonicalUrl || (entry.url ? safeCanonical(entry.url) : "");
    return `url:${entry.role}:${canon}`;
  }
  if (entry.keyword) return `kw:${entry.role}:${entry.keyword.trim().toLowerCase()}`;
  if (entry.competitorName) return `comp:${entry.role}:${entry.competitorName.trim().toLowerCase()}`;
  if (entry.text) return `text:${entry.role}:${entry.text.trim().slice(0, 80).toLowerCase()}`;
  return `type:${entry.role}:${entry.sourceType}`;
}

function safeCanonical(url: string): string {
  try {
    return canonicalizeUrl(url);
  } catch {
    return url.trim().toLowerCase();
  }
}

export function upsertMarketSource(
  list: MarketSourceDraftEntry[],
  entry: MarketSourceDraftEntry,
): { list: MarketSourceDraftEntry[]; created: boolean; existingId?: string } {
  const key = sourceDedupeKey(entry);
  const existing = list.find((item) => sourceDedupeKey(item) === key);
  if (existing) {
    return { list, created: false, existingId: existing.id };
  }
  return { list: [...list, entry], created: true };
}

export function buildMarketResearchContext(input: {
  keywords?: string[];
  competitors?: Array<string | { displayName: string }>;
  sources?: MarketSourceDraftEntry[];
  userAcknowledgedLimitedData?: boolean;
  researchRequested?: boolean;
}): NormalizedMarketResearchContext {
  const sources = input.sources ?? [];
  const keywords = [...(input.keywords ?? [])];
  const competitors = (input.competitors ?? []).map((c) => (typeof c === "string" ? c : c.displayName)).filter(Boolean);

  for (const s of sources) {
    if (s.sourceType === "KEYWORD" && s.keyword && !keywords.includes(s.keyword)) keywords.push(s.keyword);
    if (s.sourceType === "COMPETITOR_NAME" && s.competitorName && !competitors.includes(s.competitorName)) {
      competitors.push(s.competitorName);
    }
  }

  const evidenceSummaries = sources
    .filter((s) => s.role === "MARKET_EVIDENCE")
    .map((s) => ({
      id: s.id,
      label: s.label || s.title || s.keyword || s.competitorName || marketSourceTypeLabel(s.sourceType),
      sourceType: s.sourceType,
      url: s.canonicalUrl || s.url,
    }));

  const referenceSeeds = sources
    .filter((s) => s.role === "REFERENCE_CONTENT")
    .map((s) => ({
      id: s.id,
      label: s.label || s.title || marketSourceTypeLabel(s.sourceType),
      sourceType: s.sourceType,
      url: s.canonicalUrl || s.url,
      assetId: s.assetId,
    }));

  const ownContentSeeds = sources
    .filter((s) => s.role === "OWN_CONTENT")
    .map((s) => ({
      id: s.id,
      label: s.label || s.title || marketSourceTypeLabel(s.sourceType),
      sourceType: s.sourceType,
      url: s.canonicalUrl || s.url,
      assetId: s.assetId,
    }));

  // PRODUCTION_ASSET intentionally excluded from market context.
  const materialCount = keywords.length + competitors.length + evidenceSummaries.length;
  let dataSufficiency: NormalizedMarketResearchContext["dataSufficiency"] = "NONE";
  if (materialCount === 0) dataSufficiency = input.userAcknowledgedLimitedData ? "NONE" : "NONE";
  else if (materialCount < 3) dataSufficiency = "LIMITED";
  else if (materialCount < 8) dataSufficiency = "PARTIAL";
  else dataSufficiency = "RICH";

  return {
    keywords,
    competitors,
    evidenceSummaries,
    referenceSeeds,
    ownContentSeeds,
    systemEvidenceSummaries: [],
    researchCoverage: null,
    researchFreshness: { latestEvidenceAt: null, ageDays: null, freshnessLabel: "NONE" },
    dataSufficiency,
    provenanceSummary: {
      userProvidedCount: sources.filter((s) => s.provenance === "USER_PROVIDED" || s.provenance === "MANUAL").length,
      uploadedCount: sources.filter((s) => s.provenance === "UPLOADED").length,
      systemDiscoveredCount: sources.filter((s) => s.provenance === "SYSTEM_DISCOVERED").length,
      researchRequested: Boolean(input.researchRequested),
    },
  };
}

export function createSourceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `src_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
