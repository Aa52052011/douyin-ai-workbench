import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { calculatePerformanceMetricsV1, dataSufficiencyFromCount, type PerformanceMetricsSummaryV1 } from './metrics-calculator.js';
import { assertNoCredentials, hashAnalysisInput, mockPerformanceAnalysisV1, RETENTION_NOT_AVAILABLE } from './mock-analyzer.js';
import {
  applyActionableReview,
  buildActionableRecommendations,
  isAcceptedReviewStatus,
  mergePersistedRecommendations,
  type ActionableRecommendationV1,
} from './actionable-recommendation.mapper.js';
import type {
  AnalysisWindowKind,
  BenchmarkContextV1,
  FeedbackCycleStatus,
  PerformanceFindingV1,
  RecommendationReviewAction,
} from './performance-analysis.types.js';

export type PerformanceAnalysisInputV1 = {
  schemaVersion: 'performance.analysis-input:v1';
  tenantId: string;
  workspaceId: string;
  projectId: string;
  publishedPostId: string;
  accountPositioningSnapshot?: unknown;
  contentPlanSnapshot: unknown;
  scriptSnapshot: unknown;
  artifactSnapshot: unknown;
  publicationSnapshot: unknown;
  metricsSnapshots: Array<{
    id: string;
    publishedPostId: string;
    capturedAt: string;
    source: string;
    playCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
    shareCount: number | null;
    collectCount: number | null;
    followerDelta: number | null;
    fixture?: boolean;
  }>;
  analysisWindow: AnalysisWindowKind;
  previousComparablePosts?: unknown[];
  feedbackCycleId?: string | null;
};

export type NextContentPlanningFeedbackV1 = {
  schemaVersion: 'next.content-planning-feedback:v1';
  approvedRecommendations: ActionableRecommendationV1[];
  sourceAnalysisId: string;
  sourcePublishedPostId: string;
  feedbackCycleId: string;
};

export function requireMetricsOrThrow(snapshots: unknown[], llmInvoked: { current: boolean }): void {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    llmInvoked.current = false;
    throw new AppError(ErrorCode.INSUFFICIENT_METRICS);
  }
}

export function requireAnalysisContext(_script: unknown, _plan: unknown): void {
  // Missing script/plan reduces context. It must not hide metric-based recommendations.
}

export function assertFindingEvidencePolicy(findings: PerformanceFindingV1[]): void {
  for (const finding of findings) {
    if (finding.evidenceRefs.length === 0) {
      if (finding.type !== 'HYPOTHESIS' && finding.causalityLevel !== 'INSUFFICIENT_EVIDENCE') {
        throw new Error('FINDING_REQUIRES_EVIDENCE');
      }
    }
    if (finding.causalityLevel === 'CONFIRMED_CAUSE' as never) {
      throw new Error('CONFIRMED_CAUSE_FORBIDDEN');
    }
  }
}

export function hashPerformanceAnalysisInput(input: PerformanceAnalysisInputV1): string {
  return hashAnalysisInput({
    metricsSnapshots: input.metricsSnapshots,
    scriptSnapshot: input.scriptSnapshot,
    contentPlanSnapshot: input.contentPlanSnapshot,
    publicationSnapshot: input.publicationSnapshot,
  });
}

export function renderPerformanceAnalysisPromptVars(input: {
  metricsSummary: unknown;
  dataSufficiency: string;
  benchmarkContext: string;
  evidenceIndex: unknown;
  scriptSnapshot: unknown;
  contentPlanSnapshot: unknown;
  publicationSnapshot: unknown;
}): Record<string, string> {
  const vars = {
    metricsSummary: JSON.stringify(input.metricsSummary),
    dataSufficiency: input.dataSufficiency,
    benchmarkContext: input.benchmarkContext,
    evidenceIndex: JSON.stringify(input.evidenceIndex),
    scriptSnapshot: JSON.stringify(input.scriptSnapshot),
    contentPlanSnapshot: JSON.stringify(input.contentPlanSnapshot),
    publicationSnapshot: JSON.stringify(input.publicationSnapshot),
  };
  for (const value of Object.values(vars)) {
    assertNoCredentials(value);
  }
  return vars;
}

