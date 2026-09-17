import { api } from "./api";

export type ActionableRecommendationRecord = {
  recommendationId: string;
  observation?: string;
  evidence?: string[];
  interpretation?: string;
  recommendedAction?: string;
  recommendation?: string;
  reason?: string;
  confidence?: string;
  uncertainty?: string;
  category?: string;
  reviewStatus?: string;
  reviewHistory?: Array<{ decision?: string; reviewedAt?: string; reviewedBy?: string | null }>;
  reviewedAt?: string | null;
  evidenceRefs?: Array<{ label?: string }>;
};

export type PerformanceAnalysisRecord = {
  id: string;
  publishedPostId: string;
  projectId?: string;
  recommendations?: ActionableRecommendationRecord[];
  status?: string;
  llmInvoked?: boolean;
};

function asRecommendations(value: unknown): ActionableRecommendationRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const rec = row as ActionableRecommendationRecord & { id?: string };
    const recommendationId = rec.recommendationId || rec.id;
    if (typeof recommendationId !== "string" || !recommendationId) return [];
    return [{ ...rec, recommendationId }];
  });
}

function mergeRecommendations(
  primary: ActionableRecommendationRecord[],
  secondary: ActionableRecommendationRecord[],
): ActionableRecommendationRecord[] {
  if (primary.length === 0) return secondary;
  const byId = new Map(secondary.map((row) => [row.recommendationId, row]));
  return primary.map((row) => {
    const other = byId.get(row.recommendationId);
    if (!other) return row;
    const firstAt = row.reviewedAt ? Date.parse(row.reviewedAt) : 0;
    const secondAt = other.reviewedAt ? Date.parse(other.reviewedAt) : 0;
    return Number.isFinite(secondAt) && secondAt >= (Number.isFinite(firstAt) ? firstAt : 0) ? { ...row, ...other } : { ...other, ...row };
  });
}

export function analysisRecordFromApi(raw: unknown): PerformanceAnalysisRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) return null;
  const recs = asRecommendations(row.recommendations);
  const cycle = row.feedbackCycle && typeof row.feedbackCycle === "object" ? (row.feedbackCycle as Record<string, unknown>) : null;
  const cycleRecs = asRecommendations(cycle?.recommendations);
  return {
    id: row.id,
    publishedPostId: typeof row.publishedPostId === "string" ? row.publishedPostId : "",
    projectId: typeof row.projectId === "string" ? row.projectId : undefined,
    recommendations: mergeRecommendations(recs, cycleRecs),
    status: typeof row.status === "string" ? row.status : undefined,
    llmInvoked: Boolean(row.llmInvoked),
  };
}

export function listPerformanceAnalyses(accessToken: string, publishedPostId: string) {
  return api<{ items: PerformanceAnalysisRecord[] }>(`/monitoring/posts/${publishedPostId}/analyses`, { accessToken });
}

export function createPerformanceAnalysis(accessToken: string, publishedPostId: string) {
  return api<PerformanceAnalysisRecord>(`/monitoring/posts/${publishedPostId}/analyze`, {
    method: "POST",
    accessToken,
    body: JSON.stringify({ analysisWindow: "LATEST_ONLY", force: false }),
  }).then((raw) => analysisRecordFromApi(raw) ?? raw);
}

export function getPerformanceAnalysis(accessToken: string, analysisId: string) {
  return api<PerformanceAnalysisRecord>(`/performance-analyses/${analysisId}`, { accessToken }).then(
    (raw) => analysisRecordFromApi(raw) ?? raw,
  );
}

export function reviewPerformanceRecommendation(
  accessToken: string,
  analysisId: string,
  recommendationId: string,
  action: "APPROVE" | "REJECT" | "DEFER",
) {
  return api<PerformanceAnalysisRecord>(
    `/performance-analyses/${analysisId}/recommendations/${encodeURIComponent(recommendationId)}/review`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify({ action }),
    },
  );
}

export async function persistRecommendationReviewAndReload(
  accessToken: string,
  analysisId: string,
  recommendationId: string,
  action: "APPROVE" | "REJECT" | "DEFER",
) {
  await reviewPerformanceRecommendation(accessToken, analysisId, recommendationId, action);
  const persisted = await getPerformanceAnalysis(accessToken, analysisId);
  const parsed = analysisRecordFromApi(persisted) ?? persisted;
  if (!parsed?.id) {
    throw new Error("REVIEW_RELOAD_FAILED");
  }
  return parsed;
}

export type AcceptedPerformanceFeedbackItem = {
  recommendationId?: string;
  category?: string;
  recommendedAction: string;
  sourcePublicationId?: string;
  sourceAnalysisId?: string;
};

export function listAcceptedPerformanceFeedback(accessToken: string, projectId: string) {
  return api<{ items: AcceptedPerformanceFeedbackItem[]; count: number; referenceOnly?: boolean }>(
    `/projects/${encodeURIComponent(projectId)}/accepted-performance-feedback`,
    { accessToken },
  );
}

export async function loadOrCreatePerformanceAnalysis(accessToken: string, publishedPostId: string) {
  const listed = await listPerformanceAnalyses(accessToken, publishedPostId);
  const active = listed.items.find((item) => item.status === "ACTIVE") ?? listed.items[0];
  if (active?.id) {
    return getPerformanceAnalysis(accessToken, active.id);
  }
  return createPerformanceAnalysis(accessToken, publishedPostId);
}
