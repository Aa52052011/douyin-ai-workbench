import { isStrategyUsable } from "./campaign-strategy.form";
import { parseStrategyOutput } from "./campaign-strategy.view";
import type { CampaignStrategyRecord } from "./campaign-strategy.types";
import {
  ADDITIONAL_REQUIREMENTS_MAX,
  PLANNING_DAYS_V1,
  POSTS_PER_DAY_MAX,
  POSTS_PER_DAY_MIN,
  type ContentPlanRecord,
  type PlanningFormState,
} from "./content-planning.types";

export function emptyPlanningForm(platform = "douyin"): PlanningFormState {
  return {
    positioningRunId: "",
    strategyId: "",
    planningDays: PLANNING_DAYS_V1,
    postsPerDay: 1,
    additionalRequirements: "",
    platform,
  };
}

export function expectedTopicCount(days: number, postsPerDay: number): number {
  return days * postsPerDay;
}

export function validatePlanningDays(value: number): string | null {
  if (value !== PLANNING_DAYS_V1) {
    return "当前只支持 7 天内容计划";
  }
  return null;
}

export function validatePostsPerDay(value: number): string | null {
  if (!Number.isInteger(value) || value < POSTS_PER_DAY_MIN || value > POSTS_PER_DAY_MAX) {
    return `每天发布数量需为 ${POSTS_PER_DAY_MIN}-${POSTS_PER_DAY_MAX} 条`;
  }
  return null;
}

export function validateAdditionalRequirements(value: string): string | null {
  if (value.trim().length > ADDITIONAL_REQUIREMENTS_MAX) {
    return `补充要求不能超过 ${ADDITIONAL_REQUIREMENTS_MAX} 个字`;
  }
  return null;
}

export function canGeneratePlan(form: PlanningFormState): boolean {
  return Boolean(
    form.positioningRunId &&
      validatePlanningDays(form.planningDays) === null &&
      validatePostsPerDay(form.postsPerDay) === null &&
      validateAdditionalRequirements(form.additionalRequirements) === null,
  );
}

export function createPlanBody(projectId: string, form: PlanningFormState) {
  const body: {
    projectId: string;
    planningDays: number;
    postsPerDay: number;
    platform: string;
    positioningRunId: string;
    strategyId?: string;
    additionalRequirements?: string;
  } = {
    projectId,
    planningDays: PLANNING_DAYS_V1,
    postsPerDay: form.postsPerDay,
    platform: form.platform.trim().slice(0, 50) || "douyin",
    positioningRunId: form.positioningRunId,
  };
  if (form.strategyId) {
    body.strategyId = form.strategyId;
  }
  const extra = form.additionalRequirements.trim();
  if (extra) {
    body.additionalRequirements = extra.slice(0, ADDITIONAL_REQUIREMENTS_MAX);
  }
  return body;
}

export function sortPlansNewestFirst(items: ContentPlanRecord[]): ContentPlanRecord[] {
  return [...items].sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function latestPlan(items: ContentPlanRecord[]): ContentPlanRecord | null {
  return sortPlansNewestFirst(items)[0] ?? null;
}

export function canConfirmPlan(status?: string): boolean {
  return status === "DRAFT";
}

export function canArchivePlan(status?: string): boolean {
  return status === "CONFIRMED";
}

export function canGenerateScript(status?: string): boolean {
  return status === "CONFIRMED" || status === "ARCHIVED";
}

export function usableStrategies(items: CampaignStrategyRecord[]): CampaignStrategyRecord[] {
  return items.filter((item) => isStrategyUsable(item.status) && parseStrategyOutput(item.payload));
}

export function defaultUsableStrategyId(items: CampaignStrategyRecord[]): string {
  return [...usableStrategies(items)].sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt))[0]
    ?.id ?? "";
}

export function resolveStrategyQuery(queryId: string | null | undefined, items: CampaignStrategyRecord[]): {
  strategyId: string;
  warning: string | null;
} {
  if (!queryId) {
    return { strategyId: defaultUsableStrategyId(items), warning: null };
  }
  const found = items.find((item) => item.id === queryId);
  if (!found || !isStrategyUsable(found.status) || !parseStrategyOutput(found.payload)) {
    return { strategyId: "", warning: "所选推广策略已不可用，请重新选择。" };
  }
  return { strategyId: found.id, warning: null };
}

export function scriptHref(projectId: string, contentPlanId: string, topicId: string): string {
  return `/dashboard/projects/${projectId}/content/scripts?contentPlanId=${encodeURIComponent(contentPlanId)}&topicId=${encodeURIComponent(topicId)}`;
}

export function positioningHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/positioning`;
}

export function strategyHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/strategy`;
}

export function humanizePlanningError(error: unknown, action: "generate" | "confirm" | "archive" = "generate"): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  if (
    code === "CONTENT_PLAN_POSITIONING_REQUIRED" ||
    code === "AGENT_RUN_NOT_FOUND" ||
    code === "CAMPAIGN_STRATEGY_POSITIONING_INVALID"
  ) {
    return "所选账号定位已不可用，请重新选择。";
  }
  if (code === "CAMPAIGN_STRATEGY_NOT_USABLE" || code === "CAMPAIGN_STRATEGY_NOT_FOUND") {
    return "所选推广策略已不可用，请重新选择。";
  }
  if (code === "CONTENT_PLAN_DAYS_NOT_AVAILABLE") {
    return "当前只支持 7 天内容计划。";
  }
  if (code === "CONTENT_PLAN_CONFLICT") {
    return action === "confirm" ? "当前计划状态不能确认。" : action === "archive" ? "当前计划状态不能归档。" : "当前计划状态不允许此操作。";
  }
  if (action === "confirm") {
    return "确认计划失败，请稍后重试。";
  }
  if (action === "archive") {
    return "归档计划失败，请稍后重试。";
  }
  return "内容计划生成失败，请稍后重试。";
}

export function mountWriteOperations(): string[] {
  return [];
}
