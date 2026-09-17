"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ContextualGuidanceV1 } from "../../../components/contextual-guidance-v1";
import { EmptyState } from "../../../components/empty-state";
import { WorkflowPageHeaderV1 } from "../../../components/workflow-page-header-v1";
import { ProductStatusBadge } from "../../../components/ui/badge";
import { ProductErrorState } from "../../../components/ui/error-state";
import { useAuth } from "../../../lib/auth-context";
import { listMonitoringPosts, type PublishedPostRecord } from "../../../lib/monitoring.api";
import { displayMetricValue } from "../../../lib/performance.view";
import { toProductError } from "../../../lib/ux/product-error";
import {
  boundVideoLabel,
  monitoringPrimaryCta,
  monitoringStatusLabel,
  monitoringTitle,
} from "../../../lib/ux/publication-monitoring-v5";

function hasMetrics(item: PublishedPostRecord): boolean {
  const m = item.latestMetrics;
  return Boolean(m && (m.playCount != null || m.likeCount != null || m.commentCount != null || m.shareCount != null || m.collectCount != null));
}

function nextLabel(item: PublishedPostRecord): string {
  return monitoringPrimaryCta({
    hasMetrics: hasMetrics(item),
    hasAnalysis: item.analysisStatus === "READY" || item.monitoringStatus === "ANALYSIS_READY",
  }).label;
}

export default function MonitoringListPage() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<PublishedPostRecord[] | null>(null);
  const [error, setError] = useState<ReturnType<typeof toProductError> | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void listMonitoringPosts(accessToken)
      .then((data) => setItems(data.items))
      .catch((err: Error) => setError(toProductError(err, "没能加载作品监控")));
  }, [accessToken]);

  return (
    <div className="max-w-6xl px-3 py-6 md:px-4">
      <WorkflowPageHeaderV1
        page="monitoring-list"
        title="发布与数据"
        description="跨项目查看已登记作品的摘要。详情、录入和复盘仍按每条作品继续。不会自动抓取抖音，也没有自动发布。"
        breadcrumb={[
          { label: "工作台", href: "/dashboard" },
          { label: "发布与数据" },
        ]}
      />
      <ContextualGuidanceV1 id="monitoring" />
      {error ? (
        <ProductErrorState
          title={error.title}
          humanMessage={error.humanMessage}
          recoveryAction={error.recoveryAction}
          technicalDetails={error.technicalDetails}
        />
      ) : null}
      {items && items.length === 0 && !error ? (
        <EmptyState
          title="还没有已登记作品"
          description="发布视频后回来登记。这里用来跟踪已发布作品，不会放演示数据，也不会自动抓取抖音。"
          primaryAction={{ label: "去项目里导出成片", href: "/dashboard/projects" }}
        />
      ) : null}
      {items && items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2" data-acf-monitoring-list-v5>
          {items.map((item) => (
            <article key={item.id} className="rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4 text-sm">
              <p className="font-medium">{monitoringTitle(item)}</p>
              <p className="mt-1 text-[var(--acf-text-secondary)]">{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "未填写登记时间"}</p>
              <p>{boundVideoLabel(Boolean(item.videoId || item.productionArtifactId), item.title)}</p>
              <p>
                播放 {displayMetricValue(item.latestMetrics?.playCount ?? null)} · 点赞 {displayMetricValue(item.latestMetrics?.likeCount ?? null)}
              </p>
              <p className="mt-2">
                <ProductStatusBadge status={item.monitoringStatus} />
                <span className="sr-only">{monitoringStatusLabel(item.monitoringStatus)}</span>
              </p>
              <p className="mt-2">下一步：{nextLabel(item)}</p>
              <Link className="mt-3 inline-flex rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-3 py-1.5 text-white" href={`/dashboard/monitoring/${item.id}`}>
                {nextLabel(item)}
              </Link>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
