import { useState } from "react";
import type { VideoHistoryItemView, VideoRecord } from "../lib/video.types";
import { Dialog } from "./ui/dialog";

export function VersionHistoryDrawerV1({
  items,
  records,
  currentId,
  onView,
}: {
  items: VideoHistoryItemView[];
  records: VideoRecord[];
  currentId?: string;
  onView: (videoId: string, historical: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <section data-acf-video-version-history>
      <details open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-sm font-medium">历史版本</summary>
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {items.map((item, index) => {
            const record = records[index];
            const current = record?.id === currentId;
            const accepted = record?.finalAcceptance?.current === true;
            return (
              <li
                key={record?.id || `${item.createdAtLabel}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] px-4 py-3"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    第{items.length - index}版 {current ? "当前" : "历史"}
                  </p>
                  <p className="acf-caption">
                    {[accepted && current ? "最终成片已确认" : item.statusLabel === "已完成" ? "待审核" : item.statusLabel, item.createdAtLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <button
                  className="rounded-[var(--acf-radius-sm)] border px-3 py-1.5 text-sm"
                  type="button"
                  onClick={() => record && onView(record.id, !current)}
                >
                  查看
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

export function VideoHistory({
  items,
  onView,
}: {
  items: VideoHistoryItemView[];
  onView: (index: number) => void;
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  if (items.length === 0) return null;
  return (
    <section>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${item.createdAtLabel}-${item.title}-${index}`} className="flex justify-between gap-2 border px-3 py-2 text-sm">
            <span className="break-words">{item.versionLabel || "版本"} · {item.title}</span>
            <button
              className="underline"
              type="button"
              onClick={() => {
                setViewing(index);
                onView(index);
              }}
            >
              查看
            </button>
          </li>
        ))}
      </ul>
      {viewing !== null ? (
        <Dialog open title="历史版本" description="只读查看" onClose={() => setViewing(null)}>
          <p className="text-sm">{items[viewing]?.title}</p>
        </Dialog>
      ) : null}
    </section>
  );
}
