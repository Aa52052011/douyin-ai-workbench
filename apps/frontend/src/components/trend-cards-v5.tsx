import { trendDelta, trendPercent } from "../lib/ux/publication-monitoring-v5";

export function TrendCardsV5({
  previous,
  latest,
}: {
  previous?: {
    views?: number | null;
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
  } | null;
  latest?: {
    views?: number | null;
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
  } | null;
}) {
  if (!previous || !latest) return null;
  const items = [
    { label: "播放增长", prev: previous.views, next: latest.views },
    { label: "点赞增长", prev: previous.likes, next: latest.likes },
    { label: "评论增长", prev: previous.comments, next: latest.comments },
    { label: "分享增长", prev: previous.shares, next: latest.shares },
  ];
  return (
    <section className="space-y-3" data-acf-trend-ux-v5>
      <h2 className="text-base font-medium">变化趋势</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const delta = trendDelta(item.prev, item.next);
          const pct = trendPercent(item.prev, item.next);
          return (
            <div key={item.label} className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-xs text-neutral-500">{item.label}</p>
              <p className="text-lg font-medium">{delta == null ? "—" : delta > 0 ? `+${delta}` : String(delta)}</p>
              {pct ? <p className="text-xs text-neutral-500">{pct}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
