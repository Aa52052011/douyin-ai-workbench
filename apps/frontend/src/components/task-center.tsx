import Link from "next/link";
import type { TaskItemV2 } from "../lib/ux/task-center";
import { ActionCard, Card } from "./ui/card";

export function TaskCenter({
  tasks,
}: {
  tasks: TaskItemV2[];
  primaryId?: string;
}) {
  if (tasks.length === 0) {
    return <p className="acf-body-secondary">目前没有需要你立即处理的事项。</p>;
  }
  return (
    <ul className="space-y-2" data-acf-task-center data-acf-needs-attention>
      {tasks.map((task) => (
        <li key={task.id}>
          <div className="flex flex-col gap-2 rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] px-3 py-2.5 md:flex-row md:items-center md:justify-between md:gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{task.title}</p>
              <p className="acf-caption mt-0.5">{task.projectName}</p>
              <p className="acf-caption">{task.reason}</p>
            </div>
            <Link
              className="inline-flex min-h-9 shrink-0 items-center rounded-[var(--acf-radius-sm)] border border-[var(--acf-border-strong)] px-3 text-sm"
              href={task.href}
              aria-label={`${task.ctaLabel}：${task.projectName}`}
            >
              继续处理
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ResumeWorkCard({
  task,
  stageLabel,
}: {
  task: TaskItemV2;
  stageLabel?: string;
}) {
  return (
    <ActionCard
      className="border-[var(--acf-border)] bg-[var(--acf-brand-soft)] p-3"
      data-acf-resume-work
      data-acf-continue-work
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="acf-caption">继续上次工作</p>
          <p className="acf-context-label mt-1 truncate">{task.projectName}</p>
          <div className="mt-2 space-y-0.5">
            {stageLabel ? <p className="acf-caption">当前：{stageLabel}</p> : null}
            <p className="text-sm font-medium">下一步：{task.title}</p>
          </div>
        </div>
        <Link
          className="inline-flex min-h-9 shrink-0 items-center rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-4 text-sm text-[var(--acf-text-inverse)]"
          href={task.href}
          aria-label={`继续处理 ${task.projectName}`}
        >
          继续处理
        </Link>
      </div>
    </ActionCard>
  );
}
