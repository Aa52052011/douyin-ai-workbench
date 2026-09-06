import { useState } from "react";
import type { ScriptHistoryItemView, ScriptRecord } from "../lib/script.types";
import { parseTopicSnapshot, parsedScriptView } from "../lib/script.view";
import { ScriptDetail } from "./script-detail";

export function ScriptHistory({
  items,
  resolveRecord,
}: {
  items: ScriptHistoryItemView[];
  resolveRecord: (version: number) => ScriptRecord | null;
}) {
  const [viewing, setViewing] = useState<ScriptRecord | null>(null);
  const viewingView = viewing ? parsedScriptView(viewing) : null;

  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium">历史脚本</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.version}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3"
          >
            <div className="min-w-0 text-sm">
              <p className="font-medium">版本 {item.version}</p>
              <p className="break-words text-neutral-600">{item.title}</p>
              <p className="text-neutral-500">
                {[item.createdAtLabel, item.statusLabel, item.durationLabel].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button
              className="rounded-md border px-3 py-1.5 text-sm"
              type="button"
              onClick={() => setViewing(resolveRecord(item.version))}
            >
              查看
            </button>
          </li>
        ))}
      </ul>
      {viewing ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-lg" role="dialog" aria-modal="true">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-medium">版本 {viewing.version}</h2>
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => setViewing(null)}>
                关闭
              </button>
            </div>
            {viewingView ? (
              <ScriptDetail
                view={viewingView}
                version={viewing.version}
                source={parseTopicSnapshot(viewing.topicSnapshot)}
              />
            ) : (
              <p className="text-sm text-neutral-600">该版本无法读取</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
