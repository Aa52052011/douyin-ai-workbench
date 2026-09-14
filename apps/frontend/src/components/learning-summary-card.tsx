"use client";

import type { LearningPublicView } from "../lib/research.api";

export function LearningSummaryCard({
  learning,
}: {
  learning: LearningPublicView | null;
}) {
  const status = learning?.statusLabel ?? "数据不足，系统正在积累";
  return (
    <section className="min-w-0 break-words rounded-xl border border-neutral-200 bg-white p-4" data-acf-learning-summary>
      <h2 className="text-sm font-medium">系统学习状态</h2>
      <p className="mt-2 text-sm text-neutral-800">{status}</p>
      {learning?.summary.slice(0, 3).map((item) => (
        <p key={item} className="mt-1 text-xs text-neutral-600">
          {item}
        </p>
      ))}
      {learning?.nextBatchAdjustments.length ? (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium text-neutral-700">下一批建议</p>
          {learning.nextBatchAdjustments.map((item) => (
            <p key={item} className="text-xs text-neutral-600">
              {item}
            </p>
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-xs text-neutral-500">市场研究看外部市场；账号学习看你自己的发布表现。</p>
    </section>
  );
}
