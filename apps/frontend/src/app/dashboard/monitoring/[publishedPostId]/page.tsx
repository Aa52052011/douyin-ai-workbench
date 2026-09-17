"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AiReviewWorkspaceV1 } from "../../../../components/ai-review-workspace-v1";
import { EmptyState } from "../../../../components/empty-state";
import { MetricsHistoryV5 } from "../../../../components/metrics-history-v5";
import { MetricsSummaryV2 } from "../../../../components/metrics-summary-v2";
import { MetricsTrendV1 } from "../../../../components/metrics-trend-v1";
import { PageHeader } from "../../../../components/page-header";
import { PerformanceMetricForm } from "../../../../components/performance-metric-form";
import { PublishedPostSummaryV5 } from "../../../../components/published-post-summary-v5";
import { RecommendationReviewV5 } from "../../../../components/recommendation-review-v5";
import { WorkflowBackNavV1 } from "../../../../components/workflow-back-nav-v1";
import { ProductErrorState, TechnicalDetailsPanel } from "../../../../components/ui/error-state";
import { useAuth } from "../../../../lib/auth-context";
import { listMonitoringPosts, type PublishedPostRecord } from "../../../../lib/monitoring.api";
import { createManualMetrics, getMetricsInsights, listPublicationMetrics } from "../../../../lib/performance.api";
import {
  loadOrCreatePerformanceAnalysis,
  persistRecommendationReviewAndReload,
  type PerformanceAnalysisRecord,
} from "../../../../lib/performance-analysis.api";
import { emptyMetricForm, formatObservedAt, humanizeMetricsError, sortSnapshotsNewestFirst } from "../../../../lib/performance.form";
import type { MetricFormState, MetricSnapshotRecord, PerformanceInsightResult } from "../../../../lib/performance.types";
import {
  metricHistoryRows,
  parseInsights,
  parseMetricsList,
} from "../../../../lib/performance.view";
import {
  REVIEW_SAVE_FAILED,
  decisionsFromAnalysis,
  reviewItemsFromAnalysis,
} from "../../../../lib/performance-review.view";
import { getPublication } from "../../../../lib/publication.api";
import type { PublicationRecord } from "../../../../lib/publication.types";
import { parsePublicationRecord } from "../../../../lib/publication.view";
import { toProductError } from "../../../../lib/ux/product-error";
import {
  LIMITED_SAMPLE_COPY,
  observationContext,
  reviewCountsFromItems,
} from "../../../../lib/ai-review.workspace";
import {
  analysisErrorCopy,
  mayShowRetentionClaim,
  monitoringPrimaryCta,
  monitoringTitle,
  nowLocalDatetimeValue,
  pagePrimaryCta,
  staleAnalysisCopy,
} from "../../../../lib/ux/publication-monitoring-v5";

function performanceHrefIfPossibleLocal(projectId: string | null | undefined, publicationId: string) {
  if (!projectId) return "";
  return `/dashboard/projects/${projectId}/performance?publicationId=${encodeURIComponent(publicationId)}`;
}

