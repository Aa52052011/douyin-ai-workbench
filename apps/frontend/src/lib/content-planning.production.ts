/**
 * Step 12.12O — Content Plan production progress (view-model only).
 * Never write derived status back into ContentPlan.payload.topics[].status.
 */

import { parsePlanPayload } from "./content-planning.view";
import { sortPlansNewestFirst } from "./content-planning.form";
import type { ContentPlanRecord, ContentTopicRecord } from "./content-planning.types";
import type { PublicationRecord } from "./publication.types";
import type { ScriptRecord } from "./script.types";
import type { VideoRecord } from "./video.types";

export type TopicProductionStatus = "NOT_STARTED" | "SCRIPT_READY" | "VIDEO_READY" | "PUBLISHED";

export type TopicProductionItem = {
  topicId: string;
  topicIndex: number;
  dayIndex: number;
  dayLabel: string;
  sequenceLabel: string;
  title: string;
  hook?: string;
  contentPillar?: string;
  contentAngle?: string;
  format?: string;
  cta?: string;
  reason?: string;
  status: TopicProductionStatus;
  statusLabel: string;
  scriptId?: string;
  videoId?: string;
  publicationId?: string;
};

export type ProductionProgress = {
  topicCount: number;
  scriptReadyCount: number;
  videoReadyCount: number;
  publishedCount: number;
  enteredProductionCount: number;
  summaryLabel: string;
};

export type NextProductionAction =
  | {
      kind: "SCRIPT";
      topic: TopicProductionItem;
      label: string;
      hrefPath: "scripts";
    }
  | {
      kind: "VIDEO";
      topic: TopicProductionItem;
      label: string;
      hrefPath: "videos";
      scriptId: string;
    }
  | {
      kind: "PUBLISH";
      topic: TopicProductionItem;
      label: string;
      hrefPath: "publish";
      videoId: string;
    }
  | {
      kind: "COMPLETE";
      label: string;
    };

export function latestConfirmedPlan(items: ContentPlanRecord[]): ContentPlanRecord | null {
  return (
    sortPlansNewestFirst(items).find((item) => item.status === "CONFIRMED" || item.status === "ARCHIVED") ?? null
  );
}

export function latestDraftPlan(items: ContentPlanRecord[]): ContentPlanRecord | null {
  return sortPlansNewestFirst(items).find((item) => item.status === "DRAFT") ?? null;
}

export function topicProductionStatusLabel(status: TopicProductionStatus): string {
  switch (status) {
    case "NOT_STARTED":
      return "待制作";
    case "SCRIPT_READY":
      return "脚本已完成";
    case "VIDEO_READY":
      return "视频已完成";
    case "PUBLISHED":
      return "已发布";
  }
}

function isScriptReady(script: ScriptRecord): boolean {
  return script.status === "CONFIRMED" || script.status === "ARCHIVED";
}

function isVideoReady(video: VideoRecord): boolean {
  return video.status === "COMPLETED";
}

function isPublicationPublished(pub: PublicationRecord): boolean {
  return pub.status === "PUBLISHED";
}

/** Stable topic order: dayIndex asc, then original array order. Never reorder by priority. */
export function orderPlanTopics(topics: ContentTopicRecord[]): ContentTopicRecord[] {
  return topics
    .map((topic, index) => ({ topic, index }))
    .sort((a, b) => {
      const da = typeof a.topic.dayIndex === "number" ? a.topic.dayIndex : Number.MAX_SAFE_INTEGER;
      const db = typeof b.topic.dayIndex === "number" ? b.topic.dayIndex : Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      return a.index - b.index;
    })
    .map((row) => row.topic);
}

export function displayDayNumber(dayIndex: number | undefined, fallbackIndex: number): number {
  if (typeof dayIndex === "number" && Number.isInteger(dayIndex) && dayIndex >= 1) {
    return dayIndex;
  }
  // If contract ever used 0-based, map to user Day 1+.
  if (typeof dayIndex === "number" && Number.isInteger(dayIndex) && dayIndex >= 0) {
    return dayIndex + 1;
  }
  return fallbackIndex + 1;
}

function pickLatestScript(scripts: ScriptRecord[], planId: string, topicId: string): ScriptRecord | null {
  const matched = scripts
    .filter((item) => item.contentPlanId === planId && item.topicId === topicId)
    .sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt));
  return matched.find(isScriptReady) ?? null;
}

