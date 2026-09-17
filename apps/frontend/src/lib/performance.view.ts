import { formatObservedAt, hoursSince, sortSnapshotsNewestFirst } from "./performance.form";
import {
  PERFORMANCE_RAW_TERMS,
  type InsightView,
  type MetricCardView,
  type MetricSnapshotRecord,
  type PerformanceInsightResult,
  type PerformanceSummaryRecord,
} from "./performance.types";
import {
  evidenceForInsight,
  INSUFFICIENT_EVIDENCE_COPY,
  mayShowRetentionClaim,
  metricSourceUserCopy,
} from "./ux/publication-monitoring-v5";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseMetricsList(value: unknown): MetricSnapshotRecord[] | null {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return null;
  }
  const items = value.items.map(parseMetricSnapshot);
  if (items.some((item) => item == null)) {
    return null;
  }
  return items.filter((item): item is MetricSnapshotRecord => item != null);
}

export function parseSummary(value: unknown): PerformanceSummaryRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const latest = isRecord(value.latest) ? value.latest : value.latest === null ? null : undefined;
  return {
    snapshotCount: typeof value.snapshotCount === "number" ? value.snapshotCount : undefined,
    latest: latest
      ? {
          views: typeof latest.views === "number" ? latest.views : null,
          likes: typeof latest.likes === "number" ? latest.likes : null,
          comments: typeof latest.comments === "number" ? latest.comments : null,
          shares: typeof latest.shares === "number" ? latest.shares : null,
          favorites: typeof latest.favorites === "number" ? latest.favorites : null,
          averageWatchTimeSeconds: typeof latest.averageWatchTimeSeconds === "number" ? latest.averageWatchTimeSeconds : null,
          completionRate: typeof latest.completionRate === "number" ? latest.completionRate : null,
          newFollowers: typeof latest.newFollowers === "number" ? latest.newFollowers : null,
          likeRate: typeof latest.likeRate === "number" ? latest.likeRate : null,
          commentRate: typeof latest.commentRate === "number" ? latest.commentRate : null,
          shareRate: typeof latest.shareRate === "number" ? latest.shareRate : null,
          favoriteRate: typeof latest.favoriteRate === "number" ? latest.favoriteRate : null,
          observedAt: typeof latest.observedAt === "string" ? latest.observedAt : undefined,
        }
      : latest === null
        ? null
        : undefined,
  };
}

export function parseInsights(value: unknown): PerformanceInsightResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const insights = Array.isArray(value.insights)
    ? value.insights
        .filter(isRecord)
        .map((item) => ({
          code: typeof item.code === "string" ? item.code : undefined,
          category: typeof item.category === "string" ? item.category : undefined,
          severity: typeof item.severity === "string" ? item.severity : undefined,
          confidence: typeof item.confidence === "string" ? item.confidence : undefined,
        }))
    : [];
  return {
    dataSufficiency: typeof value.dataSufficiency === "string" ? value.dataSufficiency : undefined,
    insights,
  };
}

export function parseMetricSnapshot(value: unknown): MetricSnapshotRecord | null {
  if (!isRecord(value) || !asText(value.observedAt)) {
    return null;
  }
  return {
    observedAt: String(value.observedAt),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : undefined,
    source: typeof value.source === "string" ? value.source : undefined,
    views: typeof value.views === "number" ? value.views : null,
    likes: typeof value.likes === "number" ? value.likes : null,
    comments: typeof value.comments === "number" ? value.comments : null,
    shares: typeof value.shares === "number" ? value.shares : null,
    favorites: typeof value.favorites === "number" ? value.favorites : null,
    averageWatchTimeSeconds: typeof value.averageWatchTimeSeconds === "number" ? value.averageWatchTimeSeconds : null,
    completionRate: typeof value.completionRate === "number" ? value.completionRate : null,
    newFollowers: typeof value.newFollowers === "number" ? value.newFollowers : null,
  };
}

export function metricFieldLabel(key: string): string {
  switch (key) {
    case "views":
      return "播放量";
    case "likes":
      return "点赞";
    case "comments":
      return "评论";
    case "shares":
      return "分享";
    case "favorites":
      return "收藏";
    case "completionRate":
      return "完播率";
    case "averageWatchTimeSeconds":
      return "平均观看时长";
    case "newFollowers":
      return "新增粉丝";
    default:
      return "";
  }
}

