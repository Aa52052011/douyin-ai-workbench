import { applyFeedbackCopy, feedbackHandoffCopy, notAutoAppliedCopy } from "../lib/ux/publication-monitoring-v5";

export function FeedbackHandoffUXV5({
  approvedCount,
  totalCount,
}: {
  approvedCount: number;
  totalCount: number;
}) {
  if (totalCount === 0) return null;
  return (
    <section className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm" data-acf-feedback-handoff-v5>
      <h2 className="text-base font-medium">反馈回流</h2>
      <p>已采纳建议：{approvedCount} 条</p>
      <p>作用范围：下一轮内容规划时提供参考</p>
      <p>{feedbackHandoffCopy()}</p>
      <p>{applyFeedbackCopy()}</p>
      <p className="text-neutral-600">{notAutoAppliedCopy()}</p>
    </section>
  );
}