function pickLatestVideo(videos: VideoRecord[], scriptId: string): VideoRecord | null {
  const matched = videos
    .filter((item) => item.scriptId === scriptId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  return matched.find(isVideoReady) ?? matched[0] ?? null;
}

function pickLatestPublication(publications: PublicationRecord[], videoId: string): PublicationRecord | null {
  const matched = publications
    .filter((item) => item.videoId === videoId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  return matched.find(isPublicationPublished) ?? matched[0] ?? null;
}

export function buildTopicProductionItems(input: {
  plan: ContentPlanRecord;
  scripts: ScriptRecord[];
  videos: VideoRecord[];
  publications: PublicationRecord[];
}): TopicProductionItem[] {
  const payload = parsePlanPayload(input.plan.payload);
  if (!payload?.topics?.length) {
    return [];
  }
  const ordered = orderPlanTopics(payload.topics);
  const dayCounters = new Map<number, number>();

  return ordered.map((topic, index) => {
    const topicId = typeof topic.id === "string" && topic.id.trim() ? topic.id.trim() : `topic-${index}`;
    const dayNum = displayDayNumber(topic.dayIndex, index);
    const slot = (dayCounters.get(dayNum) ?? 0) + 1;
    dayCounters.set(dayNum, slot);

    const script = pickLatestScript(input.scripts, input.plan.id, topicId);
    const video = script ? pickLatestVideo(input.videos, script.id) : null;
    const publication = video ? pickLatestPublication(input.publications, video.id) : null;

    let status: TopicProductionStatus = "NOT_STARTED";
    if (publication && isPublicationPublished(publication)) {
      status = "PUBLISHED";
    } else if (video && isVideoReady(video)) {
      status = "VIDEO_READY";
    } else if (script && isScriptReady(script)) {
      status = "SCRIPT_READY";
    }

    const sameDayTotal = ordered.filter((t, i) => displayDayNumber(t.dayIndex, i) === dayNum).length;

    return {
      topicId,
      topicIndex: index,
      dayIndex: dayNum,
      dayLabel: `Day ${dayNum}`,
      sequenceLabel: sameDayTotal > 1 ? `Day ${dayNum} · ${slot}/${sameDayTotal}` : `Day ${dayNum}`,
      title: topic.title?.trim() || `选题 ${index + 1}`,
      hook: topic.hook?.trim() || undefined,
      contentPillar: topic.contentPillar?.trim() || undefined,
      contentAngle: topic.contentAngle?.trim() || undefined,
      format: topic.format?.trim() || undefined,
      cta: topic.cta?.trim() || undefined,
      reason: topic.reason?.trim() || undefined,
      status,
      statusLabel: topicProductionStatusLabel(status),
      scriptId: script?.id,
      videoId: video && isVideoReady(video) ? video.id : undefined,
      publicationId: publication && isPublicationPublished(publication) ? publication.id : undefined,
    };
  });
}

export function summarizeProductionProgress(items: TopicProductionItem[]): ProductionProgress {
  const topicCount = items.length;
  const scriptReadyCount = items.filter((item) => item.status !== "NOT_STARTED").length;
  const videoReadyCount = items.filter(
    (item) => item.status === "VIDEO_READY" || item.status === "PUBLISHED",
  ).length;
  const publishedCount = items.filter((item) => item.status === "PUBLISHED").length;
  const enteredProductionCount = scriptReadyCount;
  return {
    topicCount,
    scriptReadyCount,
    videoReadyCount,
    publishedCount,
    enteredProductionCount,
    summaryLabel:
      topicCount === 0
        ? "暂无选题"
        : `本期进度：${enteredProductionCount} / ${topicCount} 已进入制作`,
  };
}

/** Prefer first topic without confirmed script (queue default for 12.12P). */
export function getCurrentProductionTopic(items: TopicProductionItem[]): TopicProductionItem | null {
  return items.find((item) => item.status === "NOT_STARTED") ?? null;
}

export function findNextProductionAction(items: TopicProductionItem[]): NextProductionAction {
  const needScript = items.find((item) => item.status === "NOT_STARTED");
  if (needScript) {
    return {
      kind: "SCRIPT",
      topic: needScript,
      label: `开始制作第 ${needScript.dayIndex} 条脚本`,
      hrefPath: "scripts",
    };
  }
  const needVideo = items.find((item) => item.status === "SCRIPT_READY");
  if (needVideo?.scriptId) {
    return {
      kind: "VIDEO",
      topic: needVideo,
      label: "继续制作视频",
      hrefPath: "videos",
      scriptId: needVideo.scriptId,
    };
  }
  const needPublish = items.find((item) => item.status === "VIDEO_READY");
  if (needPublish?.videoId) {
    return {
      kind: "PUBLISH",
      topic: needPublish,
      label: "去发布这条视频",
      hrefPath: "publish",
      videoId: needPublish.videoId,
    };
  }
  return { kind: "COMPLETE", label: "本期内容已全部发布" };
}

export function scriptHrefForTopic(projectId: string, contentPlanId: string, topicId: string): string {
  return `/dashboard/projects/${projectId}/content/scripts?contentPlanId=${encodeURIComponent(contentPlanId)}&topicId=${encodeURIComponent(topicId)}`;
}

export function videoHrefForScript(projectId: string, scriptId: string): string {
  return `/dashboard/projects/${projectId}/content/videos?scriptId=${encodeURIComponent(scriptId)}`;
}

export function publishHrefForVideo(projectId: string, videoId: string): string {
  return `/dashboard/projects/${projectId}/publish?videoId=${encodeURIComponent(videoId)}`;
}

export function nextActionHref(projectId: string, planId: string, action: NextProductionAction): string | null {
  if (action.kind === "SCRIPT") {
    return scriptHrefForTopic(projectId, planId, action.topic.topicId);
  }
  if (action.kind === "VIDEO") {
    return videoHrefForScript(projectId, action.scriptId);
  }
  if (action.kind === "PUBLISH") {
    return publishHrefForVideo(projectId, action.videoId);
  }
  return null;
}

export type TopicUserFacingV2 = {
  label: string;
  ctaLabel: string;
  href: string | null;
};

function latestScriptForTopic(scripts: ScriptRecord[], planId: string, topicId: string): ScriptRecord | null {
  const matched = scripts
    .filter((item) => item.contentPlanId === planId && item.topicId === topicId)
    .sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt));
  return matched[0] ?? null;
}

