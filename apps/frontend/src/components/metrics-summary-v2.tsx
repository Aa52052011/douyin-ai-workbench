import { displayMetricValue } from "../lib/performance.view";
import type { MetricSnapshotRecord } from "../lib/performance.types";
import { formatTrendDelta } from "../lib/publish.workspace";

export function MetricsSummaryV2({
  latest,
  previous,
}: {
  latest: MetricSnapshotRecord | null;
  previous?: MetricSnapshotRecord | null;
}) {
  if (!latest) return null;
  const items = [
    { label: "播放", prev: previous?.views, next: latest.views },
    { label: "点赞", prev: previous?.likes, next: latest.likes },
    { label: "评论", prev: previous?.comments, next: latest.comments },
    { label: "分享", prev: previous?.shares, next: latest.shares },
    { label: "收藏", prev: previous?.favorites, next: latest.favorites },
    { label: "新增粉丝", prev: previous?.newFollowers, next: latest.newFollowers },
  ];
  return (
    <section className="space-y-3" data-acf-metrics-summary-v2>
      <h2 className="acf-section-title">当前表现</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const trend = formatTrendDelta(item.prev, item.next);
          return (
            <div key={item.label} className="rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4">
              <p className="acf-caption">{item.label}</p>
              <p className="text-lg font-medium">
                {typeof item.prev === "number" && typeof item.next === "number"
                  ? `${item.prev} → ${item.next}`
                  : displayMetricValue(item.next)}
              </p>
              {previous ? (
              <p className={`acf-caption mt-1 ${trend.delta.startsWith("+") ? "acf-metric-up" : ""}`}>
                  {trend.delta}
                  {item.label !== "新增粉丝" && trend.percent ? ` · ${trend.percent}` : ""}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
