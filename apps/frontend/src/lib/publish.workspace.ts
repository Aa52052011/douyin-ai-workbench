import { latestConfirmedPlan } from "./content-planning.production";
import type { ContentPlanRecord } from "./content-planning.types";
import {
  eligiblePublishVideos,
  pendingManualPublishVideos,
} from "./publication.form";
import type { PublicationRecord } from "./publication.types";
import type { ScriptRecord } from "./script.types";
import { trendDelta, trendPercent } from "./ux/publication-monitoring-v5";
import { productionScripts } from "./video.workspace";
import type { VideoRecord } from "./video.types";

export const PUBLISH_WORKFLOW_STEPS = ["准备成片", "手动发布", "登记作品", "录入数据", "查看表现"] as const;

export type PublishWorkflowStep = (typeof PUBLISH_WORKFLOW_STEPS)[number];

export function productionPublishVideos(input: {
  plans: ContentPlanRecord[];
  scripts: ScriptRecord[];
  videos: VideoRecord[];
}): VideoRecord[] {
  const productionPlan = latestConfirmedPlan(input.plans);
  const scriptIds = new Set(productionScripts(input.scripts, productionPlan?.id ?? null).map((item) => item.id));
  if (scriptIds.size === 0) {
    return [];
  }
  return eligiblePublishVideos(input.videos).filter((video) => Boolean(video.scriptId && scriptIds.has(video.scriptId)));
}

export function pendingProductionPublishVideos(
  videos: VideoRecord[],
  publications: Pick<PublicationRecord, "videoId">[],
  plans: ContentPlanRecord[],
  scripts: ScriptRecord[],
): VideoRecord[] {
  return pendingManualPublishVideos(productionPublishVideos({ plans, scripts, videos }), publications);
}

export function resolvePublishCurrentVideo(
  queryVideoId: string | null | undefined,
  productionPending: VideoRecord[],
): { videoId: string; warning: string | null } {
  if (!queryVideoId) {
    if (productionPending.length === 1) {
      return { videoId: productionPending[0]!.id, warning: null };
    }
    return { videoId: "", warning: null };
  }
  const found = productionPending.find((item) => item.id === queryVideoId);
  if (found) {
    return { videoId: found.id, warning: null };
  }
  return {
    videoId: "",
    warning: "所选视频不属于当前内容计划的待发布成片。历史已登记作品仍可在下方查看。",
  };
}

export function publishWorkflowStepIndex(input: {
  hasCurrentVideo: boolean;
  downloaded: boolean;
  registering: boolean;
  registered: boolean;
  hasMetrics: boolean;
}): number {
  if (input.hasMetrics) return 4;
  if (input.registered) return 3;
  if (input.registering) return 2;
  if (input.downloaded && input.hasCurrentVideo) return 1;
  if (input.hasCurrentVideo) return 0;
  return 0;
}

export function formatTrendDelta(prev?: number | null, next?: number | null): { delta: string; percent: string | null } {
  const delta = trendDelta(prev, next);
  const percent = trendPercent(prev, next);
  if (delta == null) {
    return { delta: "—", percent: null };
  }
  return { delta: delta > 0 ? `+${delta}` : String(delta), percent };
}
