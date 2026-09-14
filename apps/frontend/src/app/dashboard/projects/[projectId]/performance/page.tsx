"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ContextualGuidanceV1 } from "../../../../../components/contextual-guidance-v1";
import { EmptyState } from "../../../../../components/empty-state";
import { FeedbackHandoffUXV5 } from "../../../../../components/feedback-handoff-ux-v5";
import { LearningSummaryCard } from "../../../../../components/learning-summary-card";
import { MetricsHistoryV5 } from "../../../../../components/metrics-history-v5";
import { PageHeader } from "../../../../../components/page-header";
import { PerformanceMetricForm } from "../../../../../components/performance-metric-form";
import { RecommendationReviewV5, type RecommendationReviewItem } from "../../../../../components/recommendation-review-v5";
import { TrendCardsV5 } from "../../../../../components/trend-cards-v5";
import { PerformancePublicationSelector } from "../../../../../components/performance-publication-selector";
import { PerformanceTabs } from "../../../../../components/performance-tabs";
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
  formatObservedAt,
  humanizeMetricsError,
  publishHref,
  resolvePerformanceQuery,
  sortSnapshotsNewestFirst,
} from "../../../../../lib/performance.form";
import type { MetricFormState, MetricSnapshotRecord, PerformanceInsightResult, PerformanceSummaryRecord } from "../../../../../lib/performance.types";
import {
  dataSufficiencyLabel,
  feedbackLoopCopy,
  insightViews,
  insufficientDataCopy,
  latestMetricCards,
  limitedSampleCopy,
  metricHistoryRows,
  noMetricsEmptyTitle,
  noPublishedEmptyTitle,
  optimizationScopeNote,
  parseInsights,
  parseMetricsList,
  parseMetricSnapshot,
  parseSummary,
  performanceSignals,
  summaryCards,
  humanizePerformanceInsight,
} from "../../../../../lib/performance.view";
import { listPublications } from "../../../../../lib/publication.api";
import type { PublicationRecord } from "../../../../../lib/publication.types";
import { parsePublicationRecord } from "../../../../../lib/publication.view";
import { useProjectWorkspace } from "../../../../../lib/project-workspace-context";
import { listVideos } from "../../../../../lib/video.api";
import type { VideoRecord } from "../../../../../lib/video.types";
import { getLearningSummary, type LearningPublicView } from "../../../../../lib/research.api";
import {
  CONFIDENCE_TOOLTIP,
  analysisErrorCopy,
  confidenceCopy,
  evidenceFromCounts,
  findingTypeCopy,
  insufficientReviewCopy,
  likeRateEvidence,
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
  const [form, setForm] = useState<MetricFormState>(emptyMetricForm(nowLocalDatetimeValue()));
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, "approve" | "reject" | "defer">>({});
  const [tab, setTab] = useState<"metrics" | "advice">("metrics");
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
        const resolved = resolvePerformanceQuery(queryPublicationId, eligible);
        setPublications(parsed);
        setVideos(videoResult.status === "fulfilled" ? videoResult.value : []);
        setPublicationId(resolved.publicationId);
        setQueryWarning(resolved.warning);
        setSnapshots([]);
        setSummary(null);
        setInsights(null);
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
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, publicationId]);

  const eligible = eligiblePerformancePublications(publications);
  const current = eligible.find((item) => item.id === publicationId) ?? null;
  const sourceVideo = videos.find((item) => item.id === current?.videoId) ?? null;
  const history = metricHistoryRows(snapshots, current?.publishedAt);
  const latest = sortSnapshotsNewestFirst(snapshots)[0] ?? null;
  const previous = sortSnapshotsNewestFirst(snapshots)[1] ?? null;
  const hasCurrentMetrics = snapshots.length > 0;
  const hasProjectMetrics = Object.values(hasDataById).some(Boolean) || hasCurrentMetrics;
  const hasRetention = mayShowRetentionClaim(latest?.completionRate) || mayShowRetentionClaim(latest?.averageWatchTimeSeconds);
  const cards = latestMetricCards(latest, summary);
  const analysisCards = summaryCards(summary);
  const signals = performanceSignals(insights, hasRetention);
  const observedSignals = insightViews(insights, hasRetention);
  const recItems: RecommendationReviewItem[] = hasCurrentMetrics
    ? (insights?.insights ?? [])
        .map((item, index) => {
          const title = humanizePerformanceInsight(item.code);
          if (!title) return null;
          if (!hasRetention && (item.code === "STRONG_COMPLETION_RATE" || item.code === "WEAK_COMPLETION_RATE")) return null;
          const rec: RecommendationReviewItem = {
            id: item.code ?? `rec-${index}`,
            title,
            reason: "基于目前数据，这条内容还有以下可优化空间",
            evidence:
              evidenceFromCounts("播放量", previous?.views, latest?.views) ||
              likeRateEvidence(latest?.views, latest?.likes) ||
              "依据来自你录入的历史数据记录",
            confidence: item.confidence,
            type: item.code?.includes("LOW") ? "WEAKNESS" : item.code?.includes("HIGH") ? "STRENGTH" : "OBSERVATION",
            group: item.category,
          };
          return rec;
        })
        .filter((item): item is RecommendationReviewItem => item !== null)
    : [];
  const approvedCount = Object.values(reviewDecisions).filter((value) => value === "approve").length;
  const analysisErr = analysisErrorCopy();

  function changePublication(nextId: string) {
    setPublicationId(nextId);
    setSnapshots([]);
    setSummary(null);
    setInsights(null);
    setForm(emptyMetricForm(nowLocalDatetimeValue()));
    setComposing(false);
    setReviewDecisions({});
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
      <div>
        <PageHeader
          title="AI复盘"
          description="发布与数据：查看真实发布表现和系统学习建议。当前仅手动发布。"
          breadcrumb={[
            { label: "项目", href: "/dashboard/projects" },
            { label: project.name, href: `/dashboard/projects/${projectId}` },
            { label: "发布与数据", href: `/dashboard/projects/${projectId}/publish` },
            { label: "AI复盘" },
          ]}
        />
        <EmptyState
          title={noPublishedEmptyTitle()}
          description="先记录一条已发布作品，再开始查看表现数据。"
          primaryAction={{ label: "去发布", href: publishHref(projectId) }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI复盘"
        description="发布与数据：查看真实发布表现和系统学习建议。当前仅手动发布。"
        breadcrumb={[
          { label: "项目", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${projectId}` },
          { label: "发布与数据", href: `/dashboard/projects/${projectId}/publish` },
          { label: "AI复盘" },
        ]}
        actions={
          hasCurrentMetrics ? (
            <button className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" type="button" onClick={() => setTab("advice")}>
              {recItems.length ? "查看复盘" : "开始AI复盘"}
            </button>
          ) : (
            <button className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" type="button" onClick={() => setComposing(true)}>
              录入数据
            </button>
          )
        }
      />
      <ContextualGuidanceV1 id="analysis" />
      {learning ? <LearningSummaryCard learning={learning} /> : null}
      {queryWarning ? (
        <p className="text-sm text-red-600" role="alert">
          {queryWarning}
        </p>
      ) : null}
      <PerformancePublicationSelector items={eligible} value={publicationId} hasDataById={hasDataById} onChange={changePublication} />
      <PerformanceTabs tab={tab} onChange={setTab} />

      {tab === "metrics" ? (
        !current ? (
          <p className="text-sm text-neutral-600">请选择一条已发布作品，开始查看或录入表现数据。</p>
        ) : (
          <div className="space-y-6">
            <section className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
              <h2 className="text-base font-medium">作品摘要</h2>
              <p>作品标题：{current.title || "已发布作品"}</p>
              <p>发布时间：{formatObservedAt(current.publishedAt) || "—"}</p>
              <p className="break-all">
                作品链接：
                {current.externalUrl ? (
                  <a className="underline" href={current.externalUrl} target="_blank" rel="noopener noreferrer">
                    {current.externalUrl}
                  </a>
                ) : (
                  "—"
                )}
              </p>
              <p>来源视频：{sourceVideo?.scriptTitle || "已生成视频"}</p>
              <p>已有数据：{hasCurrentMetrics || hasDataById[current.id] ? "已有数据" : "暂无数据"}</p>
            </section>

            {metricsError ? (
              <p className="text-sm text-red-600" role="alert">
                {metricsError}
              </p>
            ) : null}
            {parseError ? (
              <p className="text-sm text-red-600" role="alert">
                {parseError}
              </p>
            ) : null}

            {!hasCurrentMetrics && !composing ? (
              <EmptyState
                title={noMetricsEmptyTitle()}
                description="目前还不能分析。下一步：录入你在抖音看到的数据。"
                primaryAction={{ label: "录入数据", onClick: () => setComposing(true) }}
              />
            ) : null}

            {hasCurrentMetrics ? (
              <section className="space-y-3">
                <h2 className="text-base font-medium">最新表现</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {cards.map((card) => (
                    <div key={card.label} className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4">
                      <p className="text-xs text-neutral-500">{card.label}</p>
                      <p className="break-all text-lg font-medium">{card.value}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {composing ? (
              <section className="space-y-3">
                <h2 className="text-base font-medium">录入表现数据</h2>
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
                {actionError ? (
                  <p className="text-sm text-red-600" role="alert">
                    {actionError}
                  </p>
                ) : null}
              </section>
            ) : hasCurrentMetrics ? (
              <button className="rounded-md border px-4 py-2 text-sm" type="button" onClick={() => setComposing(true)}>
                继续录入
              </button>
            ) : null}

            <TrendCardsV5
              previous={previous ? { views: previous.views, likes: previous.likes, comments: previous.comments, shares: previous.shares } : null}
              latest={latest ? { views: latest.views, likes: latest.likes, comments: latest.comments, shares: latest.shares } : null}
            />

            {history.length > 0 ? (
              <MetricsHistoryV5
                rows={history}
                expandedIndex={expandedIndex}
                onToggle={(index) => setExpandedIndex((currentIndex) => (currentIndex === index ? null : index))}
              />
            ) : null}

            {hasCurrentMetrics ? (
              <section className="space-y-3" data-acf-performance-analysis-page-v5>
                <h2 className="text-base font-medium">AI复盘</h2>
                <p className="text-sm">基于目前数据，这条内容还有以下可优化空间。</p>
                <p className="acf-caption">当前是基于已录入指标的观察，不是完整分析代理的全部能力，也不会自动改下一轮内容。</p>
                {analysisError ? (
                  <p className="text-sm text-neutral-600" role="status">
                    {analysisErr.title}。{analysisErr.body}
                  </p>
                ) : null}
                {insights?.dataSufficiency === "STALE_BY_NEWER_METRICS" ? <p className="text-sm">{staleAnalysisCopy()}</p> : null}
                {analysisCards.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {analysisCards.map((card) => (
                      <div key={card.label} className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4">
                        <p className="text-xs text-neutral-500">{card.label}</p>
                        <p className="break-all text-sm font-medium">{card.value}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {observedSignals.length > 0 ? (
                  <ul className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
                    {observedSignals.map((item) => (
                      <li key={item.text}>
                        {findingTypeCopy("OBSERVATION")}：{item.text}
                        {confidenceCopy(insights?.insights?.find((row) => item.text.includes(humanizePerformanceInsight(row.code)))?.confidence) ? (
                          <span title={CONFIDENCE_TOOLTIP}>
                            {" "}
                            （{confidenceCopy(insights?.insights?.find((row) => item.text.includes(humanizePerformanceInsight(row.code)))?.confidence)}）
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm">{insufficientReviewCopy()}</p>
                )}
              </section>
            ) : null}
          </div>
        )
      ) : (
        <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="text-base font-medium">优化建议</h2>
          <p className="text-sm text-neutral-600">{feedbackLoopCopy()}</p>
          <p className="text-sm text-neutral-600">{optimizationScopeNote()}</p>
          {!hasCurrentMetrics ? (
            <p className="text-sm">{insufficientReviewCopy()}</p>
          ) : recItems.length > 0 ? (
            <RecommendationReviewV5
              items={recItems}
              decisions={reviewDecisions}
              singlePost={eligible.length < 2}
              onDecide={(id, action) => setReviewDecisions((currentMap) => ({ ...currentMap, [id]: action }))}
            />
          ) : (
            <p className="text-sm">{insufficientDataCopy()}</p>
          )}
          <FeedbackHandoffUXV5 approvedCount={approvedCount} totalCount={recItems.length} />
          {eligible.length < 2 || !hasProjectMetrics ? <p className="text-sm text-neutral-600">{limitedSampleCopy()}</p> : null}
          {dataSufficiencyLabel(insights?.dataSufficiency) ? (
            <p className="text-sm text-neutral-500">当前作品数据完整度：{dataSufficiencyLabel(insights?.dataSufficiency)}</p>
          ) : null}
          {signals.length === 0 && hasCurrentMetrics ? null : null}
        </section>
      )}
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
