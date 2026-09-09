import { canGenerateScript } from "./content-planning.form";
import {
  buildTopicProductionItems,
  getCurrentProductionTopic,
  latestConfirmedPlan,
  type TopicProductionItem,
} from "./content-planning.production";
import { parsePlanPayload } from "./content-planning.view";
import type { ContentPlanRecord, ContentTopicRecord } from "./content-planning.types";
import type { PublicationRecord } from "./publication.types";
import type { VideoRecord } from "./video.types";
import {
  SCRIPT_REQUIREMENTS_MAX,
  SCRIPT_TARGET_DURATIONS,
  type ScriptFormState,
  type ScriptPayloadRecord,
  type ScriptRecord,
} from "./script.types";

export function emptyScriptForm(): ScriptFormState {
  return {
    contentPlanId: "",
    topicId: "",
    targetDuration: 30,
    requirements: "",
  };
}

export function isEligiblePlan(plan: ContentPlanRecord): boolean {
  return canGenerateScript(plan.status) && parsePlanPayload(plan.payload) !== null;
}

export function eligiblePlans(items: ContentPlanRecord[]): ContentPlanRecord[] {
  return items.filter(isEligiblePlan);
}

export function topicsForPlan(plan: ContentPlanRecord | null): ContentTopicRecord[] {
  const parsed = plan ? parsePlanPayload(plan.payload) : null;
  return (parsed?.topics ?? []).filter((item) => Boolean(item.id));
}

export function topicBelongsToPlan(plan: ContentPlanRecord | null, topicId: string): boolean {
  return topicsForPlan(plan).some((item) => item.id === topicId);
}

export type ScriptWorkspaceSelection = {
  contentPlanId: string;
  topicId: string;
  warning: string | null;
  viewingHistoricalPlan: boolean;
  productionPlanId: string | null;
};

/**
 * Resolve Script page focus:
 * - valid query plan+topic → exact focus (historical confirmed allowed with flag)
 * - missing/invalid query → latest confirmed + current production topic
 * - draft query never becomes production SoT
 */
export function resolveScriptWorkspaceSelection(input: {
  queryPlanId?: string | null;
  queryTopicId?: string | null;
  plans: ContentPlanRecord[];
  scripts: ScriptRecord[];
  videos?: VideoRecord[];
  publications?: PublicationRecord[];
}): ScriptWorkspaceSelection {
  const usable = eligiblePlans(input.plans);
  const productionPlan = latestConfirmedPlan(usable);
  const productionPlanId = productionPlan?.id ?? null;

  const queryPlan = input.queryPlanId ? usable.find((item) => item.id === input.queryPlanId) : null;
  if (input.queryPlanId && input.queryTopicId && queryPlan && topicBelongsToPlan(queryPlan, input.queryTopicId)) {
    const viewingHistoricalPlan = Boolean(productionPlanId && queryPlan.id !== productionPlanId);
    return {
      contentPlanId: queryPlan.id,
      topicId: input.queryTopicId,
      warning: null,
      viewingHistoricalPlan,
      productionPlanId,
    };
  }

  if (input.queryPlanId || input.queryTopicId) {
    const fallback = defaultProductionSelection(productionPlan, input.scripts, input.videos, input.publications);
    return {
      ...fallback,
      warning: "所选内容计划或选题已不可用，已切换到当前生产计划。",
      viewingHistoricalPlan: false,
      productionPlanId,
    };
  }

  const fallback = defaultProductionSelection(productionPlan, input.scripts, input.videos, input.publications);
  return {
    ...fallback,
    warning: null,
    viewingHistoricalPlan: false,
    productionPlanId,
  };
}

function defaultProductionSelection(
  productionPlan: ContentPlanRecord | null,
  scripts: ScriptRecord[],
  videos: VideoRecord[] = [],
  publications: PublicationRecord[] = [],
): { contentPlanId: string; topicId: string } {
  if (!productionPlan) {
    return { contentPlanId: "", topicId: "" };
  }
  const items = buildTopicProductionItems({
    plan: productionPlan,
    scripts,
    videos,
    publications,
  });
  const current = getCurrentProductionTopic(items);
  if (current) {
    return { contentPlanId: productionPlan.id, topicId: current.topicId };
  }
  return { contentPlanId: productionPlan.id, topicId: "" };
}

/** Legacy query resolver: invalid query clears (no silent fallback). */
export function resolveScriptQuery(
  contentPlanId: string | null | undefined,
  topicId: string | null | undefined,
  plans: ContentPlanRecord[],
): { contentPlanId: string; topicId: string; warning: string | null } {
  if (!contentPlanId && !topicId) {
    return { contentPlanId: "", topicId: "", warning: null };
  }
  const plan = plans.find((item) => item.id === contentPlanId);
  if (!plan || !isEligiblePlan(plan) || !topicId || !topicBelongsToPlan(plan, topicId)) {
    return { contentPlanId: "", topicId: "", warning: "所选内容计划或选题已不可用，请重新选择。" };
  }
  return { contentPlanId: plan.id, topicId, warning: null };
}

