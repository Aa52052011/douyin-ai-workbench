import type { MetricSnapshotRecord } from "./performance.types";
import { hoursSince, resolvePerformanceQuery, sortSnapshotsNewestFirst } from "./performance.form";
import type { PublicationRecord } from "./publication.types";
import { recommendationGroupLabel } from "./ux/publication-monitoring-v5";

type ReviewLike = {
  id: string;
  title: string;
  reason: string;
  evidence: string;
  evidenceLines?: string[];
  observation?: string;
  interpretation?: string;
  recommendedAction?: string;
  uncertainty?: string;
  reviewStatus?: string;
  insufficient?: boolean;
  group?: string;
};

export const AI_REVIEW_TRUTH_NOTICE = "基于手动录入数据 · 建议需你审核，不会自动应用。";
export const LIMITED_SAMPLE_COPY = "样本仍然有限，不适合做强因果判断。";
export const NO_CAUSAL_COPY = "无法仅凭当前数据判断具体原因。";
export const MISSING_EVIDENCE_COPY = "数据依据不足";
export const ACCEPTED_ONLY_HANDOFF_COPY =
  "下一轮内容规划只会参考已采纳建议。";
export const PLANNING_HANDOFF_COPY = "已采纳建议可在下一轮规划时作为参考。";
export const NO_AUTO_APPLY_DETAIL = "这些建议尚未自动应用。下一轮内容规划前，你仍然可以决定是否参考。";
export const ANALYSIS_GENERATION_FAILED = "AI复盘暂时没有生成成功。";
export const ANALYSIS_LOAD_FAILED = "复盘内容加载失败";
export const EMPTY_ANALYSIS_TITLE = "还没有 AI复盘";
export const EMPTY_ANALYSIS_BODY = "当前数据还不足，或尚未生成复盘。";
export const CONFIDENCE_GRASP_HINT = "这是 AI 对该建议的判断把握，不是视频质量评分。";

const TITLE_BY_ID: Record<string, string> = {
  "rec-views-format": "保持清晰的主题包装",
  "rec-likes-engagement": "继续观察点赞互动",
  "rec-comments-cta": "继续观察评论互动",
  "rec-shares-shareability": "增强可分享性",
  "rec-favorites-content": "增加可保存信息",
  "rec-followers-audience": "先观察账号定位",
};

const OBSERVATION_TITLE_BY_ID: Record<string, string> = {
  "rec-views-format": "播放有变化",
  "rec-likes-engagement": "点赞有变化",
  "rec-comments-cta": "评论有变化",
  "rec-shares-shareability": "分享有变化",
  "rec-favorites-content": "收藏有变化",
  "rec-followers-audience": "粉丝有变化",
};

export function recommendationDisplayTitle(input: { id: string; group?: string; recommendedAction?: string }): string {
  return TITLE_BY_ID[input.id] || recommendationGroupLabel(input.group) || "下一步建议";
}

export function observationDisplayTitle(input: { id: string; observation?: string; interpretation?: string }): string {
  const base = OBSERVATION_TITLE_BY_ID[input.id];
  const grew = Boolean(input.observation?.includes("继续增加") || input.interpretation?.includes("继续增加") || /\+\d/.test(input.observation || ""));
  if (base && grew) return base.replace("有变化", "出现增长");
  return base || "数据观察";
}

export function reviewStatusUserLabel(status?: string): string {
  if (status === "ACCEPTED" || status === "APPROVED") return "已采纳";
  if (status === "REJECTED") return "不采纳";
  if (status === "DEFERRED") return "稍后再看";
  return "未审核";
}

export function analysisSufficiencyUserLabel(value?: string): string {
  switch (value) {
    case "EMPTY":
    case "INSUFFICIENT":
    case "INSUFFICIENT_DATA":
      return "还没有足够数据";
    case "SPARSE":
    case "PARTIAL":
      return "数据较少";
    case "BASIC":
      return "已有基础数据";
    case "GOOD":
    case "SUFFICIENT":
      return "数据较充分";
    case "RICH":
      return "数据较丰富";
    default:
      return "";
  }
}

export function reviewHeaderStatus(hasAnalysis: boolean, sufficiency?: string): string {
  if (!hasAnalysis) return analysisSufficiencyUserLabel(sufficiency) || "数据较少";
  if (sufficiency === "EMPTY" || sufficiency === "SPARSE" || sufficiency === "INSUFFICIENT" || sufficiency === "INSUFFICIENT_DATA") {
    return "数据较少";
  }
  return "已生成复盘";
}

export function confidenceGraspLabel(value?: string): string | null {
  if (value === "HIGH") return "高";
  if (value === "MEDIUM") return "中";
  if (value === "LOW") return "低";
  return null;
}

