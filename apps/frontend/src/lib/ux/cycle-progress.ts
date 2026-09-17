import { getUserFacingStatus } from "../ui-labels";
import type { ProjectStatusFacts } from "../project-status";
import { latestPlanNeedsScripts } from "./next-action-v2";
import { resolveWorkflowStagesV2, workflowCurrentLabel } from "./workflow-stages";

export type ProgressRowV2 = { label: string; value: string };

export function currentWorkStageCopy(projectId: string, facts: ProjectStatusFacts): string {
  if (facts.positioningValid !== true) return "账号定位";
  if (facts.latestPlanStatus === "DRAFT") return "内容计划待确认";
  if (latestPlanNeedsScripts(facts) && facts.latestPlanStatus === "CONFIRMED") return "内容计划已确认";
  if (facts.hasVideoAwaitingAcceptance === true) return "视频制作";
  return workflowCurrentLabel(resolveWorkflowStagesV2(projectId, facts));
}

export function cycleProgressRows(facts: ProjectStatusFacts): ProgressRowV2[] {
  const topics = facts.latestPlanTopicCount;
  const scriptsDone = facts.completedScriptsOnLatestPlan;
  const videosDone = facts.acceptedVideosOnLatestPlan;
  const published = facts.publishedOnLatestPlan;

  const planValue =
    facts.latestPlanStatus === "CONFIRMED" || facts.latestPlanStatus === "ARCHIVED"
      ? typeof topics === "number"
        ? `${topics}个选题 · 已确认`
        : "已确认"
      : facts.latestPlanStatus === "DRAFT"
        ? "待确认"
        : facts.hasReadablePlan
          ? getUserFacingStatus(facts.latestPlanStatus)
          : "未开始";

  const scriptValue =
    typeof topics === "number" && typeof scriptsDone === "number" ? `${scriptsDone} / ${topics}` : "未开始";

  const videoValue =
    typeof topics === "number" && typeof videosDone === "number" ? `${videosDone} / ${topics}` : "未开始";

  const publishValue =
    typeof topics === "number" && typeof published === "number" ? `${published} / ${topics}` : "未开始";

  const metricsValue =
    facts.hasMetricsOnLatestPlan === true
      ? "已录入"
      : typeof published === "number" && published > 0
        ? "待录入"
        : "尚未开始";

  return [
    { label: "内容计划", value: planValue },
    { label: "脚本", value: scriptValue },
    { label: "视频", value: videoValue },
    { label: "发布", value: publishValue },
    { label: "数据复盘", value: metricsValue },
  ];
}
