import { formatVideoTime } from "./video.form";
import {
  VIDEO_PIPELINE_STAGES,
  VIDEO_RAW_CONTRACT_TERMS,
  type VideoHistoryItemView,
  type VideoJobRecord,
  type VideoPipelineStage,
  type VideoRecord,
  type VideoStageView,
  type VideoView,
} from "./video.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseVideoRecord(value: unknown): VideoRecord | null {
  if (!isRecord(value) || typeof value.id !== "string" || !asText(value.id) || !asText(value.status) || !asText(value.createdAt)) {
    return null;
  }
  return {
    id: value.id,
    projectId: asText(value.projectId) || undefined,
    scriptId: typeof value.scriptId === "string" ? value.scriptId : null,
    scriptTitle: typeof value.scriptTitle === "string" ? value.scriptTitle : null,
    duration: typeof value.duration === "number" ? value.duration : null,
    width: typeof value.width === "number" ? value.width : null,
    height: typeof value.height === "number" ? value.height : null,
    status: String(value.status),
    createdAt: String(value.createdAt),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
    job: parseJobRecord(value.job),
    outputAsset: parseAssetRecord(value.outputAsset),
  };
}

function parseJobRecord(value: unknown): VideoJobRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    status: asText(value.status) || undefined,
    progress: typeof value.progress === "number" ? value.progress : undefined,
    output: value.output,
    error: value.error,
    startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
    completedAt: typeof value.completedAt === "string" ? value.completedAt : null,
  };
}

function parseAssetRecord(value: unknown): VideoRecord["outputAsset"] {
  if (!isRecord(value) || !asText(value.contentPath)) {
    return null;
  }
  return {
    id: asText(value.id) || undefined,
    type: asText(value.type) || undefined,
    status: asText(value.status) || undefined,
    mimeType: typeof value.mimeType === "string" ? value.mimeType : null,
    duration: typeof value.duration === "number" ? value.duration : null,
    width: typeof value.width === "number" ? value.width : null,
    height: typeof value.height === "number" ? value.height : null,
    contentPath: asText(value.contentPath),
  };
}

export function videoStatusLabel(status?: string): string {
  switch (status) {
    case "PENDING":
      return "等待制作";
    case "PROCESSING":
      return "制作中";
    case "COMPLETED":
      return "已完成";
    case "FAILED":
      return "制作失败";
    case "CANCELLED":
      return "已取消";
    default:
      return "";
  }
}

export function videoDisplayStatus(video: VideoRecord): string {
  if (video.status === "COMPLETED" || video.status === "FAILED") {
    return video.status;
  }
  if (video.job?.status === "CANCELLED") {
    return "CANCELLED";
  }
  if (video.status === "PROCESSING" || video.job?.status === "RUNNING") {
    return "PROCESSING";
  }
  return video.status || "PENDING";
}

export function humanizeVideoStage(stage?: string | null): string {
  switch (stage) {
    case "visual":
      return "正在生成画面";
    case "voice":
      return "正在生成配音";
    case "subtitle":
      return "正在生成字幕";
    case "compose":
      return "正在合成视频";
    case "finalize":
      return "正在完成成片";
    default:
      return stage ? "" : "正在准备视频";
  }
}

export function humanizeCompletedStage(stage: VideoPipelineStage): string {
  switch (stage) {
    case "visual":
      return "已生成画面";
    case "voice":
      return "已生成配音";
    case "subtitle":
      return "已生成字幕";
    case "compose":
      return "已合成视频";
    case "finalize":
      return "已完成成片";
  }
}

export function parseJobStages(output: unknown): {
  currentStage?: string;
  completed: VideoPipelineStage[];
  failed?: string;
} {
  if (!isRecord(output)) {
    return { completed: [] };
  }
  const currentStage = asText(output.currentStage) || undefined;
  const stages = isRecord(output.stages) ? output.stages : {};
  const completed = VIDEO_PIPELINE_STAGES.filter((key) => {
    if (key === "finalize") {
      return currentStage === "finalize" && isRecord(stages.compose) && stages.compose.status === "completed";
    }
    const item = stages[key];
    return isRecord(item) && item.status === "completed";
  });
  const failed = VIDEO_PIPELINE_STAGES.find((key) => {
    const item = stages[key];
    return isRecord(item) && item.status === "failed";
  });
  return { currentStage, completed, failed };
}

