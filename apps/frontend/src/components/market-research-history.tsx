"use client";

import { useState } from "react";
import { StatusBadge } from "./status-badge";
import {
  confidenceLabel,
  kindLabel,
  originLabel,
  qualityLabel,
  researchKind,
  researchSampleCount,
  researchSourceLabel,
  selectionLabel,
} from "../lib/market-research.form";
import type { MarketResearchRecord } from "../lib/market-research.types";

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function Stats({ item }: { item: MarketResearchRecord }) {
  const stats = item.snapshot?.sampleStats;
  if (!stats) {
    return null;
  }
  const rows = [
    stats.contentCount ? `作品 ${stats.contentCount}` : null,
    stats.keywordCount ? `关键词 ${stats.keywordCount}` : null,
    stats.competitorCount ? `竞品 ${stats.competitorCount}` : null,
    stats.trendCount ? `趋势 ${stats.trendCount}` : null,
    stats.audienceSignalCount ? `用户需求 ${stats.audienceSignalCount}` : null,
    stats.medianViews != null ? `当前样本中位播放 ${stats.medianViews}` : null,
    stats.medianEngagementRate != null ? `当前样本中位互动率 ${stats.medianEngagementRate}` : null,
  ].filter(Boolean);
  if (rows.length === 0) {
    return null;
  }
  return <p className="text-sm text-neutral-600">{rows.join(" · ")}</p>;
}

export function MarketResearchHistory({ items }: { items: MarketResearchRecord[] }) {
  const [viewing, setViewing] = useState<MarketResearchRecord | null>(null);

  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium">调研记录</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                第 {item.version} 次调研 · {kindLabel(researchKind(item))}
              </p>
              <p className="text-neutral-500">
                {researchSourceLabel(item)} · 当前样本 {researchSampleCount(item)} 条 · {formatTime(item.createdAt)}
              </p>
              <p className="text-neutral-600">
                {[qualityLabel(item.snapshot?.dataQuality?.dataSufficiency), confidenceLabel(item.snapshot?.dataQuality?.confidence)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={item.status} />
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => setViewing(item)}>
                查看
              </button>
            </div>
          </li>
        ))}
      </ul>
      {viewing ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-medium">第 {viewing.version} 次调研</h2>
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => setViewing(null)}>
                关闭
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <p>数据类型：{kindLabel(researchKind(viewing))}</p>
              <p>样本总数：{researchSampleCount(viewing)}</p>
              <Stats item={viewing} />
              <p>
                数据质量：
                {[qualityLabel(viewing.snapshot?.dataQuality?.dataSufficiency), confidenceLabel(viewing.snapshot?.dataQuality?.confidence)]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              <p>数据来源：{originLabel(viewing.queryContext?.origin)} · {selectionLabel(viewing.queryContext?.selectionMethod)}</p>
              {viewing.snapshot?.collectedAt || viewing.queryContext?.collectedAt ? (
                <p>采集时间：{formatTime(String(viewing.snapshot?.collectedAt ?? viewing.queryContext?.collectedAt))}</p>
              ) : null}
              {viewing.productBriefSnapshot?.productName ? (
                <p>
                  本次调研基于产品信息
                  {viewing.queryContext?.productBriefVersion ? `版本 ${viewing.queryContext.productBriefVersion}` : ""}
                  ：{viewing.productBriefSnapshot.productName}
                </p>
              ) : null}
              {viewing.snapshot?.dataQuality?.importOnly ? (
                <p className="text-neutral-600">当前导入数据仅代表你提供的样本，不代表平台整体。</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