export function evidenceLineForCard(item: Pick<ReviewLike, "evidence" | "evidenceLines" | "insufficient">): string {
  const line = (item.evidenceLines?.find((row) => row.trim()) || item.evidence || "").trim();
  if (!line || item.insufficient) return MISSING_EVIDENCE_COPY;
  return line;
}

export function visibleByPersistedOrder<T>(items: T[], showAll: boolean, limit = 3): T[] {
  return showAll ? items : items.slice(0, limit);
}

export function remainingCount(total: number, visible = 3): number {
  return Math.max(0, total - visible);
}

export type ObservationCardModel = {
  id: string;
  title: string;
  fact: string;
  interpretation: string;
  uncertainty: string;
};

export function observationCardsFromRecommendations(items: ReviewLike[]): ObservationCardModel[] {
  return items.map((item) => ({
    id: item.id,
    title: observationDisplayTitle({ id: item.id, observation: item.observation, interpretation: item.interpretation }),
    fact: evidenceLineForCard(item),
    interpretation: item.interpretation || item.reason || "",
    uncertainty: item.uncertainty || NO_CAUSAL_COPY,
  }));
}

export function observationContext(snapshots: MetricSnapshotRecord[]): { countLabel: string; spanLabel: string } {
  const sorted = sortSnapshotsNewestFirst(snapshots);
  const newest = sorted[0];
  const previous = sorted[1];
  return {
    countLabel: `${snapshots.length} 次`,
    spanLabel: snapshots.length >= 2 ? hoursSince(previous?.observedAt, newest?.observedAt) : "",
  };
}

export function sampleSufficiencyCopy(snapshots: MetricSnapshotRecord[]): string {
  if (snapshots.length === 0) return "";
  const sample = observationContext(snapshots);
  const parts = ["样本有限", `${snapshots.length} 次记录`];
  if (sample.spanLabel) parts.push(`最近观察间隔 ${sample.spanLabel}`);
  return parts.join(" · ");
}

export function resolveAiReviewPublicationSelection(input: {
  queryPublicationId?: string | null;
  eligible: PublicationRecord[];
  hasDataById?: Record<string, boolean>;
}): { publicationId: string; warning: string | null } {
  const query = resolvePerformanceQuery(input.queryPublicationId, input.eligible);
  if (query.publicationId) {
    return query;
  }
  if (input.eligible.length === 1) {
    return { publicationId: input.eligible[0].id, warning: query.warning };
  }
  const dataMap = input.hasDataById ?? {};
  if (input.eligible.length === 0 || Object.keys(dataMap).length === 0) {
    return { publicationId: "", warning: query.warning };
  }
  const ranked = [...input.eligible].sort((a, b) => {
    const aHas = dataMap[a.id] === true ? 1 : 0;
    const bHas = dataMap[b.id] === true ? 1 : 0;
    if (bHas !== aHas) return bHas - aHas;
    return +new Date(b.publishedAt || b.createdAt || 0) - +new Date(a.publishedAt || a.createdAt || 0);
  });
  return { publicationId: ranked[0]?.id ?? "", warning: query.warning };
}

export function reviewCountsFromItems(items: ReviewLike[]) {
  const accepted = items.filter((item) => item.reviewStatus === "ACCEPTED" || item.reviewStatus === "APPROVED");
  const rejected = items.filter((item) => item.reviewStatus === "REJECTED");
  const deferred = items.filter((item) => item.reviewStatus === "DEFERRED");
  const pending = items.filter((item) => {
    const status = item.reviewStatus;
    return status !== "ACCEPTED" && status !== "APPROVED" && status !== "REJECTED" && status !== "DEFERRED";
  });
  return {
    accepted: accepted.length,
    rejected: rejected.length,
    deferred: deferred.length,
    pending: pending.length,
    total: items.length,
  };
}

export function acceptedHandoffItems(items: ReviewLike[]) {
  return items
    .filter((item) => item.reviewStatus === "ACCEPTED" || item.reviewStatus === "APPROVED")
    .map((item) => ({
      action: item.recommendedAction || item.title,
      evidence: evidenceLineForCard(item),
    }));
}

export function excludedFromAcceptedHandoff(items: ReviewLike[]) {
  return items.filter((item) => item.reviewStatus !== "ACCEPTED" && item.reviewStatus !== "APPROVED").map((item) => item.id);
}

export function looksLikeInternalCode(value: string): boolean {
  return /HIGH_|LOW_|rec-|PerformanceAnalysis|ContentFeedbackCycle|reviewStatus/.test(value);
}
