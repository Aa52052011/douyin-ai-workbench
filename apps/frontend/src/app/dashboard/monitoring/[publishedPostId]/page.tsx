"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../../components/empty-state";
import { FeedbackHandoffUXV5 } from "../../../../components/feedback-handoff-ux-v5";
import { MetricsHistoryV5 } from "../../../../components/metrics-history-v5";
import { PageHeader } from "../../../../components/page-header";
import { PerformanceMetricForm } from "../../../../components/performance-metric-form";
import { PublishedPostSummaryV5 } from "../../../../components/published-post-summary-v5";
import { RecommendationReviewV5, type RecommendationReviewItem } from "../../../../components/recommendation-review-v5";
import { TrendCardsV5 } from "../../../../components/trend-cards-v5";
import { ProductErrorState, TechnicalDetailsPanel } from "../../../../components/ui/error-state";
import { useAuth } from "../../../../lib/auth-context";
import { listMonitoringPosts, type PublishedPostRecord } from "../../../../lib/monitoring.api";
import { createManualMetrics, getMetricsInsights, listPublicationMetrics } from "../../../../lib/performance.api";
import { emptyMetricForm, formatObservedAt, humanizeMetricsError, sortSnapshotsNewestFirst } from "../../../../lib/performance.form";
import type { MetricFormState, MetricSnapshotRecord, PerformanceInsightResult } from "../../../../lib/performance.types";
import {
  humanizePerformanceInsight,
  insufficientDataCopy,
  latestMetricCards,
  metricHistoryRows,
  parseInsights,
  parseMetricsList,
} from "../../../../lib/performance.view";
import { getPublication } from "../../../../lib/publication.api";
import type { PublicationRecord } from "../../../../lib/publication.types";
import { parsePublicationRecord } from "../../../../lib/publication.view";
import { toProductError } from "../../../../lib/ux/product-error";
import {
  CONFIDENCE_TOOLTIP,
  analysisErrorCopy,
  confidenceCopy,
  evidenceFromCounts,
  findingTypeCopy,
  insufficientReviewCopy,
  likeRateEvidence,
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

function recommendationsFromInsights(
  insights: PerformanceInsightResult | null,
  snapshots: MetricSnapshotRecord[],
): RecommendationReviewItem[] {
  const sorted = sortSnapshotsNewestFirst(snapshots);
  const latest = sorted[0];
  const prev = sorted[1];
  const evidence =
    evidenceFromCounts("播放量", prev?.views, latest?.views) ||
    likeRateEvidence(latest?.views, latest?.likes) ||
    "依据来自你录入的历史数据记录";
  return (insights?.insights ?? [])
    .map((item, index) => {
      const title = humanizePerformanceInsight(item.code);
      if (!title) return null;
      const rec: RecommendationReviewItem = {
        id: item.code ?? `rec-${index}`,
        title,
        reason: "基于目前数据，这条内容还有以下可优化空间",
        evidence,
        confidence: item.confidence,
        type: item.severity === "positive" ? "STRENGTH" : item.severity === "negative" ? "WEAKNESS" : "OBSERVATION",
        group: item.category,
      };
      return rec;
    })
    .filter((item): item is RecommendationReviewItem => item !== null);
}

export default function MonitoringDetailPage() {
  const { publishedPostId } = useParams<{ publishedPostId: string }>();
  const { accessToken } = useAuth();
  const [item, setItem] = useState<PublishedPostRecord | null>(null);
  const [publication, setPublication] = useState<PublicationRecord | null>(null);
  const [snapshots, setSnapshots] = useState<MetricSnapshotRecord[]>([]);
  const [insights, setInsights] = useState<PerformanceInsightResult | null>(null);
  const [error, setError] = useState<ReturnType<typeof toProductError> | null>(null);
  const [loadNote, setLoadNote] = useState<string | null>(null);
  const [form, setForm] = useState<MetricFormState>(emptyMetricForm(nowLocalDatetimeValue()));
  const [composing, setComposing] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "approve" | "reject" | "defer">>({});
  const [tab, setTab] = useState<"data" | "review">("data");

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
  const recs = recommendationsFromInsights(insights, snapshots);
  const latest = sortSnapshotsNewestFirst(snapshots)[0] ?? null;
  const previous = sortSnapshotsNewestFirst(snapshots)[1] ?? null;
  const hasRetention = mayShowRetentionClaim(latest?.completionRate) || mayShowRetentionClaim(latest?.averageWatchTimeSeconds);
  const hasAnalysis = recs.length > 0;
  const cta = monitoringPrimaryCta({ hasMetrics: hasCurrentMetrics, hasAnalysis });
  const cards = latestMetricCards(latest);
  const history = metricHistoryRows(snapshots, publication?.publishedAt ?? item?.publishedAt);
  const approvedCount = Object.values(decisions).filter((value) => value === "approve").length;
  const analysisErr = analysisErrorCopy();
  const perfHref = performanceHrefIfPossibleLocal(projectId, publicationId);

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
            <button className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" type="button" onClick={() => setTab("review")}>
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
            publishedAtLabel={formatObservedAt(publication?.publishedAt ?? item?.publishedAt) || undefined}
            url={publication?.externalUrl ?? item?.platformUrl}
            boundVideo={Boolean(item?.productionArtifactId)}
            monitoringStatus={item?.monitoringStatus ?? (publication ? "REGISTERED" : undefined)}
          />
          <section className="space-y-3">
            <h2 className="text-base font-medium">当前数据</h2>
            <p className="text-sm text-neutral-600">当前数据由你手动录入。不会自动抓取抖音数据。</p>
            {cards.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((card) => (
                  <div key={card.label} className="rounded-xl border border-neutral-200 bg-white p-4">
                    <p className="text-xs text-neutral-500">{card.label}</p>
                    <p className="text-lg font-medium">{card.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="还没有表现数据"
                description="目前还不能分析。下一步：录入你在抖音看到的数据。"
                primaryAction={{ label: "录入数据", onClick: () => setComposing(true) }}
              />
            )}
          </section>
          <TrendCardsV5
            previous={previous ? { views: previous.views, likes: previous.likes, comments: previous.comments, shares: previous.shares } : null}
            latest={latest ? { views: latest.views, likes: latest.likes, comments: latest.comments, shares: latest.shares } : null}
          />
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
          <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4" data-acf-performance-analysis-page-v5>
            <h2 className="text-base font-medium">AI复盘</h2>
            <div className="flex gap-2">
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => setTab("data")}>
                数据摘要
              </button>
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => setTab("review")}>
                优化建议
              </button>
            </div>
            {!hasCurrentMetrics ? (
              <p className="text-sm">{insufficientReviewCopy()}</p>
            ) : recs.length === 0 ? (
              <p className="text-sm">{insufficientDataCopy()}</p>
            ) : (
              <div className="space-y-3 text-sm">
                <p>基于目前数据，这条内容还有以下可优化空间。</p>
                {insights?.dataSufficiency === "STALE_BY_NEWER_METRICS" || item?.monitoringStatus === "STALE" ? (
                  <p>{staleAnalysisCopy()}</p>
                ) : null}
                {recs.map((rec) => (
                  <div key={`finding-${rec.id}`}>
                    <p>
                      {findingTypeCopy(rec.type)}：{rec.title}
                    </p>
                    <p>依据：{rec.evidence}</p>
                    {confidenceCopy(rec.confidence) ? (
                      <p title={CONFIDENCE_TOOLTIP}>可信程度：{confidenceCopy(rec.confidence)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {tab === "review" ? (
              <>
                <RecommendationReviewV5
                  items={recs}
                  decisions={decisions}
                  singlePost
                  onDecide={(id, action) => setDecisions((current) => ({ ...current, [id]: action }))}
                />
                <FeedbackHandoffUXV5 approvedCount={approvedCount} totalCount={recs.length} />
              </>
            ) : null}
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
