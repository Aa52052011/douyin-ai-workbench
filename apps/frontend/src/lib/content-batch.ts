/**
 * Step 13.2 — Content Batch view helpers over ContentPlan SoT.
 * batchSize authority = topics.length (not planningDays × postsPerDay).
 */

import { parsePlanPayload } from "./content-planning.view";
import type { ContentPlanRecord, ContentTopicRecord } from "./content-planning.types";
import type { BusinessGoalView } from "./business-goal";

/** Default for new generation / UI fallback only — never override real topics.length. */
export const DEFAULT_CONTENT_BATCH_SIZE = 7;

export type ContentBatchView = {
  id: string;
  version: number;
  title: string;
  summary?: string;
  batchSize: number;
  topics: ContentTopicRecord[];
  primaryGoal?: BusinessGoalView;
  legacyPlanningDays?: number;
  legacyPostsPerDay?: number;
  /** Planning ≠ publishing schedule (architecture freeze). */
  schedulePreferenceLegacy: boolean;
};

export function displaySequenceNumber(dayIndex: number | undefined, fallbackIndex: number): number {
  if (typeof dayIndex === "number" && Number.isInteger(dayIndex) && dayIndex >= 1) {
    return dayIndex;
  }
  if (typeof dayIndex === "number" && Number.isInteger(dayIndex) && dayIndex >= 0) {
    return dayIndex + 1;
  }
  return fallbackIndex + 1;
}

/** User-facing sequence: 第 N 条 (not Day / 第 N 天). */
export function formatTopicSequenceLabel(sequenceNumber: number, slot?: number, sameDayTotal?: number): string {
  if (typeof sameDayTotal === "number" && sameDayTotal > 1 && typeof slot === "number") {
    return `第 ${sequenceNumber} 条 · ${slot}/${sameDayTotal}`;
  }
  return `第 ${sequenceNumber} 条`;
}

export function deriveBatchSize(topicsLength: number): number {
  return topicsLength;
}

export function toContentBatchView(
  plan: ContentPlanRecord,
  options?: { primaryGoal?: BusinessGoalView },
): ContentBatchView | null {
  const payload = parsePlanPayload(plan.payload);
  if (!payload?.topics?.length) {
    return null;
  }
  const batchSize = deriveBatchSize(payload.topics.length);
  const legacyPlanningDays = plan.planningDays ?? payload.planningDays;
  const legacyPostsPerDay = plan.postsPerDay ?? payload.postsPerDay;
  return {
    id: plan.id,
    version: plan.version,
    title: (payload.title || plan.title || "本期内容计划").trim() || "本期内容计划",
    summary: payload.summary || plan.description || undefined,
    batchSize,
    topics: payload.topics,
    primaryGoal: options?.primaryGoal,
    legacyPlanningDays: typeof legacyPlanningDays === "number" ? legacyPlanningDays : undefined,
    legacyPostsPerDay: typeof legacyPostsPerDay === "number" ? legacyPostsPerDay : undefined,
    schedulePreferenceLegacy: typeof legacyPlanningDays === "number" || typeof legacyPostsPerDay === "number",
  };
}

export function batchProgressSummary(input: {
  batchSize: number;
  scriptReadyCount: number;
  videoReadyCount: number;
  publishedCount: number;
}): string {
  const n = input.batchSize;
  if (n <= 0) return "暂无内容";
  return `本批进度：脚本 ${input.scriptReadyCount} / ${n} · 视频 ${input.videoReadyCount} / ${n} · 已发布 ${input.publishedCount} / ${n}`;
}

export function planningPageTitle(): string {
  return "本期内容计划";
}

export function planningPageSubtitle(batchSize: number): string {
  return `本批共 ${batchSize} 条内容`;
}

export function weekOverviewHeading(): string {
  return "本批内容总览";
}

export function regenerateBatchLabel(): string {
  return "重新规划本批内容";
}
