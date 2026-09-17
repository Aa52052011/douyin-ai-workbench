"use client";

import { useState } from "react";
import type { metricHistoryRows } from "../lib/performance.view";

type HistoryRow = ReturnType<typeof metricHistoryRows>[number];

export function MetricsHistoryV5({
  rows,
  expandedIndex,
  onToggle,
  collapsedByDefault,
}: {
  rows: HistoryRow[];
  expandedIndex: number | null;
  onToggle: (index: number) => void;
  collapsedByDefault?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) return null;
  const visible = showAll ? rows : rows.slice(0, 3);
  const latestInterval = rows[0]?.hoursLabel?.trim() || "";
  const table = (
    <>
      <div className="max-w-full overflow-x-auto">
        <table className="mb-3 w-full min-w-[28rem] text-left text-sm">
          <thead>
            <tr className="border-b text-neutral-500">
              <th className="py-2 pr-3 font-medium">观察时间</th>
              <th className="py-2 pr-3 font-medium">观察时长</th>
              <th className="py-2 pr-3 font-medium">播放</th>
              <th className="py-2 pr-3 font-medium">点赞</th>
              <th className="py-2 pr-3 font-medium">评论</th>
              <th className="py-2 pr-3 font-medium">分享</th>
              <th className="py-2 pr-3 font-medium">收藏</th>
              <th className="py-2 pr-3 font-medium">新增粉丝</th>
              <th className="py-2 font-medium">详情</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={`${row.observedAtLabel}-delta-${index}`} className="border-b align-top">
                <td className="py-2 pr-3">{row.observedAtLabel || "—"}</td>
                <td className="py-2 pr-3">{row.hoursLabel || "—"}</td>
                <td className="py-2 pr-3">{row.views}</td>
                <td className="py-2 pr-3">{row.likes}</td>
                <td className="py-2 pr-3">{row.comments}</td>
                <td className="py-2 pr-3">{row.shares}</td>
                <td className="py-2 pr-3">{row.favorites}</td>
                <td className="py-2 pr-3">{row.changeLabel}</td>
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
      {rows.length > 3 ? (
        <button className="text-sm underline" type="button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "收起历史" : "查看全部历史"}
        </button>
      ) : null}
    </>
  );

  if (collapsedByDefault) {
    return (
      <section className="space-y-3 rounded-xl border border-[var(--acf-border)] bg-[var(--acf-surface-muted)] p-4" data-acf-metrics-history-v5>
        <details data-acf-metrics-history-disclosure>
          <summary className="cursor-pointer text-sm font-medium">
            历史数据 {rows.length} 条
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm text-neutral-600">每次保存都会新增一条数据记录，不会覆盖之前的数据。</p>
            {table}
          </div>
        </details>
        {latestInterval ? <p className="acf-caption">最近观察间隔：{latestInterval}</p> : null}
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-[var(--acf-border)] bg-[var(--acf-surface-muted)] p-4" data-acf-metrics-history-v5>
      <h2 className="text-base font-medium">历史数据记录</h2>
      <p className="text-sm text-neutral-600">每次保存都会新增一条数据记录，不会覆盖之前的数据。</p>
      {table}
    </section>
  );
}
