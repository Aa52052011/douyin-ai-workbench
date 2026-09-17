import { useState } from "react";
import type { ScriptHistoryItemView, ScriptRecord } from "../lib/script.types";
import { parsedScriptView } from "../lib/script.view";
import { Dialog } from "./ui/dialog";
import { ScriptEditorV2 } from "./script-editor";

export function VersionHistoryDrawerV1({
  items,
  resolveRecord,
  currentVersion,
}: {
  items: ScriptHistoryItemView[];
  resolveRecord: (version: number) => ScriptRecord | null;
  currentVersion?: number;
}) {
  const [viewing, setViewing] = useState<ScriptRecord | null>(null);
  const viewingView = viewing ? parsedScriptView(viewing) : null;

  if (items.length === 0) {
    return null;
  }

  return (
    <section data-acf-script-version-history>
      <details>
        <summary className="cursor-pointer text-sm font-medium">历史版本</summary>
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const current = item.version === (currentVersion ?? items[0]?.version);
            return (
              <li
                key={item.version}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] px-4 py-3"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    第{item.version}版 {current ? "当前" : "历史"}
                  </p>
                  <p className="acf-caption">
                    {[item.statusLabel === "等待审核" ? "待确认" : item.statusLabel, item.createdAtLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <button
                  className="rounded-[var(--acf-radius-sm)] border px-3 py-1.5 text-sm"
                  type="button"
                  onClick={() => setViewing(resolveRecord(item.version))}
                >
                  查看
                </button>
              </li>
            );
          })}
        </ul>
      </details>
      {viewing ? (
        <Dialog open title={`第${viewing.version}版`} description="只读查看，不会改当前制作。" onClose={() => setViewing(null)}>
          {viewingView ? <ScriptEditorV2 view={viewingView} readOnly /> : <p className="text-sm">该版本无法读取</p>}
        </Dialog>
      ) : null}
    </section>
  );
}

export function ScriptHistory({
  items,
  resolveRecord,
  currentVersion,
}: {
  items: ScriptHistoryItemView[];
  resolveRecord: (version: number) => ScriptRecord | null;
  currentVersion?: number;
}) {
  return <VersionHistoryDrawerV1 items={items} resolveRecord={resolveRecord} currentVersion={currentVersion} />;
}
