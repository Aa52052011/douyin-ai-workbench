"use client";

import { useState } from "react";
import type { ContentPlanRecord, ContentPlanView, PlanHistoryItemView } from "../lib/content-planning.types";
import { ContentPlanningTopics } from "./content-planning-topics";
import { Dialog } from "./ui/dialog";

export function VersionHistoryDrawerV1({
  items,
  projectId,
  resolveView,
  embedded,
}: {
  items: PlanHistoryItemView[];
  projectId: string;
  resolveView: (version: number) => { record: ContentPlanRecord; view: ContentPlanView | null } | null;
  embedded?: boolean;
}) {
  const [viewing, setViewing] = useState<{
    title: string;
    view: ContentPlanView | null;
    planId: string;
    archived: boolean;
    unreadable: boolean;
    current: boolean;
  } | null>(null);

  if (items.length === 0) return null;
  const currentVersion = items[0]?.version;

  const list = (
    <ul className="mt-2 space-y-1">
      {items.map((item) => {
        const current = item.version === currentVersion;
        return (
          <li key={item.version} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div>
              <p className="font-medium">
                第{item.version}版 {current ? "当前" : "历史"}
              </p>
              <p className="acf-caption">{[item.statusLabel, item.createdAtLabel].filter(Boolean).join(" · ")}</p>
            </div>
            <button
              className="text-sm text-[var(--acf-text-secondary)] underline"
              type="button"
              onClick={() => {
                const resolved = resolveView(item.version);
                setViewing({
                  title: `第${item.version}版`,
                  view: resolved?.view ?? null,
                  planId: resolved?.record.id ?? "",
                  archived: resolved?.record.status === "ARCHIVED" || !current,
                  unreadable: !resolved?.view,
                  current,
                });
              }}
            >
              查看
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section data-acf-version-history>
      {embedded ? (
        list
      ) : (
        <details>
          <summary className="cursor-pointer text-sm font-medium">历史版本</summary>
          {list}
        </details>
      )}
      {viewing ? (
        <Dialog open title={viewing.title} description="只读查看，不会改当前制作。" onClose={() => setViewing(null)}>
          {viewing.unreadable || !viewing.view ? (
            <p className="text-sm">该版本无法读取</p>
          ) : (
            <ContentPlanningTopics
              view={viewing.view}
              projectId={projectId}
              planId={viewing.planId}
              canScript={false}
              archived
            />
          )}
        </Dialog>
      ) : null}
    </section>
  );
}

export function ContentPlanningHistory(props: {
  items: PlanHistoryItemView[];
  projectId: string;
  resolveView: (version: number) => { record: ContentPlanRecord; view: ContentPlanView | null } | null;
  embedded?: boolean;
}) {
  return <VersionHistoryDrawerV1 {...props} />;
}