export default function MonitoringDetailPage() {
  const { publishedPostId } = useParams<{ publishedPostId: string }>();
  const { accessToken } = useAuth();
  const [item, setItem] = useState<PublishedPostRecord | null>(null);
  const [publication, setPublication] = useState<PublicationRecord | null>(null);
  const [snapshots, setSnapshots] = useState<MetricSnapshotRecord[]>([]);
  const [insights, setInsights] = useState<PerformanceInsightResult | null>(null);
  const [analysis, setAnalysis] = useState<PerformanceAnalysisRecord | null>(null);
  const [error, setError] = useState<ReturnType<typeof toProductError> | null>(null);
  const [loadNote, setLoadNote] = useState<string | null>(null);
  const [form, setForm] = useState<MetricFormState>(emptyMetricForm(nowLocalDatetimeValue()));
  const [composing, setComposing] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewCardError, setReviewCardError] = useState<{ id: string; message: string } | null>(null);
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!accessToken || !publishedPostId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await listMonitoringPosts(accessToken);
        if (cancelled) return;
        setItem(data.items.find((row) => row.id === publishedPostId) ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(toProductError(err, "没能加载作品监控列表"));
        }
      }
      try {
        const pub = parsePublicationRecord(await getPublication(accessToken, publishedPostId));
        if (cancelled) return;
        setPublication(pub);
        if (pub) {
          const [listResult, insightResult] = await Promise.allSettled([
            listPublicationMetrics(accessToken, pub.id),
            getMetricsInsights(accessToken, pub.id),
          ]);
          if (cancelled) return;
          if (listResult.status === "fulfilled") {
            setSnapshots(parseMetricsList(listResult.value) ?? []);
          } else {
            setLoadNote("作品已打开。指标接口暂时不可用，列表里的最近数据仍可参考。");
          }
          if (insightResult.status === "fulfilled") {
            setInsights(parseInsights(insightResult.value));
          }
          const parsedSnapshots = listResult.status === "fulfilled" ? parseMetricsList(listResult.value) ?? [] : [];
          if (parsedSnapshots.length > 0) {
            try {
              const loaded = await loadOrCreatePerformanceAnalysis(accessToken, pub.id);
              if (!cancelled) setAnalysis(loaded);
            } catch {
              if (!cancelled) setLoadNote("复盘内容加载失败。可以稍后重试。");
            }
          }
        }
      } catch {
        if (!cancelled) {
          setLoadNote("作品已打开。如需补数据，请从项目的发布与数据继续录入。");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, publishedPostId]);

  const publicationId = publication?.id ?? publishedPostId;
  const projectId = publication?.projectId ?? item?.projectId ?? null;
  const hasCurrentMetrics = snapshots.length > 0 || Boolean(item?.latestMetrics);
  const latest = sortSnapshotsNewestFirst(snapshots)[0] ?? null;
  const previous = sortSnapshotsNewestFirst(snapshots)[1] ?? null;
  const hasRetention = mayShowRetentionClaim(latest?.completionRate) || mayShowRetentionClaim(latest?.averageWatchTimeSeconds);
  const recs = reviewItemsFromAnalysis(analysis);
  const decisions = decisionsFromAnalysis(analysis);
  const counts = reviewCountsFromItems(recs);
  const hasAnalysis = recs.length > 0;
  const cta = monitoringPrimaryCta({ hasMetrics: hasCurrentMetrics, hasAnalysis });
  const history = metricHistoryRows(snapshots, publication?.publishedAt ?? item?.publishedAt);
  const analysisErr = analysisErrorCopy();
  const perfHref = performanceHrefIfPossibleLocal(projectId, publicationId);
  const sample = observationContext(snapshots);

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

  function submitMetrics() {
    if (!accessToken || !publication) return;
    setPending(true);
    setActionError(null);
    void createManualMetrics(accessToken, publication.id, form)
      .then(() => Promise.allSettled([listPublicationMetrics(accessToken, publication.id), getMetricsInsights(accessToken, publication.id)]))
      .then(([listResult, insightResult]) => {
        if (listResult.status === "fulfilled") {
          setSnapshots(parseMetricsList(listResult.value) ?? []);
        }
        if (insightResult.status === "fulfilled") {
          setInsights(parseInsights(insightResult.value));
        }
        return loadOrCreatePerformanceAnalysis(accessToken, publication.id);
      })
      .then((loaded) => {
        setAnalysis(loaded);
        setForm(emptyMetricForm(nowLocalDatetimeValue()));
        setComposing(false);
        setPending(false);
      })
      .catch((err) => {
        setActionError(humanizeMetricsError(err));
        setPending(false);
      });
  }

  return (
    <div className="space-y-6 px-3 py-6 md:px-4" data-acf-published-post-detail-v5>
      <WorkflowBackNavV1
        page={composing ? "metric-entry" : "publication-detail"}
        projectId={projectId}
        publicationId={publicationId}
      />
      <PageHeader
        title="作品详情"
        description="作品信息、当前数据、历史数据、AI复盘与优化建议在同一页继续。"
        breadcrumb={[
          { label: "工作台", href: "/dashboard" },
          { label: "发布与数据", href: "/dashboard/monitoring" },
          { label: "作品详情" },
        ]}
        actions={
          cta.kind === "enter-metrics" ? (
            <button className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" type="button" onClick={() => setComposing(true)}>
              {pagePrimaryCta("metrics").label}
            </button>
          ) : (
            <button className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" type="button" onClick={() => document.getElementById("ai-review-section")?.scrollIntoView({ behavior: "smooth" })}>
              {cta.kind === "start-review" ? pagePrimaryCta("analyze").label : pagePrimaryCta("view").label}
            </button>
          )
        }
      />
      {error ? (
        <ProductErrorState
          title={error.title}
          humanMessage={error.humanMessage}
          recoveryAction={error.recoveryAction}
          technicalDetails={error.technicalDetails}
        />
      ) : null}
      {loadNote ? <p className="text-sm text-neutral-600">{loadNote}</p> : null}
      {!item && !error ? <p className="text-sm text-neutral-600">正在加载作品…</p> : null}
      {item || publication ? (
        <>
          <PublishedPostSummaryV5
            title={monitoringTitle({
              title: publication?.title ?? item?.title,
              platformPostId: item?.platformPostId,
              platformUrl: item?.platformUrl ?? publication?.externalUrl,
            })}
            publishedAtLabel={formatObservedAt(publication?.registeredAt ?? publication?.publishedAt ?? item?.publishedAt) || undefined}
            url={publication?.externalUrl ?? item?.platformUrl}
            boundVideo={Boolean(publication?.videoId || publication?.productionArtifactId || item?.videoId || item?.productionArtifactId)}
            boundVideoTitle={
              Boolean(publication?.videoId || publication?.productionArtifactId || item?.videoId || item?.productionArtifactId)
                ? publication?.sourceVideoTitle || publication?.title || item?.title
                : null
            }
            monitoringStatus={item?.monitoringStatus ?? (publication ? "REGISTERED" : undefined)}
          />
          <section className="space-y-3">
            <p className="text-sm text-neutral-600">当前数据由你手动录入。不会自动抓取抖音数据。</p>
            {latest ? (
              <MetricsSummaryV2 latest={latest} previous={previous} />
            ) : (
              <EmptyState
                title="还没有表现数据"
                description="目前还不能分析。下一步：录入你在抖音看到的数据。"
                primaryAction={{ label: "录入数据", onClick: () => setComposing(true) }}
              />
            )}
          </section>
          <MetricsTrendV1 snapshots={snapshots} />
          {hasCurrentMetrics ? (
            <section className="space-y-1">
              <p className="text-sm">数据记录：{sample.countLabel}</p>
              {sample.spanLabel ? <p className="text-sm">观察间隔：{sample.spanLabel}</p> : null}
              <p className="acf-caption">{LIMITED_SAMPLE_COPY}</p>
            </section>
          ) : null}
          {composing && publication ? (
            <PerformanceMetricForm
              form={form}
              pending={pending}
              onChange={setForm}
              onSubmit={submitMetrics}
              onCancel={() => setComposing(false)}
            />
          ) : hasCurrentMetrics && publication ? (
            <button className="rounded-md border px-4 py-2 text-sm" type="button" onClick={() => setComposing(true)}>
              继续录入
            </button>
          ) : null}
          {actionError ? (
            <p className="text-sm text-red-600" role="alert">
              {actionError}
            </p>
          ) : null}
          <MetricsHistoryV5 rows={history} expandedIndex={expandedIndex} onToggle={setExpandedIndex} />
          <section id="ai-review-section" className="space-y-3" data-acf-performance-analysis-page-v5>
            {insights?.dataSufficiency === "STALE_BY_NEWER_METRICS" || item?.monitoringStatus === "STALE" ? (
              <p>{staleAnalysisCopy()}</p>
            ) : null}
            <AiReviewWorkspaceV1
              hasMetrics={hasCurrentMetrics}
              hasAnalysis={Boolean(analysis)}
              recs={recs}
              decisions={decisions}
              singlePost
              pendingReviewId={pendingReviewId}
              reviewCardError={reviewCardError}
              analysisLoadError={loadNote?.includes("复盘内容加载失败") ? loadNote : null}
              onDecide={persistReview}
            />
          </section>
          {perfHref ? (
            <p className="text-sm">
              <Link className="underline" href={perfHref}>
                在项目里继续 AI 复盘
              </Link>
            </p>
          ) : null}
          <TechnicalDetailsPanel details="高级信息默认折叠。内部编号不对普通用户展示。" />
          {hasRetention ? null : <p className="sr-only">无完播率数据，不展示留存结论。</p>}
        </>
      ) : null}
      <p className="sr-only">{analysisErr.title}</p>
    </div>
  );
}
