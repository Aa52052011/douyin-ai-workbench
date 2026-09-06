import type { metricHistoryRows } from "../lib/performance.view";

type HistoryRow = ReturnType<typeof metricHistoryRows>[number];

export function PerformanceHistory({
  rows,
  expandedIndex,
  onToggle,
}: {
  rows: HistoryRow[];
  expandedIndex: number | null;
  onToggle: (index: number) => void;
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b text-neutral-500">
            <th className="py-2 pr-3 font-medium">采集时间</th>
            <th className="py-2 pr-3 font-medium">观察时长</th>
            <th className="py-2 pr-3 font-medium">播放量</th>
            <th className="py-2 pr-3 font-medium">点赞</th>
            <th className="py-2 pr-3 font-medium">评论</th>
            <th className="py-2 pr-3 font-medium">分享</th>
            <th className="py-2 pr-3 font-medium">收藏</th>
            <th className="py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.observedAtLabel}-${index}`} className="border-b align-top">
              <td className="py-2 pr-3">{row.observedAtLabel || "—"}</td>
              <td className="py-2 pr-3">{row.hoursLabel || "—"}</td>
              <td className="py-2 pr-3">{row.views}</td>
              <td className="py-2 pr-3">{row.likes}</td>
              <td className="py-2 pr-3">{row.comments}</td>
              <td className="py-2 pr-3">{row.shares}</td>
              <td className="py-2 pr-3">{row.favorites}</td>
              <td className="py-2">
                <button className="underline" type="button" onClick={() => onToggle(index)} aria-expanded={expandedIndex === index}>
                  {expandedIndex === index ? "收起" : "查看"}
                </button>
                {expandedIndex === index ? (
                  <div className="mt-2 space-y-1 text-neutral-600">
                    {row.sourceLabel ? <p>数据来源：{row.sourceLabel}</p> : null}
                    <p>这条记录只反映当时观测，不会覆盖其他时间点。</p>
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
