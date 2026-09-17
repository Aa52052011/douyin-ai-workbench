"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { EmptyState } from "../../../../../components/empty-state";
import { AiReviewWorkspaceV1 } from "../../../../../components/ai-review-workspace-v1";
import { InlineActionErrorV1 } from "../../../../../components/inline-action-error-v1";
import { LearningLoopV1 } from "../../../../../components/learning-loop-v1";
import { MetricsHistoryV5 } from "../../../../../components/metrics-history-v5";
import { MetricsSummaryV2 } from "../../../../../components/metrics-summary-v2";
import { NextActionBarV1 } from "../../../../../components/next-action-bar-v1";
import { PerformanceMetricForm } from "../../../../../components/performance-metric-form";
import { RecommendationReviewV5 } from "../../../../../components/recommendation-review-v5";
import { PerformancePublicationSelector } from "../../../../../components/performance-publication-selector";
import { TechnicalDetailsPanel } from "../../../../../components/technical-details-panel";
import { WorkflowPageHeaderV1 } from "../../../../../components/workflow-page-header-v1";
import { useAuth } from "../../../../../lib/auth-context";
import {
  createManualMetrics,
  getLatestMetrics,
  getMetricsInsights,
  getMetricsSummary,
  listPublicationMetrics,
} from "../../../../../lib/performance.api";
import {
  eligiblePerformancePublications,
  emptyMetricForm,
  humanizeMetricsError,
  nextPlanHref,
  publishHref,
  sortSnapshotsNewestFirst,
} from "../../../../../lib/performance.form";
import type { MetricFormState, MetricSnapshotRecord, PerformanceInsightResult, PerformanceSummaryRecord } from "../../../../../lib/performance.types";
import {
  metricHistoryRows,
  parseInsights,
  parseMetricsList,
  parseMetricSnapshot,
  parseSummary,
} from "../../../../../lib/performance.view";
import {
  loadOrCreatePerformanceAnalysis,
  persistRecommendationReviewAndReload,
  type PerformanceAnalysisRecord,
} from "../../../../../lib/performance-analysis.api";
import {
  REVIEW_SAVE_FAILED,
  decisionsFromAnalysis,
  reviewItemsFromAnalysis,
} from "../../../../../lib/performance-review.view";
import { listPublications } from "../../../../../lib/publication.api";
import type { PublicationRecord } from "../../../../../lib/publication.types";
import { parsePublicationRecord } from "../../../../../lib/publication.view";
import { useProjectWorkspace } from "../../../../../lib/project-workspace-context";
import { listVideos } from "../../../../../lib/video.api";
import type { VideoRecord } from "../../../../../lib/video.types";
import { getLearningSummary, type LearningPublicView } from "../../../../../lib/research.api";
import {
  AI_REVIEW_TRUTH_NOTICE,
  resolveAiReviewPublicationSelection,
  reviewCountsFromItems,
  sampleSufficiencyCopy,
} from "../../../../../lib/ai-review.workspace";
import {
  analysisErrorCopy,
  mayShowRetentionClaim,
  nowLocalDatetimeValue,
  staleAnalysisCopy,
} from "../../../../../lib/ux/publication-monitoring-v5";

function PerformancePageInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const queryPublicationId = searchParams.get("publicationId");
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [publications, setPublications] = useState<PublicationRecord[]>([]);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [publicationId, setPublicationId] = useState("");
  const [hasDataById, setHasDataById] = useState<Record<string, boolean>>({});
  const [snapshots, setSnapshots] = useState<MetricSnapshotRecord[]>([]);
  const [summary, setSummary] = useState<PerformanceSummaryRecord | null>(null);
  const [insights, setInsights] = useState<PerformanceInsightResult | null>(null);
  const [analysis, setAnalysis] = useState<PerformanceAnalysisRecord | null>(null);
  const [reviewCardError, setReviewCardError] = useState<{ id: string; message: string } | null>(null);
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
  const [form, setForm] = useState<MetricFormState>(emptyMetricForm(nowLocalDatetimeValue()));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [queryWarning, setQueryWarning] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [learning, setLearning] = useState<LearningPublicView | null>(null);

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void getLearningSummary(accessToken, projectId).then((data) => {
      if (!cancelled) {
        setLearning(data);
      }
    }).catch(() => {
      if (!cancelled) {
        setLearning({
          statusLabel: "数据不足，系统正在积累",
          summary: [],
          nextBatchAdjustments: [],
          dataSufficiency: "INSUFFICIENT_DATA",
          lastUpdatedAt: new Date().toISOString(),
        });
      }
    });
    void Promise.allSettled([listPublications(accessToken, projectId), listVideos(accessToken, projectId)]).then(
      ([publicationResult, videoResult]) => {
        if (cancelled) {
          return;
        }
        if (publicationResult.status === "rejected") {
          setLoadError("无法加载已发布作品。");
          setLoading(false);
          return;
        }
        const parsed = publicationResult.value.map(parsePublicationRecord).filter((item): item is PublicationRecord => Boolean(item));
        const eligible = eligiblePerformancePublications(parsed);
        const resolved = resolveAiReviewPublicationSelection({
          queryPublicationId,
          eligible,
        });
        setPublications(parsed);
        setVideos(videoResult.status === "fulfilled" ? videoResult.value : []);
        setPublicationId(resolved.publicationId);
        setQueryWarning(resolved.warning);
        setSnapshots([]);
        setSummary(null);
        setInsights(null);
        setAnalysis(null);
        setLoadError(null);
        if (eligible.length === 0) {
          setHasDataById({});
          setLoading(false);
          return;
        }
        void Promise.allSettled(eligible.map((item) => getLatestMetrics(accessToken, item.id))).then((results) => {
          if (cancelled) {
            return;
          }
          const next: Record<string, boolean> = {};
          eligible.forEach((item, index) => {
            const result = results[index];
            next[item.id] = result.status === "fulfilled" && Boolean(parseMetricSnapshot(result.value.snapshot));
          });
          setHasDataById(next);
          setPublicationId((currentId) => {
            if (currentId) return currentId;
            return resolveAiReviewPublicationSelection({
              queryPublicationId,
              eligible,
              hasDataById: next,
            }).publicationId;
          });
          setLoading(false);
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId, queryPublicationId]);

  useEffect(() => {
    if (!accessToken || !publicationId) {
      return;
    }
    let cancelled = false;
    void Promise.allSettled([
      listPublicationMetrics(accessToken, publicationId),
      getMetricsSummary(accessToken, publicationId),
      getMetricsInsights(accessToken, publicationId),
    ]).then(([listResult, summaryResult, insightResult]) => {
      if (cancelled) {
        return;
      }
      if (listResult.status === "rejected") {
        setMetricsError("无法加载作品表现。");
        setSnapshots([]);
      } else {
        const parsed = parseMetricsList(listResult.value);
        if (parsed == null) {
          setSnapshots([]);
          setParseError("该数据暂时无法读取");
        } else {
          setSnapshots(parsed);
          setParseError(null);
        }
        setMetricsError(null);
      }
      const nextSummary = summaryResult.status === "fulfilled" ? parseSummary(summaryResult.value) : null;
      const nextInsights = insightResult.status === "fulfilled" ? parseInsights(insightResult.value) : null;
      setSummary(nextSummary);
      setInsights(nextInsights);
      setAnalysisError(summaryResult.status === "rejected" || insightResult.status === "rejected" || nextSummary == null || nextInsights == null
        ? "部分分析暂时不可用，但已有指标仍可查看。"
        : null);
      setExpandedIndex(null);
      const parsedMetrics = listResult.status === "fulfilled" ? parseMetricsList(listResult.value) : null;
      if (parsedMetrics && parsedMetrics.length > 0) {
        void loadOrCreatePerformanceAnalysis(accessToken, publicationId)
          .then((loaded) => {
            if (!cancelled) {
              setAnalysis(loaded);
              setAnalysisError(null);
            }
          })
          .catch(() => {
            if (!cancelled) setAnalysisError("分析生成失败，请稍后重试。");
          });
      } else if (!cancelled) {
        setAnalysis(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, publicationId]);

  const eligible = eligiblePerformancePublications(publications);
  const current = eligible.find((item) => item.id === publicationId) ?? null;
  const history = metricHistoryRows(snapshots, current?.publishedAt);
  const latest = sortSnapshotsNewestFirst(snapshots)[0] ?? null;
  const previousSnapshot = sortSnapshotsNewestFirst(snapshots)[1] ?? null;
  const hasCurrentMetrics = snapshots.length > 0;
  const hasRetention = mayShowRetentionClaim(latest?.completionRate) || mayShowRetentionClaim(latest?.averageWatchTimeSeconds);
  const recItems = reviewItemsFromAnalysis(analysis);
  const reviewDecisions = decisionsFromAnalysis(analysis);
  const reviewCounts = reviewCountsFromItems(recItems);
  const analysisErr = analysisErrorCopy();
  const sampleCopy = sampleSufficiencyCopy(snapshots);

  function persistReview(id: string, action: "approve" | "reject" | "defer") {
    if (!accessToken) return;
    if (!analysis?.id) {
      setReviewCardError({ id, message: REVIEW_SAVE_FAILED });
      return;
    }
    const previous = analysis;
    setReviewCardError(null);
    setPendingReviewId(id);
    const mapped = action === "approve" ? "APPROVE" : action === "reject" ? "REJECT" : "DEFER";
    void persistRecommendationReviewAndReload(accessToken, analysis.id, id, mapped)
      .then((updated) => {
        setAnalysis(updated);
        setPendingReviewId(null);
      })
      .catch(() => {
        setAnalysis(previous);
        setReviewCardError({ id, message: REVIEW_SAVE_FAILED });
        setPendingReviewId(null);
      });
  }

  function changePublication(nextId: string) {
    setPublicationId(nextId);
    setSnapshots([]);
    setSummary(null);
    setInsights(null);
    setAnalysis(null);
    setForm(emptyMetricForm(nowLocalDatetimeValue()));
    setComposing(false);
    setActionError(null);
    setMetricsError(null);
    setAnalysisError(null);
    setParseError(null);
    setExpandedIndex(null);
  }

  function submitMetrics() {
    if (!accessToken || !publicationId) {
      return;
    }
    setPending(true);
    setActionError(null);
    void createManualMetrics(accessToken, publicationId, form)
      .then(() =>
        Promise.allSettled([
          listPublicationMetrics(accessToken, publicationId),
          getMetricsSummary(accessToken, publicationId),
          getMetricsInsights(accessToken, publicationId),
        ]),
      )
      .then(([listResult, summaryResult, insightResult]) => {
        if (listResult.status === "fulfilled") {
          const parsed = parseMetricsList(listResult.value);
          setSnapshots(parsed ?? []);
          setParseError(parsed == null ? "该数据暂时无法读取" : null);
          setHasDataById((currentMap) => ({ ...currentMap, [publicationId]: Boolean(parsed?.length) }));
        }
        setSummary(summaryResult.status === "fulfilled" ? parseSummary(summaryResult.value) : null);
        setInsights(insightResult.status === "fulfilled" ? parseInsights(insightResult.value) : null);
        setForm(emptyMetricForm(nowLocalDatetimeValue()));
        setComposing(false);
        setPending(false);
      })
      .catch((error) => {
        setActionError(humanizeMetricsError(error));
        setPending(false);
      });
  }

  if (loading) {
    return <p className="text-sm text-neutral-600">正在加载表现数据…</p>;
  }

  if (loadError) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {loadError}
      </p>
    );
  }

  if (eligible.length === 0) {
    return (
      <div className="max-w-6xl">
        <WorkflowPageHeaderV1
          page="ai-review"
          projectId={projectId}
          title="AI复盘"
          description="根据真实数据总结变化，并给出下一步建议。"
          breadcrumb={[
            { label: "项目", href: "/dashboard/projects" },
            { label: project.name, href: `/dashboard/projects/${projectId}` },
            { label: "发布与数据", href: `/dashboard/projects/${projectId}/publish` },
            { label: "AI复盘" },
          ]}
        />
        <EmptyState
          compact
          title="还没有可复盘的作品"
          description="先完成作品登记并录入数据。"
          primaryAction={{ label: "去发布与数据", href: publishHref(projectId) }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <WorkflowPageHeaderV1
        page="ai-review"
        projectId={projectId}
        publicationId={publicationId || queryPublicationId || undefined}
        title="AI复盘"
        description="根据真实数据总结变化，并给出下一步建议。"
        breadcrumb={[
          { label: "项目", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${projectId}` },
          { label: "发布与数据", href: `/dashboard/projects/${projectId}/publish` },
          { label: "AI复盘" },
        ]}
      />
      {current && hasCurrentMetrics ? (
        <p className="acf-caption" data-acf-review-sample-copy>
          {sampleCopy}
          {sampleCopy ? " · " : ""}
          {AI_REVIEW_TRUTH_NOTICE}
        </p>
      ) : (
        <p className="acf-caption">{AI_REVIEW_TRUTH_NOTICE}</p>
      )}
      <PerformancePublicationSelector
        items={eligible}
        value={publicationId}
        hasDataById={hasDataById}
        snapshotCount={current ? snapshots.length : undefined}
        onChange={changePublication}
      />
      {queryWarning ? <InlineActionErrorV1 message={queryWarning} /> : null}

      {!current ? (
        <div className="mx-auto mt-6 max-w-md">
          <EmptyState
            compact
            title="还没有可复盘的作品"
            description="先完成作品登记并录入数据。"
            primaryAction={{ label: "去发布与数据", href: publishHref(projectId) }}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {metricsError ? <InlineActionErrorV1 message={metricsError} /> : null}
          {parseError ? <InlineActionErrorV1 message={parseError} /> : null}

          {!hasCurrentMetrics && !composing ? (
            <div className="mx-auto max-w-md">
              <EmptyState
                compact
                title="这条作品还没有表现数据"
                description="先录入你在抖音看到的数据，再查看复盘。"
                primaryAction={{ label: "录入数据", onClick: () => setComposing(true) }}
              />
            </div>
          ) : null}

          {hasCurrentMetrics ? <MetricsSummaryV2 latest={latest} previous={previousSnapshot} /> : null}

          {composing ? (
            <section className="space-y-3">
              <h2 className="acf-section-title">录入表现数据</h2>
              <PerformanceMetricForm
                form={form}
                pending={pending}
                onChange={setForm}
                onSubmit={submitMetrics}
                onCancel={() => {
                  setComposing(false);
                  setActionError(null);
                }}
              />
              {actionError ? <InlineActionErrorV1 message={actionError} /> : null}
            </section>
          ) : hasCurrentMetrics ? (
            <button className="rounded-md border px-4 py-2 text-sm" type="button" onClick={() => setComposing(true)}>
              继续录入
            </button>
          ) : null}

          {history.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm underline">查看历史数据</summary>
              <div className="mt-3">
                <MetricsHistoryV5
                  rows={history}
                  expandedIndex={expandedIndex}
                  onToggle={(index) => setExpandedIndex((currentIndex) => (currentIndex === index ? null : index))}
                />
              </div>
            </details>
          ) : null}

          {hasCurrentMetrics ? (
          <section className="space-y-3" data-acf-performance-analysis-page-v5>
            <p className="acf-caption">当前是基于已录入指标的观察，不是完整分析代理的全部能力，也不会自动改下一轮内容。</p>
            {insights?.dataSufficiency === "STALE_BY_NEWER_METRICS" ? <p className="text-sm">{staleAnalysisCopy()}</p> : null}
            {hasRetention ? null : <p className="sr-only">无完播率数据，不展示留存结论。</p>}
            {analysisError && recItems.length === 0 ? (
              <p className="text-sm" role="alert">
                {analysisError.includes("分析生成失败") ? analysisError : `分析生成失败。${analysisErr.title}`}
              </p>
            ) : null}
            <AiReviewWorkspaceV1
              hasMetrics={hasCurrentMetrics}
              hasAnalysis={Boolean(analysis)}
              recs={recItems}
              decisions={reviewDecisions}
              singlePost={eligible.length < 2}
              pendingReviewId={pendingReviewId}
              reviewCardError={reviewCardError}
              analysisGenerationError={analysisError}
              onDecide={persistReview}
              nextHref={reviewCounts.accepted > 0 ? nextPlanHref(projectId) : undefined}
              nextLabel="开始下一轮内容规划"
            />
            <LearningLoopV1 highlight={reviewCounts.accepted + reviewCounts.rejected + reviewCounts.deferred > 0 ? "decision" : "review"} />
          </section>
          ) : null}
        </div>
      )}

      <NextActionBarV1
        backHref={`/dashboard/projects/${projectId}/publish`}
        backLabel="返回发布与数据"
        currentLabel="AI复盘"
      />
      <TechnicalDetailsPanel details="高级信息默认折叠。内部分析编号、建议编号和审核枚举不对普通用户展示。" />
    </div>
  );
}

export default function PerformancePage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-600">正在加载表现数据…</p>}>
      <PerformancePageInner />
    </Suspense>
  );
}
