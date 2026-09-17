import type { PublicationHistoryItemView } from "../lib/publication.types";

export function PublicationHistory({
  items,
  onView,
}: {
  items: PublicationHistoryItemView[];
  onView: (index: number) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium">已登记作品</h2>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={`${item.createdAtLabel}-${item.title}-${index}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--acf-border)] bg-[var(--acf-surface)] px-4 py-3"
          >
            <div className="min-w-0 text-sm">
              <p className="break-words font-medium">{item.sourceVideoTitle}</p>
              <p className="text-neutral-500">
                {[item.statusLabel, item.publishedAtLabel || item.createdAtLabel].filter(Boolean).join(" · ")}
              </p>
              {item.externalUrl ? <p className="break-all text-neutral-600">{item.externalUrl}</p> : null}
            </div>
            <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => onView(index)}>
              查看
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
