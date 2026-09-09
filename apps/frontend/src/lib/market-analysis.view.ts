import {
  kindLabel,
  originLabel,
  qualityLabel,
  researchKind,
  researchSampleCount,
  researchSourceLabel,
  sortResearchNewestFirst,
} from "./market-research.form";
import type { MarketResearchRecord } from "./market-research.types";
import {
  CONFIDENCE_NOTE,
  MARKET_ANALYSIS_RAW_CONTRACT_TERMS,
  MARKET_INSIGHT_CAMPAIGN_KEYS,
  SAMPLE_SCOPE_NOTE,
  type EvidenceGroupView,
  type EvidenceSummaryView,
  type HistoryItemView,
  type HumanEvidenceView,
  type InsightItemView,
  type InsightSectionView,
  type InsightView,
  type MarketEvidenceItemRecord,
  type MarketEvidenceRecord,
  type MarketInsightItemRecord,
  type MarketInsightPayload,
  type MarketInsightRecord,
  type ResearchOptionView,
  type ResearchSummaryView,
} from "./market-analysis.types";

const EVIDENCE_TITLES: Record<string, string> = {
  INSUFFICIENT_DATA: "当前样本不足以形成有效分析",
  KEYWORD_SAMPLE_SIZE: "关键词样本数量",
  TOP_REPEATED_RELATED_KEYWORDS: "重复出现的相关关键词",
  SEARCH_RANK_PRESENT: "样本中带有搜索排名",
  VOLUME_SIGNAL_DISTRIBUTION: "样本内量级信号分布",
  COMPETITION_SIGNAL_DISTRIBUTION: "样本内竞争信号分布",
  HIGH_VOLUME_SIGNAL_KEYWORDS: "样本中高热度信号关键词",
  HIGH_COMPETITION_SIGNAL_KEYWORDS: "样本中高竞争信号关键词",
  LOW_COMPETITION_SIGNAL_KEYWORDS: "样本中低竞争信号关键词",
  CONTENT_SAMPLE_SIZE: "作品样本数量",
  SAMPLE_MEDIANS: "样本内中位表现",
  MISSING_CONTENT_METRICS: "部分作品缺少互动指标",
  ABOVE_SAMPLE_MEDIAN_VIEWS: "样本内播放高于中位数的作品",
  ABOVE_SAMPLE_MEDIAN_ENGAGEMENT: "样本内互动高于中位数的作品",
  TOP_SAMPLE_VIEWS_CONTENT: "样本内播放较高的作品",
  TOP_SAMPLE_ENGAGEMENT_CONTENT: "样本内互动较高的作品",
  HASHTAG_FREQUENCY: "样本内话题出现频率",
  CONTENT_KEYWORD_FREQUENCY: "样本内作品关键词频率",
  AUTHOR_FREQUENCY: "样本内作者出现频率",
  DURATION_BUCKET_DISTRIBUTION: "样本内时长分布",
  COMPETITOR_SAMPLE_SIZE: "竞品样本数量",
  FOLLOWER_COUNT_DISTRIBUTION: "样本内粉丝量分布",
  RECENT_POST_COUNT_DISTRIBUTION: "样本内近期作品数分布",
  POSTING_FREQUENCY_SIGNAL_DISTRIBUTION: "样本内更新频率分布",
  ENGAGEMENT_SIGNAL_DISTRIBUTION: "样本内互动信号分布",
  CONTENT_THEME_FREQUENCY: "样本内内容主题频率",
  TOP_FOLLOWER_COUNT_IN_SAMPLE: "样本内粉丝量较高的竞品",
  WEAK_COMPETITOR_IDENTITY_COUNT: "部分竞品缺少稳定标识",
  TREND_SAMPLE_SIZE: "趋势样本数量",
  TOP_RANKED_TRENDS: "样本内排名靠前的趋势",
  HEAT_SIGNAL_DISTRIBUTION: "样本内热度信号分布",
  TREND_CATEGORY_FREQUENCY: "样本内趋势分类频率",
  AUDIENCE_SIGNAL_SAMPLE_SIZE: "用户需求样本数量",
  TOP_REPEATED_TOPICS: "重复出现的用户关注主题",
  SIGNAL_TYPE_DISTRIBUTION: "样本内需求类型分布",
  FREQUENCY_RANKING: "样本内需求出现频次",
  PRODUCT_MARKET_KEYWORD_OVERLAP: "产品关键词与市场样本存在重合",
  LOW_SAMPLE_COVERAGE_FOR_SELLING_POINT: "卖点在当前样本中覆盖有限",
  HIGH_VOLUME_LOW_COMPETITION_SIGNAL: "样本中高量级且低竞争的信号",
};

