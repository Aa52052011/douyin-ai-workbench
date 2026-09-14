import { PerformanceHistory } from "./performance-history";
import type { metricHistoryRows } from "../lib/performance.view";

type HistoryRow = ReturnType<typeof metricHistoryRows>[number];

export function MetricsHistoryV5({
  rows,
  expandedIndex,
  onToggle,
}: {
  rows: HistoryRow[];
  expandedIndex: number | null;
  onToggle: (index: number) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4" data-acf-metrics-history-v5>
      <h2 className="text-base font-medium">历史数据记录</h2>
      <p className="text-sm text-neutral-600">每次保存都会新增一条数据记录，不会覆盖之前的数据。</p>
      <div className="overflow-x-auto">
        <table className="mb-3 w-full min-w-[28rem] text-left text-sm">
          <thead>
            <tr className="border-b text-neutral-500">
              <th className="py-2 pr-3 font-medium">时间</th>
              <th className="py-2 pr-3 font-medium">播放</th>
              <th className="py-2 pr-3 font-medium">点赞</th>
              <th className="py-2 pr-3 font-medium">评论</th>
              <th className="py-2 pr-3 font-medium">分享</th>
              <th className="py-2 pr-3 font-medium">收藏</th>
              <th className="py-2 font-medium">变化</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.observedAtLabel}-delta-${index}`} className="border-b">
                <td className="py-2 pr-3">{row.observedAtLabel || "—"}</td>
                <td className="py-2 pr-3">{row.views}</td>
                <td className="py-2 pr-3">{row.likes}</td>
                <td className="py-2 pr-3">{row.comments}</td>
                <td className="py-2 pr-3">{row.shares}</td>
                <td className="py-2 pr-3">{row.favorites}</td>
                <td className="py-2">{row.changeLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PerformanceHistory rows={rows} expandedIndex={expandedIndex} onToggle={onToggle} />
    </section>
  );
}
