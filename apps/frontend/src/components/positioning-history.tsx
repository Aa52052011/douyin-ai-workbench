import { useState } from "react";
import type { PositioningRecord } from "../lib/positioning.types";
import { PositioningSummary } from "./positioning-summary";

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function PositioningHistory({ items }: { items: PositioningRecord[] }) {
  const [viewing, setViewing] = useState<PositioningRecord | null>(null);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mt-8">
      <details>
        <summary className="cursor-pointer text-sm font-medium">历史定位</summary>
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li
              key={item.runId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--acf-border)] bg-[var(--acf-surface)] px-3 py-2"
            >
              <div className="min-w-0 text-sm">
                <p className="text-neutral-500">{formatTime(item.createdAt)}</p>
                <p className="line-clamp-2 text-neutral-700">{item.output.accountPositioning}</p>
              </div>
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => setViewing(item)}>
                查看
              </button>
            </li>
          ))}
        </ul>
      </details>
      {viewing ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[var(--acf-radius-md)] bg-[var(--acf-surface-elevated)] p-5 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium">历史定位</h2>
                <p className="text-sm text-neutral-500">{formatTime(viewing.createdAt)}</p>
              </div>
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => setViewing(null)}>
                关闭
              </button>
            </div>
            <PositioningSummary output={viewing.output} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
