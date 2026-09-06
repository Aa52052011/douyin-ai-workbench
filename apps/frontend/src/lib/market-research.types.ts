export const MARKET_IMPORT_KINDS = [
  "CONTENT",
  "KEYWORD",
  "COMPETITOR",
  "TREND",
  "AUDIENCE_SIGNAL",
] as const;

export type MarketImportKind = (typeof MARKET_IMPORT_KINDS)[number];

export const MARKET_IMPORT_MAPPING_VERSION = "market-import-v1";
export const MARKET_IMPORT_MAX_FILE_BYTES = 1 * 1024 * 1024;
export const MARKET_IMPORT_MAX_ROWS = 200;
export const MARKET_IMPORT_ALLOWED_EXTENSIONS = [".csv", ".xlsx"] as const;

export const MARKET_IMPORT_FIELDS_BY_KIND: Record<MarketImportKind, readonly string[]> = {
  CONTENT: [
    "title",
    "externalContentId",
    "externalUrl",
    "author",
    "publishedAt",
    "durationSeconds",
    "views",
    "likes",
    "comments",
    "shares",
    "favorites",
    "completionRate",
    "hashtags",
    "keywords",
    "collectedAt",
    "sourceContext",
  ],
  KEYWORD: [
    "keyword",
    "relatedKeywords",
    "searchRank",
    "trendScore",
    "volumeSignal",
    "competitionSignal",
    "collectedAt",
    "sourceContext",
  ],
  COMPETITOR: [
    "displayName",
    "externalAccountId",
    "profileUrl",
    "followerCount",
    "recentPostCount",
    "postingFrequencySignal",
    "engagementSignal",
    "contentThemes",
    "collectedAt",
    "sourceContext",
  ],
  TREND: ["name", "rank", "heatSignal", "category", "startedAt", "observedAt", "collectedAt", "sourceContext"],
  AUDIENCE_SIGNAL: ["topic", "signalType", "frequency", "examples", "collectedAt", "sourceContext"],
};

export const MARKET_IMPORT_REQUIRED_BY_KIND: Record<MarketImportKind, readonly string[]> = {
  CONTENT: [],
  KEYWORD: ["keyword"],
  COMPETITOR: ["displayName"],
  TREND: ["name"],
  AUDIENCE_SIGNAL: ["topic", "signalType"],
};

export const MARKET_IMPORT_FORBIDDEN_TARGETS = [
  "kind",
  "source",
  "platform",
  "canonicalKey",
  "provenance",
  "productBriefId",
  "tenantId",
  "workspaceId",
  "projectId",
] as const;

export const MARKET_IMPORT_FIELD_LABELS: Record<string, string> = {
  title: "作品标题",
  externalContentId: "作品 ID",
  externalUrl: "作品链接",
  author: "作者",
  publishedAt: "发布时间",
  durationSeconds: "时长（秒）",
  views: "播放量",
  likes: "点赞量",
  comments: "评论量",
  shares: "分享量",
  favorites: "收藏量",
  completionRate: "完播率",
  hashtags: "话题",
  keywords: "关键词",
  collectedAt: "采集时间",
  sourceContext: "样本说明",
  keyword: "关键词",
  relatedKeywords: "相关词",
  searchRank: "搜索排名",
  trendScore: "趋势分",
  volumeSignal: "量级信号",
  competitionSignal: "竞争信号",
  displayName: "账号名称",
  externalAccountId: "账号 ID",
  profileUrl: "主页链接",
  followerCount: "粉丝数",
  recentPostCount: "近期作品数",
  postingFrequencySignal: "更新频率",
  engagementSignal: "互动信号",
  contentThemes: "内容主题",
  name: "趋势名称",
  rank: "排名",
  heatSignal: "热度信号",
  category: "分类",
  startedAt: "开始时间",
  observedAt: "观察时间",
  topic: "关注主题",
  signalType: "需求类型",
  frequency: "出现频次",
  examples: "需求例句",
};

export const KIND_LABELS: Record<MarketImportKind, { label: string; description: string }> = {
  CONTENT: { label: "作品数据", description: "用于分析内容表现、标题、标签、时长等样本" },
  KEYWORD: { label: "关键词", description: "用于分析关键词覆盖、相关词和竞争信号" },
  COMPETITOR: { label: "竞品账号", description: "用于分析竞品规模、内容主题和活跃度" },
  TREND: { label: "趋势话题", description: "用于分析当前样本里的趋势话题与热度信号" },
  AUDIENCE_SIGNAL: { label: "用户需求", description: "用于整理用户关注主题与需求信号" },
};

export const ORIGIN_OPTIONS = [
  { value: "THIRD_PARTY", label: "第三方导出" },
  { value: "MANUAL_EXPORT", label: "手工导出" },
  { value: "DOUYIN_VISIBLE_PAGE", label: "抖音可见页面整理" },
  { value: "UNKNOWN", label: "不确定" },
] as const;

export const SELECTION_OPTIONS = [
  { value: "MANUAL_CURATED", label: "手工挑选" },
  { value: "SEARCH_RESULT_PAGE", label: "搜索结果页" },
  { value: "COMPETITOR_ACCOUNT_RECENT_POSTS", label: "竞品近期作品" },
  { value: "THIRD_PARTY_EXPORT", label: "第三方导出" },
  { value: "UNKNOWN", label: "不确定" },
] as const;

export type MarketImportOrigin = (typeof ORIGIN_OPTIONS)[number]["value"];
export type MarketImportSelectionMethod = (typeof SELECTION_OPTIONS)[number]["value"];

export type MarketDataQualityView = {
  dataSufficiency?: string;
  confidence?: string;
  importOnly?: boolean;
  sampleSize?: { total?: number };
};

export type MarketSampleStatsView = {
  contentCount?: number;
  keywordCount?: number;
  competitorCount?: number;
  trendCount?: number;
  audienceSignalCount?: number;
  medianViews?: number | null;
  medianEngagementRate?: number | null;
};

export type MarketImportPreviewRow = {
  rowNumber: number;
  cells: Record<string, string | null>;
  warnings?: string[];
  errors?: string[];
};

export type MarketImportPreview = {
  fileName: string;
  format: "CSV" | "XLSX";
  kind: MarketImportKind;
  mappingVersion: string;
  fileFingerprint: string;
  normalizedItemsFingerprint?: string;
  detectedColumns: string[];
  resolvedMapping: Record<string, string>;
  ignoredColumns?: string[];
  rows: MarketImportPreviewRow[];
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
    warningRows: number;
  };
  sampleStatsPreview?: MarketSampleStatsView;
  dataQualityPreview?: MarketDataQualityView;
  collectedAt?: string;
  collectedAtAssumed?: boolean;
  warnings?: string[];
  productBriefId?: string;
  productBriefVersion?: number;
};

export type MarketResearchRecord = {
  id: string;
  version: number;
  status: string;
  createdAt: string;
  productBriefSnapshot?: { productName?: string };
  queryContext?: {
    source?: string;
    kind?: string;
    itemCount?: number;
    origin?: string;
    selectionMethod?: string;
    collectedAt?: string;
    collectedAtAssumed?: boolean;
    productBriefVersion?: number;
    duplicateCount?: number;
  };
  snapshot?: {
    collectedAt?: string;
    sampleStats?: MarketSampleStatsView;
    dataQuality?: MarketDataQualityView;
    keywords?: unknown[];
    contents?: unknown[];
    competitors?: unknown[];
    trends?: unknown[];
    audienceSignals?: unknown[];
  };
};