export function metricSourceLabel(source?: string): string {
  switch (source) {
    case "MANUAL":
      return "手工录入";
    case "IMPORT":
      return "文件导入";
    default:
      return "";
  }
}

export function displayMetricValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

export function formatCount(value?: number | null): string {
  return displayMetricValue(value);
}

export function formatRate(value?: number | null): string {
  return typeof value === "number" ? `${Math.round(value * 1000) / 10}%` : "—";
}

export function formatSeconds(value?: number | null): string {
  return typeof value === "number" ? `${value} 秒` : "—";
}

export function latestMetricCards(snapshot: MetricSnapshotRecord | null, summary?: PerformanceSummaryRecord | null): MetricCardView[] {
  const latest = snapshot ?? summary?.latest ?? null;
  if (!latest) {
    return [];
  }
  const cards: MetricCardView[] = [
    { label: "播放量", value: formatCount(latest.views) },
    { label: "点赞", value: formatCount(latest.likes) },
    { label: "评论", value: formatCount(latest.comments) },
    { label: "分享", value: formatCount(latest.shares) },
    { label: "收藏", value: formatCount(latest.favorites) },
    { label: "新增粉丝", value: formatCount(latest.newFollowers) },
  ];
  if (mayShowRetentionClaim(latest.completionRate)) {
    cards.push({ label: "完播率", value: formatRate(latest.completionRate) });
  }
  if (mayShowRetentionClaim(latest.averageWatchTimeSeconds)) {
    cards.push({ label: "平均观看时长", value: formatSeconds(latest.averageWatchTimeSeconds) });
  }
  const rates = summary?.latest;
  if (rates && (rates.likeRate != null || rates.commentRate != null || rates.shareRate != null)) {
    cards.push(
      { label: "点赞率", value: formatRate(rates.likeRate) },
      { label: "评论率", value: formatRate(rates.commentRate) },
      { label: "分享率", value: formatRate(rates.shareRate) },
    );
  }
  return cards;
}

export function summaryCards(summary: PerformanceSummaryRecord | null): MetricCardView[] {
  if (!summary) {
    return [];
  }
  return [
    { label: "最新播放量", value: formatCount(summary.latest?.views) },
    { label: "互动情况", value: interactionLabel(summary) },
    { label: "数据记录", value: `${summary.snapshotCount ?? 0} 次` },
    { label: "观测覆盖", value: coverageLabel(summary) },
  ];
}

function interactionLabel(summary: PerformanceSummaryRecord): string {
  const likes = summary.latest?.likes;
  const comments = summary.latest?.comments;
  if (likes == null && comments == null) {
    return "暂无互动数据";
  }
  return `点赞 ${formatCount(likes)} · 评论 ${formatCount(comments)}`;
}

function coverageLabel(summary: PerformanceSummaryRecord): string {
  const count = summary.snapshotCount ?? 0;
  if (count === 0) return "还没有足够数据";
  if (count === 1) return "样本有限";
  return "数据可用";
}

export function dataSufficiencyLabel(value?: string): string {
  switch (value) {
    case "INSUFFICIENT":
      return "还没有足够数据";
    case "PARTIAL":
      return "样本有限";
    case "SUFFICIENT":
      return "数据可用";
    default:
      return "";
  }
}

export function humanizePerformanceInsight(code?: string): string {
  switch (code) {
    case "HIGH_LIKE_RATE":
      return "点赞表现较好";
    case "LOW_LIKE_RATE":
      return "点赞互动偏弱";
    case "HIGH_COMMENT_RATE":
      return "评论互动较活跃";
    case "HIGH_SHARE_RATE":
      return "分享传播较好";
    case "HIGH_FAVORITE_RATE":
      return "收藏表现较好";
    case "HIGH_ENGAGEMENT_RATE":
      return "整体互动较活跃";
    case "LOW_ENGAGEMENT_RATE":
      return "整体互动偏弱";
    case "STRONG_COMPLETION_RATE":
      return "完播表现较好";
    case "WEAK_COMPLETION_RATE":
      return "完播表现偏弱";
    case "INSUFFICIENT_DATA":
      return "当前数据还不足以判断";
    case "MIXED_SOURCE_DATA":
      return "数据来源不完全一致";
    case "METRIC_DECREASE_DETECTED":
      return "部分指标较上次下降";
    case "SAME_TIME_CONFLICT":
      return "同一时间点存在冲突记录";
    default:
      return "";
  }
}

