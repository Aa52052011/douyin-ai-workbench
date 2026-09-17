import type { AcceptedPerformanceFeedbackItem } from "../lib/performance-analysis.api";
import type { PositioningOutput } from "../lib/positioning.types";

export function LearningContextSummaryV1({
  positioning,
  acceptedFeedback,
  publishedCount,
  metricsCount,
  showIgnoreControl,
  ignored,
  onToggleIgnore,
  generatedPlan,
}: {
  positioning?: PositioningOutput | null;
  acceptedFeedback: AcceptedPerformanceFeedbackItem[];
  publishedCount?: number;
  metricsCount?: number;
  showIgnoreControl: boolean;
  ignored: boolean;
  onToggleIgnore?: (ignored: boolean) => void;
  generatedPlan?: boolean;
}) {
  const hasPositioning = Boolean(positioning?.accountPositioning);
  const chips = [
    hasPositioning ? "账号定位" : null,
    positioning?.publishingStrategy?.frequency ? "项目目标" : null,
    positioning?.persona?.tone ? "内容风格" : null,
    acceptedFeedback.length > 0 ? `上一轮已采纳建议 ${acceptedFeedback.length} 条` : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <aside className={generatedPlan ? undefined : "mb-4"} data-acf-learning-context data-acf-planning-reused-positioning>
      <p className="acf-caption">
        AI 已参考：{chips.length > 0 ? chips.join(" · ") : "暂无已确认资料"}
      </p>
      <details className="mt-1">
        <summary className="cursor-pointer text-sm text-[var(--acf-text-secondary)]">查看参考依据</summary>
        <div className="mt-2 space-y-2 text-sm">
          <p>{hasPositioning ? "已确认账号定位" : "账号定位待确认"}</p>
          {typeof publishedCount === "number" && publishedCount > 0 ? <p>已发布作品：{publishedCount}</p> : null}
          {typeof metricsCount === "number" && metricsCount > 0 ? <p>数据记录：{metricsCount}</p> : null}
          {acceptedFeedback.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {acceptedFeedback.map((item, index) => (
                <li key={item.recommendationId || String(index)}>
                  <span>{item.recommendedAction}</span>
                  {item.sourcePublicationId || item.sourceAnalysisId ? (
                    <span className="acf-caption mt-0.5 block">依据：已发布作品与复盘记录</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="acf-caption">仅作为参考，不会自动修改定位或推广目标。</p>
          {generatedPlan ? <p className="acf-caption">这份说明不会改已生成的内容计划。</p> : null}
          {showIgnoreControl && onToggleIgnore ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ignored}
                onChange={(event) => onToggleIgnore(event.target.checked)}
              />
              本轮不参考上一轮已采纳建议
            </label>
          ) : null}
        </div>
      </details>
    </aside>
  );
}
