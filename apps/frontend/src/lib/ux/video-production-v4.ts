import type { AITaskStateV1 } from "./ai-task";

export function videoAiTaskState(status?: string): AITaskStateV1 | null {
  if (status === "PENDING") return "QUEUED";
  if (status === "PROCESSING" || status === "RUNNING") return "RUNNING";
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "FAILED") return "FAILED";
  return null;
}

export function videoLeaveCopy(status?: string): string | null {
  if (status === "PENDING" || status === "PROCESSING" || status === "RUNNING") {
    return "你可以离开此页面，任务会继续运行。回来后打开「视频」即可继续查看。";
  }
  return null;
}

export function isPortraitVideo(width?: number | null, height?: number | null): boolean {
  if (!width || !height) return true;
  return height >= width;
}