const EVIDENCE_DESCRIPTIONS: Record<string, string> = {
  INSUFFICIENT_DATA: "这批样本缺少可用于分析的数据。",
  KEYWORD_SAMPLE_SIZE: "当前调研里可用于分析的关键词条数。",
  TOP_REPEATED_RELATED_KEYWORDS: "在当前关键词样本中多次出现的相关词。",
  SEARCH_RANK_PRESENT: "部分关键词样本提供了搜索排名。",
  VOLUME_SIGNAL_DISTRIBUTION: "当前关键词样本的量级信号分布情况。",
  COMPETITION_SIGNAL_DISTRIBUTION: "当前关键词样本的竞争信号分布情况。",
  HIGH_VOLUME_SIGNAL_KEYWORDS: "在当前样本里量级信号较高的关键词。",
  HIGH_COMPETITION_SIGNAL_KEYWORDS: "在当前样本里竞争信号较高的关键词。",
  LOW_COMPETITION_SIGNAL_KEYWORDS: "在当前样本里竞争信号较低的关键词。",
  CONTENT_SAMPLE_SIZE: "当前调研里可用于分析的作品条数。",
  SAMPLE_MEDIANS: "当前作品样本的中位播放和互动。",
  MISSING_CONTENT_METRICS: "当前作品样本中有条目缺少播放或互动数据。",
  ABOVE_SAMPLE_MEDIAN_VIEWS: "相对当前样本中位播放更高的作品。",
  ABOVE_SAMPLE_MEDIAN_ENGAGEMENT: "相对当前样本中位互动更高的作品。",
  TOP_SAMPLE_VIEWS_CONTENT: "当前作品样本中播放相对靠前的条目。",
  TOP_SAMPLE_ENGAGEMENT_CONTENT: "当前作品样本中互动相对靠前的条目。",
  HASHTAG_FREQUENCY: "当前作品样本中重复出现的话题。",
  CONTENT_KEYWORD_FREQUENCY: "当前作品样本中重复出现的关键词。",
  AUTHOR_FREQUENCY: "当前作品样本中重复出现的作者。",
  DURATION_BUCKET_DISTRIBUTION: "当前作品样本的短、中、长时长分布。",
  COMPETITOR_SAMPLE_SIZE: "当前调研里可用于分析的竞品条数。",
  FOLLOWER_COUNT_DISTRIBUTION: "当前竞品样本的粉丝量分布。",
  RECENT_POST_COUNT_DISTRIBUTION: "当前竞品样本的近期更新量分布。",
  POSTING_FREQUENCY_SIGNAL_DISTRIBUTION: "当前竞品样本的更新频率信号。",
  ENGAGEMENT_SIGNAL_DISTRIBUTION: "当前竞品样本的互动信号分布。",
  CONTENT_THEME_FREQUENCY: "当前竞品样本中重复出现的内容主题。",
  TOP_FOLLOWER_COUNT_IN_SAMPLE: "相对当前竞品样本粉丝更多的账号。",
  WEAK_COMPETITOR_IDENTITY_COUNT: "当前竞品样本中有条目缺少稳定账号标识。",
  TREND_SAMPLE_SIZE: "当前调研里可用于分析的趋势条数。",
  TOP_RANKED_TRENDS: "当前趋势样本中排名相对靠前的话题。",
  HEAT_SIGNAL_DISTRIBUTION: "当前趋势样本的热度信号分布。",
  TREND_CATEGORY_FREQUENCY: "当前趋势样本中重复出现的分类。",
  AUDIENCE_SIGNAL_SAMPLE_SIZE: "当前调研里可用于分析的用户需求条数。",
  TOP_REPEATED_TOPICS: "当前用户需求样本中多次出现的主题。",
  SIGNAL_TYPE_DISTRIBUTION: "当前用户需求样本的需求类型分布。",
  FREQUENCY_RANKING: "当前用户需求样本的出现频次排序。",
  PRODUCT_MARKET_KEYWORD_OVERLAP: "产品信息中的关键词与当前市场样本有重合。",
  LOW_SAMPLE_COVERAGE_FOR_SELLING_POINT: "部分产品卖点在当前市场样本中出现较少。",
  HIGH_VOLUME_LOW_COMPETITION_SIGNAL: "当前关键词样本里同时出现较高量级和较低竞争信号的词。",
};