/** UI-only status for topic cards. Does not write back to plan payload. */
export function resolveTopicUserFacingV2(input: {
  projectId: string;
  planId: string;
  planConfirmed: boolean;
  item: TopicProductionItem;
  scripts: ScriptRecord[];
  videos: VideoRecord[];
}): TopicUserFacingV2 {
  const scriptHref = scriptHrefForTopic(input.projectId, input.planId, input.item.topicId);
  if (!input.planConfirmed) {
    return { label: "待确认本期规划", ctaLabel: "查看详情", href: null };
  }
  const script = latestScriptForTopic(input.scripts, input.planId, input.item.topicId);
  if (!script) {
    return { label: "待制作脚本", ctaLabel: "制作脚本", href: scriptHref };
  }
  if (script.status === "DRAFT") {
    return { label: "脚本待确认", ctaLabel: "查看脚本", href: scriptHref };
  }
  const video = input.item.scriptId
    ? input.videos
        .filter((item) => item.scriptId === input.item.scriptId)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]
    : input.videos
        .filter((item) => item.scriptId === script.id)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  if (!video) {
    return {
      label: "待制作视频",
      ctaLabel: "制作视频",
      href: videoHrefForScript(input.projectId, script.id),
    };
  }
  if (video.status === "COMPLETED" && video.finalAcceptance?.current !== true) {
    return { label: "视频待审核", ctaLabel: "去审核", href: `/dashboard/projects/${input.projectId}/content/videos?scriptId=${encodeURIComponent(script.id)}` };
  }
  if (input.item.status === "VIDEO_READY" || (video.finalAcceptance?.current === true && input.item.status !== "PUBLISHED")) {
    return {
      label: "待发布",
      ctaLabel: "去发布",
      href: video.id ? publishHrefForVideo(input.projectId, video.id) : `/dashboard/projects/${input.projectId}/publish`,
    };
  }
  if (input.item.status === "PUBLISHED") {
    return { label: "已发布", ctaLabel: "查看发布", href: `/dashboard/projects/${input.projectId}/publish` };
  }
  return { label: "待制作脚本", ctaLabel: "制作脚本", href: scriptHref };
}

export function isSevenDaySingleTrack(plan: ContentPlanRecord, topicCount: number): boolean {
  const days = plan.planningDays ?? parsePlanPayload(plan.payload)?.planningDays ?? 7;
  const posts = plan.postsPerDay ?? parsePlanPayload(plan.payload)?.postsPerDay ?? 1;
  return days === 7 && posts === 1 && topicCount === 7;
}
