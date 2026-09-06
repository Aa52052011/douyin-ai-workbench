import Link from "next/link";
import { STAGE_CHECKLIST, STAGE_GROUPS, type ProjectStageMap } from "../lib/project-next-action";

const STATE_TEXT = {
  completed: "已完成",
  current: "当前",
  not_started: "未开始",
  unknown: "状态暂不可用",
} as const;

export function StageChecklist({
  projectId,
  stages,
}: {
  projectId: string;
  stages: ProjectStageMap;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {STAGE_GROUPS.map((group) => {
        const items = STAGE_CHECKLIST.filter((item) => item.group === group);
        return (
          <section key={group}>
            <h3 className="mb-2 text-sm font-medium">{group}</h3>
            <ul className="space-y-2">
              {items.map((item) => {
                const state = stages[item.key];
                const className =
                  state === "completed"
                    ? "text-neutral-900"
                    : state === "current"
                      ? "font-medium text-neutral-950"
                      : state === "unknown"
                        ? "text-neutral-600"
                        : "text-neutral-500";
                return (
                  <li key={item.key} className={`text-sm ${className}`}>
                    <Link className="flex items-start gap-2 break-words hover:underline" href={item.href(projectId)}>
                      <span className="w-4 shrink-0 text-center" aria-hidden>
                        {state === "completed" ? "✓" : state === "current" ? "→" : state === "unknown" ? "?" : "○"}
                      </span>
                      <span>
                        {item.label}
                        <span className="ml-1 text-xs text-neutral-500">（{STATE_TEXT[state]}）</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