const LIMITATION_LABELS: Record<string, string> = {
  NO_MARKET_DATA: "暂无可分析市场样本",
  LIMITED_SAMPLE: "当前市场样本较少",
  MANUAL_ONLY: "当前主要基于人工补充信息",
  UNKNOWN_SELECTION_METHOD: "样本选择方式未知",
  MISSING_METRICS: "缺少真实表现数据",
  MISSING_CONTENT_METRICS: "缺少真实表现数据",
  INSUFFICIENT_DATA: "当前样本不足以形成有效分析",
  LIMITED_SIGNAL: "样本信号有限",
  SMALL_KEYWORD_SAMPLE: "关键词样本较少",
  NO_MARKET_INSIGHT: "暂无可用市场分析",
  NO_PERFORMANCE_HISTORY: "暂无历史表现数据",
  LIMITED_MARKET_SAMPLE: "当前市场样本较少",
};

const RAW_LIMITATION_CODE_RE =
  /\b(NO_MARKET_DATA|LIMITED_SAMPLE|MANUAL_ONLY|MISSING_METRICS|MISSING_CONTENT_METRICS|INSUFFICIENT_DATA|LIMITED_SIGNAL|SMALL_KEYWORD_SAMPLE|UNKNOWN_SELECTION_METHOD|NO_MARKET_INSIGHT|NO_PERFORMANCE_HISTORY|LIMITED_MARKET_SAMPLE|BRIEF_VERSION_MISMATCH)\b/;

const UNKNOWN_LIMITATION_FALLBACK =
  "当前可用信息仍有限，建议补充更多市场素材或先执行首轮验证。";

export function humanizeLimitationText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (LIMITATION_LABELS[trimmed]) {
    return LIMITATION_LABELS[trimmed];
  }
  if (/^[A-Z][A-Z0-9_]+$/.test(trimmed)) {
    return UNKNOWN_LIMITATION_FALLBACK;
  }
  // Model-generated English caveats that embed raw codes — replace as a whole sentence.
  if (/missing metrics under LIMITED_SAMPLE/i.test(trimmed)) {
    return "当前样本较少，并且缺少真实表现数据。";
  }
  if (/LIMITED_SAMPLE/i.test(trimmed) && /MISSING_METRICS|missing metrics/i.test(trimmed)) {
    return "当前样本较少，并且缺少真实表现数据。";
  }
  if (RAW_LIMITATION_CODE_RE.test(trimmed)) {
    return UNKNOWN_LIMITATION_FALLBACK;
  }
  return trimmed;
}

export function humanizeDataLimitation(value: string): string {
  return humanizeLimitationText(value);
}

const FORBIDDEN_PLATFORM_CLAIMS = ["全网高热关键词", "行业爆款内容", "全抖音", "市场规模"];

