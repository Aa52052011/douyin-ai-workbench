import { createIdempotencyKey, nextIdempotencyKey } from "./market-research.form";
import type { CampaignStrategyRecord, StrategyFormState } from "./campaign-strategy.types";
import { STRATEGY_CONSTRAINTS_MAX, STRATEGY_FOCUS_MAX, STRATEGY_USER_GOAL_MAX } from "./campaign-strategy.types";

export function emptyStrategyForm(): StrategyFormState {
  return {
    positioningRunId: "",
    marketResearchId: "",
    marketInsightId: "",
    userGoal: "",
    focus: "",
    constraints: "",
  };
}

export function strategyGenerateSemantics(form: StrategyFormState): string {
  return JSON.stringify({
    positioningRunId: form.positioningRunId,
    marketResearchId: form.marketResearchId,
    marketInsightId: form.marketInsightId,
    userGoal: form.userGoal.trim(),
    focus: form.focus.trim(),
    constraints: form.constraints.trim(),
  });
}

export function nextStrategyIdempotencyKey(
  previous: { semantics: string; key: string } | null,
  semantics: string,
  forceNew = false,
): { semantics: string; key: string } {
  if (forceNew) {
    return { semantics, key: createIdempotencyKey() };
  }
  return nextIdempotencyKey(previous, semantics);
}

export function trimOptional(value: string, max: number): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, max);
}

export function generateRequestBody(form: StrategyFormState, productBriefId?: string) {
  const body: {
    positioningRunId: string;
    productBriefId?: string;
    marketResearchId?: string;
    marketInsightId?: string;
    userGoal?: string;
    focus?: string;
    constraints?: string;
  } = { positioningRunId: form.positioningRunId };
  if (productBriefId) {
    body.productBriefId = productBriefId;
  }
  if (form.marketInsightId) {
    body.marketInsightId = form.marketInsightId;
    if (form.marketResearchId) {
      body.marketResearchId = form.marketResearchId;
    }
  }
  const userGoal = trimOptional(form.userGoal, STRATEGY_USER_GOAL_MAX);
  const focus = trimOptional(form.focus, STRATEGY_FOCUS_MAX);
  const constraints = trimOptional(form.constraints, STRATEGY_CONSTRAINTS_MAX);
  if (userGoal) body.userGoal = userGoal;
  if (focus) body.focus = focus;
  if (constraints) body.constraints = constraints;
  return body;
}

export function canGenerateStrategy(input: { briefExists: boolean; positioningRunId: string }): boolean {
  return Boolean(input.briefExists && input.positioningRunId);
}

export function isStrategyUsable(status?: string): boolean {
  return status === "READY" || status === "CONFIRMED";
}

export function sortStrategiesNewestFirst(items: CampaignStrategyRecord[]): CampaignStrategyRecord[] {
  return [...items].sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function latestStrategy(items: CampaignStrategyRecord[]): CampaignStrategyRecord | null {
  return sortStrategiesNewestFirst(items)[0] ?? null;
}

export function contentPlansHref(projectId: string, strategyId?: string): string {
  const base = `/dashboard/projects/${projectId}/content/plans`;
  return strategyId ? `${base}?strategyId=${encodeURIComponent(strategyId)}` : base;
}

export function positioningHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/positioning`;
}

export function productInformationHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/product`;
}

export function marketAnalysisHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/market/analysis`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function userGoalFromSnapshot(snapshot: unknown): Pick<StrategyFormState, "userGoal" | "focus" | "constraints"> {
  if (!isRecord(snapshot) || !isRecord(snapshot.currentUserGoal)) {
    return { userGoal: "", focus: "", constraints: "" };
  }
  return {
    userGoal: asText(snapshot.currentUserGoal.userGoal),
    focus: asText(snapshot.currentUserGoal.focus),
    constraints: asText(snapshot.currentUserGoal.constraints),
  };
}

export function formFromContext(input: {
  positioningRunId?: string;
  marketResearchId?: string;
  marketInsightId?: string;
  snapshot?: unknown;
}): StrategyFormState {
  const goals = userGoalFromSnapshot(input.snapshot);
  return {
    positioningRunId: input.positioningRunId ?? "",
    marketResearchId: input.marketResearchId ?? "",
    marketInsightId: input.marketInsightId ?? "",
    userGoal: goals.userGoal,
    focus: goals.focus,
    constraints: goals.constraints,
  };
}

export function humanizeStrategyError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  if (
    code === "CAMPAIGN_STRATEGY_POSITIONING_REQUIRED" ||
    code === "CAMPAIGN_STRATEGY_POSITIONING_INVALID" ||
    code === "AGENT_RUN_NOT_FOUND" ||
    code === "MARKET_INSIGHT_NOT_FOUND"
  ) {
    return "所选账号定位或市场分析已不可用，请重新选择。";
  }
  if (code === "PRODUCT_BRIEF_REQUIRED" || code === "PRODUCT_BRIEF_NOT_FOUND") {
    return "请先填写产品信息。";
  }
  return "推广策略生成失败，请稍后重试。";
}

export function missingDependencyState(input: { briefExists: boolean; hasPositioning: boolean }): "brief" | "positioning" | "both" | null {
  if (!input.briefExists && !input.hasPositioning) {
    return "both";
  }
  if (!input.briefExists) {
    return "brief";
  }
  if (!input.hasPositioning) {
    return "positioning";
  }
  return null;
}