export function insightObservationText(code?: string): string {
  const label = humanizePerformanceInsight(code);
  if (!label) {
    return "";
  }
  return `当前数据中观察到${label}。`;
}

export function isQualityInsight(code?: string): boolean {
  return code === "INSUFFICIENT_DATA" || code === "MIXED_SOURCE_DATA" || code === "METRIC_DECREASE_DETECTED" || code === "SAME_TIME_CONFLICT";
}

export function performanceReviewItems(
  result: PerformanceInsightResult | null,
  snapshots: MetricSnapshotRecord[],
  hasRetention = false,
) {
  const sorted = sortSnapshotsNewestFirst(snapshots);
  const latest = sorted[0];
  const previous = sorted[1];
  return (result?.insights ?? [])
    .map((item, index) => {
      const title = humanizePerformanceInsight(item.code);
      if (!title) return null;
      if (!hasRetention && (item.code === "STRONG_COMPLETION_RATE" || item.code === "WEAK_COMPLETION_RATE")) {
        return null;
      }
      const evidence = evidenceForInsight(item.code, previous, latest);
      return {
        id: item.code ?? `rec-${index}`,
        title,
        reason: "基于目前数据，这条内容还有以下可优化空间",
        evidence,
        confidence: evidence === INSUFFICIENT_EVIDENCE_COPY ? "UNKNOWN" : item.confidence,
        type: item.severity === "positive" ? "STRENGTH" : item.severity === "negative" ? "WEAKNESS" : "OBSERVATION",
        group: item.category,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item != null);
}

export function insightViews(result: PerformanceInsightResult | null, hasRetention = false): InsightView[] {
  return (result?.insights ?? [])
    .filter((item) => {
      if (!hasRetention && (item.code === "STRONG_COMPLETION_RATE" || item.code === "WEAK_COMPLETION_RATE")) {
        return false;
      }
      return true;
    })
    .map((item) => ({
      text: insightObservationText(item.code),
      isQuality: isQualityInsight(item.code),
    }))
    .filter((item) => Boolean(item.text));
}

export function performanceSignals(result: PerformanceInsightResult | null, hasRetention = false): InsightView[] {
  return insightViews(result, hasRetention).filter((item) => !item.isQuality);
}

export function insufficientDataCopy(): string {
  return "目前数据还不足以形成稳定优化建议。继续积累更多已发布作品的数据。";
}

export function limitedSampleCopy(): string {
  return "多记录几条已发布作品，优化建议会更可靠。";
}

export function noPublishedEmptyTitle(): string {
  return "还没有已发布作品";
}

export function noMetricsEmptyTitle(): string {
  return "还没有表现数据";
}

export function optimizationScopeNote(): string {
  return "以下信号来自当前所选作品，不是项目长期建议，也不等于完整优化建议。";
}

export function feedbackLoopCopy(): string {
  return "系统会在你生成下一期内容计划时，自动参考当前项目的最新发布表现，同时保留你已选定的推广策略。";
}

export function optimizationPretendsFullFeedback(): boolean {
  return false;
}

export function metricHistoryRows(items: MetricSnapshotRecord[], _publishedAt?: string | null) {
  const sorted = sortSnapshotsNewestFirst(items);
  return sorted.map((item, index) => {
    const previousObservedAt = sorted[index + 1]?.observedAt;
    return {
      observedAtLabel: formatObservedAt(item.observedAt),
      hoursLabel: hoursSince(previousObservedAt, item.observedAt),
      views: displayMetricValue(item.views),
      likes: displayMetricValue(item.likes),
      comments: displayMetricValue(item.comments),
      shares: displayMetricValue(item.shares),
      favorites: displayMetricValue(item.favorites),
      changeLabel: displayMetricValue(item.newFollowers),
      sourceLabel: metricSourceUserCopy(item.source),
      readable: Boolean(parseMetricSnapshot(item)),
    };
  });
}

export function viewModelHasRawContract(view: object): boolean {
  return PERFORMANCE_RAW_TERMS.some((term) => JSON.stringify(view).includes(term));
}

export function hasCausalLanguage(text: string): boolean {
  return /因为|一定会爆|所以涨粉/.test(text);
}