export function formatAnalysisTime(value?: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function marketStateLabel(value?: string): string {
  switch (value) {
    case "INSUFFICIENT_DATA":
      return "数据不足";
    case "LIMITED_SIGNAL":
      return "样本信号有限";
    case "ANALYZABLE_SAMPLE":
      return "当前样本可分析";
    default:
      return "";
  }
}

export function analysisConfidenceLabel(value?: string): string {
  switch (value) {
    case "LOW":
      return "可信度较低";
    case "MEDIUM":
      return "可信度一般";
    case "HIGH":
      return "可信度较高";
    default:
      return "";
  }
}

export function shortConfidenceLabel(value?: string): string {
  switch (value) {
    case "LOW":
      return "较低";
    case "MEDIUM":
      return "中等";
    case "HIGH":
      return "较高";
    default:
      return "";
  }
}

export function evidenceKindLabel(value?: string): string {
  switch (value) {
    case "DATA_BACKED":
      return "样本直接支持";
    case "INFERRED":
      return "基于样本推断";
    case "INSUFFICIENT_DATA":
      return "数据不足";
    default:
      return "";
  }
}

export function sufficiencyLabel(value?: string): string {
  return qualityLabel(value);
}

export function researchQualityWarning(sufficiency?: string): string | null {
  if (sufficiency === "LIMITED" || sufficiency === "NONE") {
    return "目前市场信息较少，本轮分析会更多依赖你的产品信息和已确认的研究方向，结论可信度会相对较低。";
  }
  return null;
}

export function noneGenerateNote(sufficiency?: string): string | null {
  if (sufficiency === "NONE") {
    return "当前没有可用市场样本。仍可生成一版低数据市场分析，但不会给出已验证的市场结论。";
  }
  return null;
}

export function humanizeMarketEvidence(item: MarketEvidenceItemRecord): HumanEvidenceView {
  const code = typeof item.code === "string" ? item.code : "";
  const title = EVIDENCE_TITLES[code] ?? "当前样本中的一条分析依据";
  const description = EVIDENCE_DESCRIPTIONS[code] ?? "这条依据来自当前调研样本，只能代表本次导入的数据。";
  const supportCount = typeof item.supportCount === "number" ? item.supportCount : 0;
  return {
    title,
    description,
    supportLabel: `样本支持 ${supportCount} 条`,
    confidenceLabel: analysisConfidenceLabel(item.confidence),
    kindLabel: evidenceKindLabel(item.evidenceKind),
  };
}

export function evidenceCatalog(evidence: MarketEvidenceRecord | null): Map<string, HumanEvidenceView> {
  const catalog = new Map<string, HumanEvidenceView>();
  if (!evidence) {
    return catalog;
  }
  for (const item of listEvidenceItems(evidence)) {
    if (item.code) {
      catalog.set(item.code, humanizeMarketEvidence(item));
    }
  }
  return catalog;
}

export function listEvidenceItems(evidence: MarketEvidenceRecord): MarketEvidenceItemRecord[] {
  return [
    ...(evidence.keywordEvidence ?? []),
    ...(evidence.contentEvidence ?? []),
    ...(evidence.competitorEvidence ?? []),
    ...(evidence.trendEvidence ?? []),
    ...(evidence.audienceEvidence ?? []),
    ...(evidence.opportunityEvidence ?? []),
    ...(evidence.insufficientData ? [evidence.insufficientData] : []),
  ];
}

export function evidenceSummaryView(evidence: MarketEvidenceRecord): EvidenceSummaryView {
  const sample = evidence.sampleSummary ?? {};
  return {
    keywordCount: sample.keywordCount ?? 0,
    contentCount: sample.contentCount ?? 0,
    competitorCount: sample.competitorCount ?? 0,
    trendCount: sample.trendCount ?? 0,
    audienceCount: sample.audienceSignalCount ?? 0,
    sufficiencyLabel: sufficiencyLabel(evidence.dataSufficiency),
    confidenceLabel: analysisConfidenceLabel(evidence.confidence),
    shortConfidenceLabel: shortConfidenceLabel(evidence.confidence),
  };
}

export function evidenceGroupsView(evidence: MarketEvidenceRecord): EvidenceGroupView[] {
  const groups: Array<{ heading: string; items?: MarketEvidenceItemRecord[] }> = [
    { heading: "关键词依据", items: evidence.keywordEvidence },
    { heading: "内容依据", items: evidence.contentEvidence },
    { heading: "竞品依据", items: evidence.competitorEvidence },
    { heading: "趋势依据", items: evidence.trendEvidence },
    { heading: "用户需求依据", items: evidence.audienceEvidence },
    { heading: "机会信号", items: evidence.opportunityEvidence },
  ];
  const views = groups
    .map((group) => ({
      heading: group.heading,
      items: (group.items ?? []).map(humanizeMarketEvidence),
    }))
    .filter((group) => group.items.length > 0);
  if (evidence.insufficientData) {
    views.push({
      heading: "数据不足说明",
      items: [humanizeMarketEvidence(evidence.insufficientData)],
    });
  }
  return views;
}

export function matchEvidenceRefs(codes: string[] | undefined, catalog: Map<string, HumanEvidenceView>): HumanEvidenceView[] {
  return (codes ?? []).flatMap((code) => {
    const matched = catalog.get(code);
    return matched ? [matched] : [];
  });
}

export function researchSelectorOptions(items: MarketResearchRecord[]): ResearchOptionView[] {
  return [...items]
    .sort((a, b) => a.version - b.version || +new Date(a.createdAt) - +new Date(b.createdAt))
    .map((item) => ({
      id: item.id,
      ordinalLabel: `第 ${item.version} 次调研`,
      kindLabel: kindLabel(researchKind(item)),
      sampleCount: researchSampleCount(item),
      qualityLabel: qualityLabel(item.snapshot?.dataQuality?.dataSufficiency),
      createdAtLabel: formatAnalysisTime(item.createdAt),
    }));
}

export function defaultSelectedResearchId(items: MarketResearchRecord[]): string | null {
  return sortResearchNewestFirst(items)[0]?.id ?? null;
}

export function selectedResearchSummary(item: MarketResearchRecord): ResearchSummaryView {
  const briefVersion = item.queryContext?.productBriefVersion;
  return {
    ordinalLabel: `第 ${item.version} 次调研`,
    productBriefVersionLabel: briefVersion ? `基于产品信息版本 ${briefVersion}` : "基于该调研创建时的产品信息",
    sampleCount: researchSampleCount(item),
    kindLabel: kindLabel(researchKind(item)),
    sourceLabel: [researchSourceLabel(item), originLabel(item.queryContext?.origin)].filter(Boolean).join(" · "),
    qualityLabel: qualityLabel(item.snapshot?.dataQuality?.dataSufficiency),
    createdAtLabel: formatAnalysisTime(item.createdAt),
    sampleScopeNote: SAMPLE_SCOPE_NOTE,
  };
}

export function frozenBriefNote(item: MarketResearchRecord): string {
  const version = item.queryContext?.productBriefVersion;
  return version
    ? `本次分析基于该调研创建时的产品信息版本 ${version}。`
    : "本次分析基于该调研创建时的产品信息。";
}

export function sortInsightHistory(items: MarketInsightRecord[]): MarketInsightRecord[] {
  return [...items].sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function latestInsight(items: MarketInsightRecord[]): MarketInsightRecord | null {
  return sortInsightHistory(items)[0] ?? null;
}

export function historyItemViews(items: MarketInsightRecord[]): HistoryItemView[] {
  return sortInsightHistory(items).map((item) => ({
    version: item.version,
    title: `第 ${item.version} 次分析`,
    createdAtLabel: formatAnalysisTime(item.createdAt),
    confidenceLabel: analysisConfidenceLabel(item.payload?.confidence),
    summary: item.payload?.executiveSummary?.trim() || "暂无总结",
  }));
}

export function insightsForSelectedResearch(items: MarketInsightRecord[], researchId: string | null): MarketInsightRecord[] {
  if (!researchId) {
    return [];
  }
  return items.filter((item) => item.marketResearchId === researchId);
}

export function selectedResearchBindings<TEvidence, TInsight>(input: {
  selectedId: string | null;
  loadedResearchId: string | null;
  evidence: TEvidence | null;
  insights: TInsight[];
}): { evidence: TEvidence | null; insights: TInsight[] } {
  if (!input.selectedId || input.selectedId !== input.loadedResearchId) {
    return { evidence: null, insights: [] };
  }
  return { evidence: input.evidence, insights: input.insights };
}

export function toInsightItemView(
  item: MarketInsightItemRecord,
  catalog: Map<string, HumanEvidenceView>,
): InsightItemView | null {
  const statement = item.statement?.trim();
  if (!statement) {
    return null;
  }
  const traces = matchEvidenceRefs(item.evidenceCodes, catalog);
  const count = traces.length || item.evidenceCodes?.length || 0;
  const caveatRaw = item.caveat?.trim();
  const caveat = caveatRaw ? humanizeLimitationText(caveatRaw) : undefined;
  return {
    statement: humanizeLimitationText(statement) || statement,
    confidenceLabel: analysisConfidenceLabel(item.confidence),
    evidenceCountLabel: count > 0 ? `基于 ${count} 条分析依据` : "",
    caveat: caveat || undefined,
    traces,
  };
}

function section(heading: string, items: MarketInsightItemRecord[] | undefined, catalog: Map<string, HumanEvidenceView>): InsightSectionView | null {
  const views = (items ?? []).map((item) => toInsightItemView(item, catalog)).filter((item): item is InsightItemView => Boolean(item));
  if (views.length === 0) {
    return null;
  }
  return { heading, items: views };
}

export function insightView(payload: MarketInsightPayload | undefined, catalog: Map<string, HumanEvidenceView>): InsightView | null {
  if (!payload) {
    return null;
  }
  const sections = [
    section("关键词观察", payload.keywordInsights, catalog),
    section("内容观察", payload.contentInsights, catalog),
    section("竞品观察", payload.competitorInsights, catalog),
    section("趋势观察", payload.trendInsights, catalog),
    section("用户需求观察", payload.audienceInsights, catalog),
    section("值得验证的机会", payload.opportunityInsights, catalog),
    section("对下一步策略的启示", payload.strategicImplications, catalog),
  ].filter((item): item is InsightSectionView => Boolean(item));

  const executiveSummaryRaw = payload.executiveSummary?.trim() ?? "";
  return {
    executiveSummary: executiveSummaryRaw ? humanizeLimitationText(executiveSummaryRaw) : "",
    marketStateLabel: marketStateLabel(payload.marketState),
    sections,
    dataLimitations: (payload.dataLimitations ?? []).map(humanizeDataLimitation).filter(Boolean),
    confidenceLabel: analysisConfidenceLabel(payload.confidence),
    confidenceNote: CONFIDENCE_NOTE,
    rawConfidence: typeof payload.confidence === "string" ? payload.confidence : undefined,
    rawLimitationCodes: [...(payload.dataLimitations ?? [])].filter((item) => typeof item === "string"),
  };
}

export function campaignStrategyHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/strategy`;
}

export function marketResearchHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/market/research`;
}

export function viewModelHasCampaignFields(view: InsightView): boolean {
  const blob = JSON.stringify(view);
  return MARKET_INSIGHT_CAMPAIGN_KEYS.some((key) => blob.includes(key));
}

export function viewModelHasRawContract(view: object): boolean {
  const blob = JSON.stringify(view);
  return MARKET_ANALYSIS_RAW_CONTRACT_TERMS.some((term) => blob.includes(term));
}

export function humanizeMarketAnalysisError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  if (code === "FORBIDDEN" || code === "PERMISSION_DENIED") {
    return "市场分析生成失败，请稍后重试。";
  }
  return "市场分析生成失败，请稍后重试。";
}

export function trimUserFocus(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : undefined;
}

export function evidenceHumanizationAvoidsPlatformClaims(): boolean {
  const blob = `${JSON.stringify(EVIDENCE_TITLES)}${JSON.stringify(EVIDENCE_DESCRIPTIONS)}`;
  return !FORBIDDEN_PLATFORM_CLAIMS.some((claim) => blob.includes(claim));
}
