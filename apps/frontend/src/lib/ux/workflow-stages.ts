import { emptyStatusFacts, type ProjectStatusFacts } from "../project-status";

export const WORKFLOW_STAGE_IDS = [
  "positioning",
  "planning",
  "script",
  "video",
  "publish",
  "metrics",
  "review",
  "next",
] as const;

export type WorkflowStageIdV2 = (typeof WORKFLOW_STAGE_IDS)[number];
export type WorkflowStageStatusV2 = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED";

export type WorkflowStageStateV2 = {
  id: WorkflowStageIdV2;
  label: string;
  href: string;
  status: WorkflowStageStatusV2;
  current: boolean;
};

export const WORKFLOW_STAGE_STATUS_LABEL: Record<WorkflowStageStatusV2, string> = {
  NOT_STARTED: "待开始",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  BLOCKED: "需要处理",
};

function mark(done: boolean | null | undefined, current: boolean): WorkflowStageStatusV2 {
  if (done) return "COMPLETED";
  if (current) return "IN_PROGRESS";
  return "NOT_STARTED";
}

export function resolveWorkflowStagesV2(projectId: string, facts: ProjectStatusFacts = emptyStatusFacts()): WorkflowStageStateV2[] {
  const base = `/dashboard/projects/${projectId}`;
  const positioningDone = Boolean(facts.positioningValid);
  const planningDone = Boolean(facts.hasScriptEligiblePlan || facts.latestPlanStatus === "CONFIRMED");
  const scriptDone = Boolean(facts.hasCompletedScript);
  const videoDone = Boolean(facts.hasCompletedVideo);
  const publishDone = Boolean(facts.hasPublishedPublication);
  const metricsDone = Boolean(facts.hasMetrics);

  const currentId: WorkflowStageIdV2 = !positioningDone
    ? "positioning"
    : !planningDone
      ? "planning"
      : !scriptDone
        ? "script"
        : !videoDone
          ? "video"
          : !publishDone
            ? "publish"
            : !metricsDone
              ? "metrics"
              : "review";

  const rows: Array<Omit<WorkflowStageStateV2, "current" | "status"> & { done: boolean }> = [
    { id: "positioning", label: "账号定位", href: `${base}/positioning`, done: positioningDone },
    { id: "planning", label: "内容计划", href: `${base}/content/plans`, done: planningDone },
    { id: "script", label: "选题与脚本", href: `${base}/content/scripts`, done: scriptDone },
    { id: "video", label: "视频制作", href: `${base}/content/videos`, done: videoDone },
    { id: "next", label: "审核与导出", href: `${base}/content/videos`, done: videoDone },
    { id: "publish", label: "手动发布", href: `${base}/publish`, done: publishDone },
    { id: "metrics", label: "数据监控", href: `/dashboard/monitoring`, done: metricsDone },
    { id: "review", label: "AI复盘", href: `${base}/performance`, done: metricsDone },
  ];

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    href: row.href,
    status: mark(row.done, row.id === currentId),
    current: row.id === currentId,
  }));
}

export function workflowCurrentLabel(stages: WorkflowStageStateV2[]): string {
  return stages.find((item) => item.current)?.label ?? "账号定位";
}
