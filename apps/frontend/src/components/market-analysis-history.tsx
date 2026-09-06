import { useState } from "react";
import type { HistoryItemView, InsightView, MarketInsightRecord } from "../lib/market-analysis.types";
import { MarketAnalysisInsightSummary } from "./market-analysis-insight";

export function MarketAnalysisHistory({
  items,
  resolveView,
}: {
  items: HistoryItemView[];
  resolveView: (version: number) => { record: MarketInsightRecord; view: InsightView } | null;
}) {
  const [viewing, setViewing] = useState<InsightView | null>(null);
  const [title, setTitle] = useState("");

  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium">历史分析</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.version}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3"
          >
            <div className="min-w-0 text-sm">
              <p className="font-medium">{item.title}</p>
              <p className="text-neutral-500">
                {[item.createdAtLabel, item.confidenceLabel].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 line-clamp-2 text-neutral-700">{item.summary}</p>
            </div>
            <button
              className="rounded-md border px-3 py-1.5 text-sm"
              type="button"
              onClick={() => {
                const resolved = resolveView(item.version);
                if (resolved) {
                  setViewing(resolved.view);
                  setTitle(item.title);
                }
              }}
            >
              查看
            </button>
          </li>
        ))}
      </ul>
      {viewing ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-medium">{title}</h2>
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => setViewing(null)}>
                关闭
              </button>
            </div>
            <MarketAnalysisInsightSummary view={viewing} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
