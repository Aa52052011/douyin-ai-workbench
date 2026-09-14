"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ContextualGuidanceV1 } from "../../../components/contextual-guidance-v1";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";
import { ProductStatusBadge } from "../../../components/ui/badge";
import { ProductErrorState } from "../../../components/ui/error-state";
import { Table } from "../../../components/ui/feedback";
import { useAuth } from "../../../lib/auth-context";
import { listMonitoringPosts, type PublishedPostRecord } from "../../../lib/monitoring.api";
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
    <div className="px-3 py-6 md:px-4">
      <PageHeader
        title="发布与数据"
        description="登记已发布作品、录入播放数据，有数据后再做 AI 复盘。不会自动抓取抖音，也没有自动发布。"
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
        <>
          <div className="grid gap-3 md:hidden">
            {items.map((item) => (
              <article key={item.id} className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
                <p className="font-medium">{monitoringTitle(item)}</p>
                <p className="mt-1 text-neutral-600">{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "未填写发布时间"}</p>
                <p>{boundVideoLabel(Boolean(item.productionArtifactId))}</p>
                <p>播放 {item.latestMetrics?.playCount ?? "—"} · 点赞 {item.latestMetrics?.likeCount ?? "—"}</p>
                <p className="mt-2">
                  <ProductStatusBadge status={item.monitoringStatus} />
                  <span className="sr-only">{monitoringStatusLabel(item.monitoringStatus)}</span>
                </p>
                <Link className="mt-3 inline-flex rounded-md bg-neutral-950 px-3 py-1.5 text-white" href={`/dashboard/monitoring/${item.id}`}>
                  {nextLabel(item)}
                </Link>
              </article>
            ))}
          </div>
          <div className="hidden md:block" data-acf-monitoring-list-v5>
            <Table wide>
              <thead className="border-b bg-[var(--acf-surface-subtle)]">
                <tr>
                  <th className="px-3 py-2">作品</th>
                  <th className="px-3 py-2">发布时间</th>
                  <th className="px-3 py-2">播放</th>
                  <th className="px-3 py-2">点赞</th>
                  <th className="px-3 py-2">评论</th>
                  <th className="px-3 py-2">分享</th>
                  <th className="px-3 py-2">收藏</th>
                  <th className="px-3 py-2">最后更新</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">下一步</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Link className="underline" href={`/dashboard/monitoring/${item.id}`}>
                        {monitoringTitle(item)}
                      </Link>
                      <p className="text-xs text-neutral-500">{boundVideoLabel(Boolean(item.productionArtifactId))}</p>
                    </td>
                    <td className="px-3 py-2">{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "未填写"}</td>
                    <td className="px-3 py-2">{item.latestMetrics?.playCount ?? "—"}</td>
                    <td className="px-3 py-2">{item.latestMetrics?.likeCount ?? "—"}</td>
                    <td className="px-3 py-2">{item.latestMetrics?.commentCount ?? "—"}</td>
                    <td className="px-3 py-2">{item.latestMetrics?.shareCount ?? "—"}</td>
                    <td className="px-3 py-2">{item.latestMetrics?.collectCount ?? "—"}</td>
                    <td className="px-3 py-2">{item.latestMetrics?.capturedAt ? new Date(item.latestMetrics.capturedAt).toLocaleString() : item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2">
                      <ProductStatusBadge status={item.monitoringStatus} />
                    </td>
                    <td className="px-3 py-2">
                      <Link className="underline" href={`/dashboard/monitoring/${item.id}`}>
                        {nextLabel(item)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      ) : null}
    </div>
  );
}
