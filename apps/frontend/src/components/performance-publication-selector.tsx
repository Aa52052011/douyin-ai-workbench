import { formatObservedAt, publicationOptionLabel } from "../lib/performance.form";
import type { PublicationRecord } from "../lib/publication.types";

export function PerformancePublicationSelector({
  items,
  value,
  hasDataById,
  disabled,
  snapshotCount,
  onChange,
}: {
  items: PublicationRecord[];
  value: string;
  hasDataById: Record<string, boolean>;
  disabled?: boolean;
  snapshotCount?: number;
  onChange: (publicationId: string) => void;
}) {
  const current = items.find((item) => item.id === value) ?? null;
  if (items.length === 0) {
    return null;
  }
  const registeredAt = formatObservedAt(current?.registeredAt || current?.publishedAt || current?.createdAt);
  return (
    <section className="space-y-1" data-acf-review-current-publication>
      <p className="acf-caption">正在复盘</p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{current?.title || "已发布作品"}</p>
          <p className="acf-caption">
            {[registeredAt ? `登记时间 ${registeredAt}` : null, typeof snapshotCount === "number" ? `${snapshotCount} 条数据记录` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {items.length > 1 ? (
          <details className="text-sm">
            <summary className="cursor-pointer">切换作品</summary>
            <select
              id="performance-publication"
              className="mt-2 max-w-xs rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              disabled={disabled}
              value={value}
              onChange={(event) => onChange(event.target.value)}
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {publicationOptionLabel(item, hasDataById[item.id])}
                </option>
              ))}
            </select>
          </details>
        ) : (
          <span className="sr-only" id="performance-publication">
            当前只有一条可复盘作品
          </span>
        )}
      </div>
    </section>
  );
}
