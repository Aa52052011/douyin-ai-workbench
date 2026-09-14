import Link from "next/link";
import type { TaskItemV2 } from "../lib/ux/task-center";
import { Card } from "./ui/card";
import { EmptyState } from "./empty-state";

const PRIORITY_LABEL = { URGENT: "先处理", NEXT: "接下来", LATER: "稍后" } as const;

const primaryClass =
  "mt-3 inline-flex items-center rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-3 py-1.5 text-sm text-white";
const secondaryClass =
  "mt-3 inline-flex items-center rounded-[var(--acf-radius-sm)] border border-[var(--acf-border-strong)] px-3 py-1.5 text-sm";

export function TaskCenter({
  tasks,
  primaryId,
}: {
  tasks: TaskItemV2[];
  primaryId?: string;
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="当前没有待处理事项"
        description="可以查看已有项目，或开始一条新内容。"
        primaryAction={{ label: "查看项目", href: "/dashboard/projects" }}
        secondaryAction={{ label: "创建新内容", href: "/dashboard/projects#create-project" }}
      />
    );
  }
  return (
    <ul className="space-y-3" data-acf-task-center>
      {tasks.map((task) => {
        const primary = task.id === primaryId;
        return (
          <li key={task.id}>
            <Card className={primary ? "border-[var(--acf-brand)]" : undefined}>
              <p className="acf-caption">
                {PRIORITY_LABEL[task.priority]} · {task.projectName}
              </p>
              <p className="acf-card-title mt-1">{task.title}</p>
              <p className="acf-caption mt-1">{task.type}</p>
              <Link className={primary ? primaryClass : secondaryClass} href={task.href}>
                {task.ctaLabel}
              </Link>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

export function ResumeWorkCard({ task }: { task: TaskItemV2 }) {
  return (
    <Card data-acf-resume-work>
      <p className="acf-caption">继续上次任务</p>
      <p className="acf-card-title mt-1">{task.projectName}</p>
      <p className="acf-body-secondary mt-1">{task.title}</p>
      <Link className={primaryClass} href={task.href}>
        {task.ctaLabel}
      </Link>
    </Card>
  );
}
