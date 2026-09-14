import type { VideoHistoryItemView } from "../lib/video.types";

export function VideoHistory({
  items,
  onView,
}: {
  items: VideoHistoryItemView[];
  onView: (index: number) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium">历史视频</h2>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={`${item.createdAtLabel}-${item.title}-${index}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3"
          >
            <div className="min-w-0 text-sm">
              <p className="acf-caption">{item.versionLabel || "版本"}</p>
              <p className="break-words font-medium">{item.title}</p>
              <p className="text-neutral-500">
                {[item.createdAtLabel, item.statusLabel, item.durationLabel].filter(Boolean).join(" · ")}
              </p>
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
