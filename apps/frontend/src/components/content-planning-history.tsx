import { useState } from "react";
import type { ContentPlanRecord, ContentPlanView, PlanHistoryItemView } from "../lib/content-planning.types";
import { ContentPlanningTopics } from "./content-planning-topics";

export function ContentPlanningHistory({
  items,
  projectId,
  resolveView,
}: {
  items: PlanHistoryItemView[];
  projectId: string;
  resolveView: (version: number) => { record: ContentPlanRecord; view: ContentPlanView | null } | null;
}) {
  const [viewing, setViewing] = useState<{
    title: string;
    view: ContentPlanView | null;
    planId: string;
    archived: boolean;
    unreadable: boolean;
  } | null>(null);

  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium">历史计划</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.version}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3"
          >
            <div className="min-w-0 text-sm">
              <p className="font-medium">版本 {item.version}</p>
              <p className="text-neutral-500">
                {[item.createdAtLabel, item.statusLabel, item.daysLabel, item.topicCountLabel].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 text-neutral-600">{item.strategyLabel}</p>
            </div>
            <button
              className="rounded-md border px-3 py-1.5 text-sm"
              type="button"
              onClick={() => {
                const resolved = resolveView(item.version);
                setViewing({
                  title: `版本 ${item.version}`,
                  view: resolved?.view ?? null,
                  planId: resolved?.record.id ?? "",
                  archived: resolved?.record.status === "ARCHIVED",
                  unreadable: !resolved?.view,
                });
              }}
            >
              查看
            </button>
          </li>
        ))}
      </ul>
      {viewing ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-medium">{viewing.title}</h2>
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => setViewing(null)}>
                关闭
              </button>
            </div>
            {viewing.unreadable || !viewing.view ? (
              <p className="text-sm text-neutral-600">该版本无法读取</p>
            ) : (
              <ContentPlanningTopics
                view={viewing.view}
                projectId={projectId}
                planId={viewing.planId}
                canScript={false}
                archived={viewing.archived}
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
