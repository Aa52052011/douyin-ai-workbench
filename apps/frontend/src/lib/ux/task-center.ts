import type { Project } from "../types";
import type { ProjectStatusFacts } from "../project-status";
import { resolveNextActionV2 } from "./next-action-v2";

export type TaskPriorityV2 = "URGENT" | "NEXT" | "LATER";

export type TaskItemV2 = {
  id: string;
  projectId: string;
  projectName: string;
  type: string;
  title: string;
  reason: string;
  ctaLabel: string;
  href: string;
  priority: TaskPriorityV2;
};

const URGENT_LABELS = ["确认", "待审核", "需要处理", "重试", "去审核"];

function taskTypeFromAction(id: string, label: string): string {
  if (id === "product" || id === "positioning") return "待确认定位";
  if (id === "planning" && label.includes("确认")) return "待确认内容计划";
  if (id === "script" && label.includes("确认")) return "待确认脚本";
  if (id === "script") return "待生成脚本";
  if (id === "video" && (label.includes("审核") || label.includes("确认"))) return "待审核视频";
  if (id === "video" && label.includes("进度")) return "视频生成中";
  if (id === "video") return "待制作视频";
  if (id === "publication") return "待登记作品";
  if (id === "performance" && label.includes("复盘")) return "待复盘";
  if (id === "performance") return "待录入数据";
  if (id === "research" || id === "analysis" || id === "strategy") return "待完善内容方向";
  if (id === "next-plan") return "下一轮内容计划";
  return label;
}

function priorityFor(label: string, id: string): TaskPriorityV2 {
  if (URGENT_LABELS.some((item) => label.includes(item))) return "URGENT";
  if (id === "next-plan") return "LATER";
  return "NEXT";
}

/** One task per project, derived only from real next-action facts. */
export function collectProjectTask(project: Project, facts: ProjectStatusFacts): TaskItemV2 {
  const action = resolveNextActionV2(project.id, facts);
  return {
    id: `${project.id}:${action.id}`,
    projectId: project.id,
    projectName: project.name,
    type: taskTypeFromAction(action.id, action.label),
    title: action.label,
    reason: action.description ?? action.stepCopy,
    ctaLabel: action.ctaLabel ?? "继续",
    href: action.href,
    priority: priorityFor(action.label, action.id),
  };
}

export function needsAttentionTasks(tasks: TaskItemV2[]): TaskItemV2[] {
  return dedupeTasks(tasks).filter((task) => task.priority !== "LATER");
}

export function continueWorkFor(
  tasks: TaskItemV2[],
  lastProjectId: string | null,
): TaskItemV2 | null {
  if (lastProjectId) {
    const match = tasks.find((item) => item.projectId === lastProjectId);
    if (match) return match;
  }
  return tasks[0] ?? null;
}

export function sortTasks(tasks: TaskItemV2[]): TaskItemV2[] {
  const rank: Record<TaskPriorityV2, number> = { URGENT: 0, NEXT: 1, LATER: 2 };
  return [...tasks].sort((a, b) => rank[a.priority] - rank[b.priority] || a.projectName.localeCompare(b.projectName, "zh-CN"));
}

export function primaryTask(tasks: TaskItemV2[]): TaskItemV2 | null {
  return sortTasks(tasks)[0] ?? null;
}

export function dedupeTasks(tasks: TaskItemV2[]): TaskItemV2[] {
  const seen = new Set<string>();
  const out: TaskItemV2[] = [];
  for (const task of sortTasks(tasks)) {
    const key = `${task.projectId}:${task.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(task);
  }
  return out;
}
