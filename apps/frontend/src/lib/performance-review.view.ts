import type { RecommendationReviewItem } from "../components/recommendation-review-v5";
import type { ActionableRecommendationRecord, PerformanceAnalysisRecord } from "./performance-analysis.api";
import { recommendationDisplayTitle } from "./ai-review.workspace";

export const REVIEW_SAVE_FAILED = "保存决策失败，请重试";

export function persistedDecision(status?: string): "approve" | "reject" | "defer" | undefined {
  if (status === "ACCEPTED" || status === "APPROVED") return "approve";
  if (status === "REJECTED") return "reject";
  if (status === "DEFERRED") return "defer";
  return undefined;
}

export function persistedDecisionLabel(status?: string): string {
  if (status === "ACCEPTED" || status === "APPROVED") return "已采纳";
  if (status === "REJECTED") return "已不采纳";
  if (status === "DEFERRED") return "稍后再看";
  return "未审核";
}

export function isActionableRecommendationText(action?: string): boolean {
  if (!action) return false;
  if (/表现较好|互动较活跃|分享传播较好|收藏表现较好/.test(action) && action.length < 18) return false;
  return /下一条|继续|测试|收集|保留|尝试/.test(action);
}

export function reviewItemsFromAnalysis(analysis: PerformanceAnalysisRecord | null): RecommendationReviewItem[] {
  return (analysis?.recommendations ?? []).map((row) => toReviewItem(row));
}

export function decisionsFromAnalysis(analysis: PerformanceAnalysisRecord | null): Record<string, "approve" | "reject" | "defer"> {
  const next: Record<string, "approve" | "reject" | "defer"> = {};
  for (const row of analysis?.recommendations ?? []) {
    const decision = persistedDecision(row.reviewStatus);
    if (decision) next[row.recommendationId] = decision;
  }
  return next;
}

export function reviewSummaryCounts(items: RecommendationReviewItem[]) {
  return {
    accepted: items.filter((item) => item.reviewStatus === "ACCEPTED" || item.reviewStatus === "APPROVED").length,
    rejected: items.filter((item) => item.reviewStatus === "REJECTED").length,
    deferred: items.filter((item) => item.reviewStatus === "DEFERRED").length,
    total: items.length,
  };
}

export function acceptedPreviewItems(items: RecommendationReviewItem[]) {
  return items
    .filter((item) => item.reviewStatus === "ACCEPTED" || item.reviewStatus === "APPROVED")
    .map((item) => ({
      action: item.recommendedAction || item.title,
      evidence: item.evidence,
      category: item.group,
    }));
}

function toReviewItem(row: ActionableRecommendationRecord): RecommendationReviewItem {
  const evidenceLines = row.evidence?.length
    ? row.evidence
    : (row.evidenceRefs ?? []).map((item) => item.label).filter((item): item is string => Boolean(item));
  const insufficient = row.category === "DATA_INSUFFICIENT" || row.confidence === "UNKNOWN" || row.confidence === "INSUFFICIENT";
  return {
    id: row.recommendationId,
    title: recommendationDisplayTitle({
      id: row.recommendationId,
      group: row.category,
      recommendedAction: row.recommendedAction || row.recommendation,
    }),
    reason: row.interpretation || row.reason || "",
    evidence: evidenceLines[0] ?? "",
    evidenceLines,
    observation: row.observation || (insufficient ? "当前数据不足" : ""),
    interpretation: row.interpretation || row.reason,
    recommendedAction: row.recommendedAction || row.recommendation,
    uncertainty: row.uncertainty,
    confidence: row.confidence,
    group: row.category,
    reviewStatus: row.reviewStatus,
    reviewHistory: row.reviewHistory,
    reviewedAt: row.reviewedAt,
    insufficient,
  };
}
