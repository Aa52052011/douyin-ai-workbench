import { useState } from "react";
import type { EvidenceGroupView, EvidenceSummaryView } from "../lib/market-analysis.types";

export function MarketAnalysisEvidenceSummary({ summary }: { summary: EvidenceSummaryView }) {
  const rows = [
    `关键词样本：${summary.keywordCount}`,
    `作品样本：${summary.contentCount}`,
    `竞品样本：${summary.competitorCount}`,
    `趋势样本：${summary.trendCount}`,
    `用户需求样本：${summary.audienceCount}`,
  ];
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-medium">这批样本能支持哪些分析</h2>
      <p className="text-sm text-neutral-700">{rows.join(" · ")}</p>
      <p className="mt-2 text-sm text-neutral-600">
        数据充分度：{summary.sufficiencyLabel || "—"}
        {summary.shortConfidenceLabel ? ` · 可信度：${summary.shortConfidenceLabel}` : ""}
      </p>
    </section>
  );
}

export function MarketAnalysisEvidenceFold({
  groups,
  unavailable,
}: {
  groups: EvidenceGroupView[];
  unavailable?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (unavailable) {
    return (
      <p className="text-sm text-neutral-500" role="status">
        无法加载分析依据。
      </p>
    );
  }

  if (groups.length === 0) {
    return null;
  }

  return (
    <details
      className="rounded-xl border border-neutral-200 bg-white p-4"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-medium" aria-expanded={open}>
        查看分析依据
      </summary>
      <div className="mt-4 space-y-5">
        {groups.map((group) => (
          <section key={group.heading}>
            <h3 className="mb-2 text-sm font-medium">{group.heading}</h3>
            <ul className="space-y-3">
              {group.items.map((item, index) => (
                <li key={`${group.heading}-${index}`} className="min-w-0 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-neutral-600">{item.description}</p>
                  <p className="mt-1 text-neutral-500">
                    {[item.supportLabel, item.confidenceLabel, item.kindLabel].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
