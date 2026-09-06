"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { EmptyState } from "../../../../../components/empty-state";
import { PageHeader } from "../../../../../components/page-header";
import { PerformanceHistory } from "../../../../../components/performance-history";
import { PerformanceMetricForm } from "../../../../../components/performance-metric-form";
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
  nextPlanHref,
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
} from "../../../../../lib/performance.view";
import { listPublications } from "../../../../../lib/publication.api";
import type { PublicationRecord } from "../../../../../lib/publication.types";
import { parsePublicationRecord } from "../../../../../lib/publication.view";
import { useProjectWorkspace } from "../../../../../lib/project-workspace-context";
import { listVideos } from "../../../../../lib/video.api";
import type { VideoRecord } from "../../../../../lib/video.types";

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
  const [form, setForm] = useState<MetricFormState>(emptyMetricForm());
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

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
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
  const hasCurrentMetrics = snapshots.length > 0;
  const hasProjectMetrics = Object.values(hasDataById).some(Boolean) || hasCurrentMetrics;
  const cards = latestMetricCards(latest, summary);
  const analysisCards = summaryCards(summary);
  const signals = performanceSignals(insights);
  const observedSignals = insightViews(insights);

  function changePublication(nextId: string) {
    setPublicationId(nextId);
    setSnapshots([]);
    setSummary(null);
    setInsights(null);
    setForm(emptyMetricForm());
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
        setForm(emptyMetricForm());
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
        <PageHeader title="表现与建议" description="记录已发布作品的数据表现，查看当前样本中的表现信号，并把反馈用于下一期内容计划。" breadcrumb={project.name} />
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
        title="表现与建议"
        description="记录已发布作品的数据表现，查看当前样本中的表现信号，并把反馈用于下一期内容计划。"
        breadcrumb={project.name}
        actions={
          hasProjectMetrics ? (
            <Link className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" href={nextPlanHref(projectId)}>
              创建下一期内容计划
            </Link>
          ) : null
        }
      />
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
                description="录入发布后的播放、互动等数据，系统才能开始判断哪些内容方向值得继续。"
                primaryAction={{ label: "录入表现数据", onClick: () => setComposing(true) }}
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
                录入表现数据
              </button>
            ) : null}

            {history.length > 0 ? (
              <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
                <h2 className="text-base font-medium">历史观测记录</h2>
                <p className="text-sm text-neutral-600">每次保存都会新增一条记录，不会覆盖之前的数据。</p>
                <PerformanceHistory
                  rows={history}
                  expandedIndex={expandedIndex}
                  onToggle={(index) => setExpandedIndex((currentIndex) => (currentIndex === index ? null : index))}
                />
              </section>
            ) : null}

            {hasCurrentMetrics ? (
              <section className="space-y-3">
                <h2 className="text-base font-medium">表现分析</h2>
                {analysisError ? (
                  <p className="text-sm text-neutral-600" role="status">
                    {analysisError}
                  </p>
                ) : null}
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
                      <li key={item.text}>{item.text}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
          </div>
        )
      ) : (
        <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="text-base font-medium">优化建议</h2>
          <p className="text-sm text-neutral-600">{feedbackLoopCopy()}</p>
          <p className="text-sm text-neutral-600">{optimizationScopeNote()}</p>
          {signals.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium">已有可观察信号</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {signals.map((item) => (
                  <li key={item.text}>{item.text.replace(/^当前数据中观察到/, "").replace(/。$/, "")}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm">{insufficientDataCopy()}</p>
          )}
          {eligible.length < 2 || !hasProjectMetrics ? <p className="text-sm text-neutral-600">{limitedSampleCopy()}</p> : null}
          {dataSufficiencyLabel(insights?.dataSufficiency) ? (
            <p className="text-sm text-neutral-500">当前作品数据完整度：{dataSufficiencyLabel(insights?.dataSufficiency)}</p>
          ) : null}
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