export function runDeterministicPerformanceAnalysis(input: PerformanceAnalysisInputV1): {
  metricsSummary: PerformanceMetricsSummaryV1;
  dataSufficiency: ReturnType<typeof dataSufficiencyFromCount>;
  benchmarkContext: BenchmarkContextV1;
  evidenceIndex: Array<{ kind: string; id: string; label: string }>;
  findings: PerformanceFindingV1[];
  recommendations: ActionableRecommendationV1[];
  retention: typeof RETENTION_NOT_AVAILABLE;
  confidenceSummary: {
    overall: 'LOW' | 'MEDIUM' | 'UNKNOWN';
    limitations: string[];
    c6: 'RESTRICTED';
    c5: 'RESTRICTED';
  };
  llmInvoked: false;
  fixture: boolean;
  inputSnapshotHash: string;
  positioningAdvice: 'KEEP_POSITIONING';
} {
  const llmInvoked = { current: false };
  requireMetricsOrThrow(input.metricsSnapshots, llmInvoked);
  requireAnalysisContext(input.scriptSnapshot, input.contentPlanSnapshot);
  const metricsSummary = calculatePerformanceMetricsV1({
    snapshots: input.metricsSnapshots,
    publishedPostId: input.publishedPostId,
    window: input.analysisWindow,
  });
  const comparable = input.previousComparablePosts?.length ?? 0;
  const mock = mockPerformanceAnalysisV1({
    publishedPostId: input.publishedPostId,
    metrics: metricsSummary,
    comparablePostCount: comparable,
    scriptTitle: typeof input.scriptSnapshot === 'object' && input.scriptSnapshot && 'title' in input.scriptSnapshot
      ? String((input.scriptSnapshot as { title?: string }).title ?? '')
      : null,
    contentPlanTitle:
      typeof input.contentPlanSnapshot === 'object' && input.contentPlanSnapshot && 'title' in input.contentPlanSnapshot
        ? String((input.contentPlanSnapshot as { title?: string }).title ?? '')
        : null,
    fixture: input.metricsSnapshots.some((row) => row.fixture === true),
  });
  assertFindingEvidencePolicy(mock.findings);
  const recommendations = buildActionableRecommendations(input.metricsSnapshots);
  const evidenceIndex = [...mock.findings.flatMap((f) => f.evidenceRefs), ...recommendations.flatMap((r) => r.evidenceRefs)];
  const packed = JSON.stringify({ findings: mock.findings, recommendations });
  if (packed.includes('高于平均') || packed.includes('低于行业')) {
    throw new Error('BENCHMARK_CLAIM_WITHOUT_BENCHMARK');
  }
  if (packed.includes('完播率') || packed.includes('平均观看时长')) {
    throw new Error('RETENTION_CLAIM_WITHOUT_DATA');
  }
  return {
    metricsSummary,
    dataSufficiency: mock.dataSufficiency,
    benchmarkContext: mock.benchmarkContext,
    evidenceIndex,
    findings: mock.findings,
    recommendations,
    retention: mock.retention,
    confidenceSummary: {
      overall: metricsSummary.snapshotCount < 2 ? 'UNKNOWN' : 'LOW',
      limitations: [
        '指标为用户录入，非抖音官方核验',
        '单条作品不能确认因果',
        '无 retention / 完播数据',
        comparable === 0 ? '无账号历史 baseline' : '对照样本有限',
      ],
      c6: 'RESTRICTED',
      c5: 'RESTRICTED',
    },
    llmInvoked: false,
    fixture: mock.fixture,
    inputSnapshotHash: hashPerformanceAnalysisInput(input),
    positioningAdvice: 'KEEP_POSITIONING',
  };
}

export { mergePersistedRecommendations };

export function applyRecommendationReview(
  recommendations: ActionableRecommendationV1[],
  recommendationId: string,
  action: RecommendationReviewAction,
  meta: { reviewedBy?: string | null; reviewedAt?: string; userNote?: string | null } = {},
): ActionableRecommendationV1[] {
  const next = applyActionableReview(recommendations, recommendationId, action, meta);
  if (!next.some((row) => row.recommendationId === recommendationId)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'recommendation not found');
  }
  return next;
}

export function feedbackStatusFromRecommendations(recommendations: Array<{ reviewStatus: string }>): FeedbackCycleStatus {
  const statuses = recommendations.map((row) => row.reviewStatus);
  const accepted = (s: string) => s === 'APPROVED' || s === 'ACCEPTED';
  if (statuses.every((s) => s === 'PENDING' || s === 'DEFERRED')) return 'HUMAN_REVIEW_REQUIRED';
  if (statuses.every((s) => accepted(s))) return 'APPROVED';
  if (statuses.every((s) => s === 'REJECTED')) return 'REJECTED';
  if (statuses.some((s) => accepted(s)) && statuses.some((s) => s === 'REJECTED' || s === 'DEFERRED' || s === 'PENDING')) {
    return 'PARTIALLY_APPROVED';
  }
  return 'HUMAN_REVIEW_REQUIRED';
}

export function buildNextContentPlanningFeedback(input: {
  analysisId: string;
  publishedPostId: string;
  feedbackCycleId: string;
  recommendations: ActionableRecommendationV1[];
}): NextContentPlanningFeedbackV1 {
  return {
    schemaVersion: 'next.content-planning-feedback:v1',
    approvedRecommendations: input.recommendations.filter((row) => isAcceptedReviewStatus(row.reviewStatus)),
    sourceAnalysisId: input.analysisId,
    sourcePublishedPostId: input.publishedPostId,
    feedbackCycleId: input.feedbackCycleId,
  };
}

export function neverMutateContentPlan<T>(planBefore: T, planAfter: T): void {
  if (JSON.stringify(planBefore) !== JSON.stringify(planAfter)) {
    throw new Error('AUTO_PLAN_MUTATION_FORBIDDEN');
  }
}