export function videoStageViews(video: VideoRecord): VideoStageView[] {
  const parsed = parseJobStages(video.job?.output);
  const current = parsed.currentStage;
  return VIDEO_PIPELINE_STAGES.map((key) => {
    let state: VideoStageView["state"] = "pending";
    if (parsed.failed === key || (video.status === "FAILED" && current === key)) {
      state = "failed";
    } else if (parsed.completed.includes(key) || video.status === "COMPLETED") {
      state = "done";
    } else if (current === key) {
      state = "current";
    }
    return {
      key,
      label: state === "done" ? humanizeCompletedStage(key) : humanizeVideoStage(key),
      state,
    };
  });
}

export function backendProgressPercent(job?: VideoJobRecord | null): number | null {
  return typeof job?.progress === "number" ? job.progress : null;
}

export function failureMessage(error: unknown): string {
  if (!isRecord(error)) {
    return "";
  }
  const code = asText(error.code);
  if (code === "VIDEO_PROVIDER_FAILED" || code === "VIDEO_PLAN_INVALID" || code === "JOB_ENQUEUE_FAILED") {
    return "视频生成失败";
  }
  const message = asText(error.message);
  if (!message) {
    return "";
  }
  if (/stack|ffmpeg|api key|authorization|storageKey|stderr/i.test(message)) {
    return "视频生成失败";
  }
  return message.length > 80 ? "视频生成失败" : message;
}

export function videoView(video: VideoRecord): VideoView {
  const display = videoDisplayStatus(video);
  const stages = videoStageViews(video);
  const parsed = parseJobStages(video.job?.output);
  const current = parsed.currentStage;
  return {
    title: video.scriptTitle || "视频",
    statusLabel: videoStatusLabel(display),
    durationLabel: typeof video.duration === "number" ? `${video.duration} 秒` : "",
    createdAtLabel: formatVideoTime(video.createdAt),
    sourceScriptTitle: video.scriptTitle || "来源脚本",
    currentStageLabel:
      display === "COMPLETED"
        ? "视频已完成"
        : display === "FAILED"
          ? "视频生成失败"
          : humanizeVideoStage(current) || "正在准备视频",
    stages,
    progressPercent: backendProgressPercent(video.job),
    startedAtLabel: formatVideoTime(video.job?.startedAt),
    completedAtLabel: formatVideoTime(video.job?.completedAt),
    failedStageLabel: display === "FAILED" ? humanizeVideoStage(parsed.failed || current) : "",
    failureMessage: display === "FAILED" ? failureMessage(video.job?.error) || "视频生成失败" : "",
  };
}

export function parsedVideoView(video: VideoRecord): VideoView | null {
  return parseVideoRecord(video) ? videoView(video) : null;
}

export function videoHistoryViews(items: VideoRecord[]): VideoHistoryItemView[] {
  return [...items]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((item) => {
      const parsed = parseVideoRecord(item);
      return {
        title: item.scriptTitle || "视频",
        createdAtLabel: formatVideoTime(item.createdAt),
        statusLabel: videoStatusLabel(parsed ? videoDisplayStatus(parsed) : item.status),
        durationLabel: typeof item.duration === "number" ? `${item.duration} 秒` : "",
        readable: Boolean(parsed),
      };
    });
}

export function viewModelHasRawContract(view: object): boolean {
  return VIDEO_RAW_CONTRACT_TERMS.some((term) => JSON.stringify(view).includes(term));
}

export function viewModelHasStorageKey(view: object): boolean {
  return JSON.stringify(view).includes("storageKey");
}
