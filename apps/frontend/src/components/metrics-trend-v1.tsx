import type { MetricSnapshotRecord } from "../lib/performance.types";
import { sortSnapshotsNewestFirst } from "../lib/performance.form";

export function MetricsTrendV1({ snapshots }: { snapshots: MetricSnapshotRecord[] }) {
  const chronological = [...sortSnapshotsNewestFirst(snapshots)].reverse();
  const points = chronological
    .map((item) => item.views)
    .filter((value): value is number => typeof value === "number");

  if (snapshots.length === 0) return null;

  if (points.length < 2) {
    return (
      <section className="space-y-2" data-acf-metrics-trend-v1>
        <h2 className="acf-section-title">变化趋势</h2>
        <p className="acf-body-secondary">目前只有一组数据，再录入一次后可以看到变化趋势。</p>
      </section>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const width = 320;
  const height = 96;
  const coords = points.map((value, index) => {
    const x = (index / (points.length - 1)) * (width - 8) + 4;
    const y = height - 8 - ((value - min) / span) * (height - 16);
    return `${x},${y}`;
  });

  return (
    <section className="space-y-2" data-acf-metrics-trend-v1>
      <h2 className="acf-section-title">变化趋势</h2>
      <p className="acf-caption">播放次数随你录入的观察时间变化，不是自动抓取。</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full max-w-md" role="img" aria-label="播放次数趋势">
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={coords.join(" ")}
        />
        {coords.map((pair, index) => {
          const [x, y] = pair.split(",");
          return <circle key={`${pair}-${index}`} cx={x} cy={y} r="3" fill="currentColor" />;
        })}
      </svg>
    </section>
  );
}