export function hintDurationFromTopic(estimatedDuration?: string): number {
  const match = estimatedDuration?.match(/(\d{2})/);
  const parsed = match ? Number.parseInt(match[1], 10) : NaN;
  if ((SCRIPT_TARGET_DURATIONS as readonly number[]).includes(parsed)) {
    return parsed;
  }
  return 30;
}

export function createScriptBody(form: ScriptFormState) {
  const body: { contentPlanId: string; topicId: string; targetDuration?: number; requirements?: string } = {
    contentPlanId: form.contentPlanId,
    topicId: form.topicId,
  };
  if ((SCRIPT_TARGET_DURATIONS as readonly number[]).includes(form.targetDuration)) {
    body.targetDuration = form.targetDuration;
  }
  const requirements = form.requirements.trim();
  if (requirements) {
    body.requirements = requirements.slice(0, SCRIPT_REQUIREMENTS_MAX);
  }
  return body;
}

export function canGenerateFromForm(form: ScriptFormState): boolean {
  return Boolean(form.contentPlanId && form.topicId);
}

export function sortScriptsNewestFirst(items: ScriptRecord[]): ScriptRecord[] {
  return [...items].sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function scriptsForTopic(items: ScriptRecord[], contentPlanId: string, topicId: string): ScriptRecord[] {
  return sortScriptsNewestFirst(
    items.filter((item) => item.contentPlanId === contentPlanId && item.topicId === topicId),
  );
}

export function latestScriptForTopic(items: ScriptRecord[], contentPlanId: string, topicId: string): ScriptRecord | null {
  return scriptsForTopic(items, contentPlanId, topicId)[0] ?? null;
}

/** Prefer confirmed/archived as production SoT; draft-only means still in progress. */
export function productionScriptForTopic(
  items: ScriptRecord[],
  contentPlanId: string,
  topicId: string,
): ScriptRecord | null {
  const rows = scriptsForTopic(items, contentPlanId, topicId);
  return rows.find((item) => item.status === "CONFIRMED" || item.status === "ARCHIVED") ?? rows[0] ?? null;
}

export function hasUnconfirmedDraftAlongsideConfirmed(
  items: ScriptRecord[],
  contentPlanId: string,
  topicId: string,
): boolean {
  const rows = scriptsForTopic(items, contentPlanId, topicId);
  const hasConfirmed = rows.some((item) => item.status === "CONFIRMED" || item.status === "ARCHIVED");
  const hasDraft = rows.some((item) => item.status === "DRAFT");
  return hasConfirmed && hasDraft;
}

export function canEditScript(status?: string): boolean {
  return status === "DRAFT";
}

export function canConfirmScript(status?: string): boolean {
  return status === "DRAFT";
}

export function canArchiveScript(status?: string): boolean {
  return status === "CONFIRMED";
}

export function canGenerateVideo(status?: string): boolean {
  return status === "CONFIRMED";
}

export function concatScriptNarration(payload: ScriptPayloadRecord): string {
  const sections = (payload.sections ?? []).map((item) => item.narration?.trim() ?? "").filter(Boolean);
  return [payload.hook, payload.opening, ...sections, payload.ending, payload.cta]
    .map((item) => (item ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

export function draftPatchBody(payload: ScriptPayloadRecord) {
  return {
    title: payload.title?.trim().slice(0, 200) || undefined,
    content: concatScriptNarration(payload).slice(0, 8000),
    payload,
  };
}

export function videoHref(projectId: string, scriptId: string): string {
  return `/dashboard/projects/${projectId}/content/videos?scriptId=${encodeURIComponent(scriptId)}`;
}

export function contentPlansHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/content/plans`;
}

export function humanizeScriptError(error: unknown, action: "generate" | "save" | "confirm" | "archive" = "generate"): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  if (
    code === "CONTENT_PLAN_NOT_FOUND" ||
    code === "CONTENT_PLAN_CONFLICT" ||
    code === "SCRIPT_TOPIC_NOT_FOUND" ||
    code === "SCRIPT_PLAN_NOT_CONFIRMED"
  ) {
    return "所选内容计划或选题已不可用，请重新选择。";
  }
  if (code === "SCRIPT_DURATION_NOT_AVAILABLE") {
    return "当前只支持 15、30、45 或 60 秒脚本。";
  }
  if (code === "SCRIPT_CONFLICT") {
    if (action === "confirm") return "当前脚本状态不能确认。";
    if (action === "archive") return "当前脚本状态不能归档。";
    if (action === "save") return "当前脚本状态不能保存。";
    return "当前脚本状态不允许此操作。";
  }
  if (action === "save") return "保存草稿失败，请稍后重试。";
  if (action === "confirm") return "确认脚本失败，请稍后重试。";
  if (action === "archive") return "归档脚本失败，请稍后重试。";
  return "脚本生成失败，请稍后重试。";
}

export function mountWriteOperations(): string[] {
  return [];
}

export type { TopicProductionItem };
