import { latestConfirmedPlan } from "./content-planning.production";
import type { ContentPlanRecord } from "./content-planning.types";
import { isEligibleScript, latestVideoForScript, videosForScript } from "./video.form";
import type { ScriptRecord } from "./script.types";
import type { VideoAssetRecord, VideoRecord, VideoStageView } from "./video.types";
import { parseJobStages, videoStageViews } from "./video.view";

export type VideoUserState = "no-script" | "no-video" | "generating" | "review" | "accepted" | "failed";

export function isCurrentFinalAcceptance(video?: VideoRecord | null): boolean {
  return video?.finalAcceptance?.current === true;
}

export function isArtifactReady(asset?: VideoAssetRecord | null): boolean {
  if (!asset?.contentPath) return false;
  const status = (asset.status || "READY").toUpperCase();
  return status === "READY" || status === "COMPLETED" || status === "AVAILABLE";
}

export function hasLandscapeArtifact(video?: VideoRecord | null): boolean {
  return isArtifactReady(video?.landscapeAsset ?? null);
}

export function hasVerticalArtifact(video?: VideoRecord | null): boolean {
  return isArtifactReady(video?.outputAsset ?? null);
}

export function canDownloadAcceptedVariant(
  video: VideoRecord | null | undefined,
  variant: "vertical" | "landscape",
): boolean {
  if (!video || video.status !== "COMPLETED" || !isCurrentFinalAcceptance(video)) return false;
  return variant === "landscape" ? hasLandscapeArtifact(video) : hasVerticalArtifact(video);
}

export function videoWorkspaceStatus(video?: VideoRecord | null, generating?: boolean): string {
  if (generating && !video) return "正在制作视频";
  if (!video) return "待制作视频";
  if (video.status === "FAILED") return "制作失败";
  if (video.status === "PENDING" || video.status === "PROCESSING" || video.status === "RUNNING") return "正在制作视频";
  if (video.status === "COMPLETED" && isCurrentFinalAcceptance(video)) return "最终成片已确认";
  if (video.status === "COMPLETED") return "视频待审核";
  return "正在制作视频";
}

export function videoUserState(video?: VideoRecord | null): VideoUserState {
  if (!video) return "no-video";
  if (video.status === "FAILED") return "failed";
  if (video.status === "PENDING" || video.status === "PROCESSING" || video.status === "RUNNING") return "generating";
  if (video.status === "COMPLETED" && isCurrentFinalAcceptance(video)) return "accepted";
  if (video.status === "COMPLETED") return "review";
  return "generating";
}

export function videoVersionNumber(videos: VideoRecord[], scriptId: string, videoId: string): number {
  const rows = [...videosForScript(videos, scriptId)].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const index = rows.findIndex((item) => item.id === videoId);
  return index >= 0 ? index + 1 : rows.length;
}

export function hasFineGrainStages(video?: VideoRecord | null): boolean {
  if (!video?.job?.output) return false;
  const parsed = parseJobStages(video.job.output);
  return Boolean(parsed.currentStage || parsed.completed.length || parsed.failed);
}

export function videoProgressStages(video?: VideoRecord | null): Array<{ id: string; label: string; state: "done" | "current" | "todo" }> {
  if (!video || !hasFineGrainStages(video)) return [];
  const labels: Record<string, string> = {
    visual: "生成画面",
    voice: "生成配音",
    subtitle: "生成字幕",
    compose: "合成视频",
    finalize: "质量检查",
  };
  return videoStageViews(video).map((stage: VideoStageView) => ({
    id: stage.key,
    label: labels[stage.key] ?? stage.label,
    state: stage.state === "done" ? "done" : stage.state === "current" || stage.state === "failed" ? "current" : "todo",
  }));
}

export function productionScripts(
  scripts: ScriptRecord[],
  productionPlanId: string | null,
): ScriptRecord[] {
  if (!productionPlanId) return [];
  return scripts.filter((item) => item.contentPlanId === productionPlanId && isEligibleScript(item));
}

export function resolveVideoWorkspaceSelection(input: {
  queryScriptId?: string | null;
  queryVideoId?: string | null;
  plans: ContentPlanRecord[];
  scripts: ScriptRecord[];
  videos: VideoRecord[];
}): {
  scriptId: string;
  videoId: string | null;
  warning: string | null;
  viewingHistorical: boolean;
  productionPlanId: string | null;
} {
  const confirmedPlans = input.plans.filter((item) => item.status === "CONFIRMED");
  const productionPlan = latestConfirmedPlan(confirmedPlans) ?? latestConfirmedPlan(input.plans);
  const productionPlanId = productionPlan?.id ?? null;
  const prodScripts = productionScripts(input.scripts, productionPlanId);

  const queryScript = input.queryScriptId
    ? input.scripts.find((item) => item.id === input.queryScriptId && isEligibleScript(item))
    : null;

  if (input.queryScriptId) {
    if (!queryScript) {
      const fallback = defaultScriptAndVideo(prodScripts, input.videos);
      return {
        ...fallback,
        warning: "所选脚本已不可用，已切换到当前生产计划。",
        viewingHistorical: false,
        productionPlanId,
      };
    }
    const viewingHistorical = Boolean(productionPlanId && queryScript.contentPlanId && queryScript.contentPlanId !== productionPlanId);
    const video =
      (input.queryVideoId && input.videos.find((item) => item.id === input.queryVideoId && item.scriptId === queryScript.id)) ||
      latestVideoForScript(input.videos, queryScript.id);
    return {
      scriptId: queryScript.id,
      videoId: video?.id ?? null,
      warning: null,
      viewingHistorical,
      productionPlanId,
    };
  }

  if (input.queryVideoId) {
    const video = input.videos.find((item) => item.id === input.queryVideoId);
    const script = video?.scriptId
      ? input.scripts.find((item) => item.id === video.scriptId && isEligibleScript(item))
      : null;
    if (video && script) {
      const viewingHistorical = Boolean(productionPlanId && script.contentPlanId && script.contentPlanId !== productionPlanId);
      return {
        scriptId: script.id,
        videoId: video.id,
        warning: null,
        viewingHistorical,
        productionPlanId,
      };
    }
    const fallback = defaultScriptAndVideo(prodScripts, input.videos);
    return {
      ...fallback,
      warning: "所选视频已不可用，已切换到当前生产计划。",
      viewingHistorical: false,
      productionPlanId,
    };
  }

  return {
    ...defaultScriptAndVideo(prodScripts, input.videos),
    warning: null,
    viewingHistorical: false,
    productionPlanId,
  };
}

function defaultScriptAndVideo(
  prodScripts: ScriptRecord[],
  videos: VideoRecord[],
): { scriptId: string; videoId: string | null } {
  if (prodScripts.length === 0) {
    return { scriptId: "", videoId: null };
  }
  const needing = prodScripts.find((script) => {
    const latest = latestVideoForScript(videos, script.id);
    return !latest || latest.status === "FAILED";
  });
  const script = needing ?? prodScripts[0]!;
  return {
    scriptId: script.id,
    videoId: latestVideoForScript(videos, script.id)?.id ?? null,
  };
}

export function videoBelongsToScript(video: VideoRecord | null | undefined, scriptId: string): boolean {
  return Boolean(video && video.scriptId === scriptId);
}
