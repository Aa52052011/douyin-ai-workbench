import { parseScriptPayload, parseTopicSnapshot } from "./script.view";
import type { ScriptRecord } from "./script.types";
import type { VideoRecord } from "./video.types";

export function isEligibleScript(script: ScriptRecord): boolean {
  return script.status === "CONFIRMED" && parseScriptPayload(script.payload) !== null;
}

export function eligibleScripts(items: ScriptRecord[]): ScriptRecord[] {
  return items.filter(isEligibleScript);
}

export function resolveVideoScriptQuery(
  scriptId: string | null | undefined,
  scripts: ScriptRecord[],
): { scriptId: string; warning: string | null } {
  if (!scriptId) {
    return { scriptId: "", warning: null };
  }
  const found = scripts.find((item) => item.id === scriptId);
  if (!found || !isEligibleScript(found)) {
    return { scriptId: "", warning: "所选脚本已不可用，请重新选择。" };
  }
  return { scriptId: found.id, warning: null };
}

export function createVideoBody(scriptId: string) {
  return { scriptId };
}

export function videosForScript(items: VideoRecord[], scriptId: string): VideoRecord[] {
  return [...items]
    .filter((item) => item.scriptId === scriptId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function latestVideoForScript(items: VideoRecord[], scriptId: string): VideoRecord | null {
  return videosForScript(items, scriptId)[0] ?? null;
}

export function canRetryVideo(status?: string): boolean {
  return status === "FAILED";
}

export function canExportVideo(status?: string): boolean {
  return status === "COMPLETED";
}

export function canPreviewVideo(video: VideoRecord | null): boolean {
  return Boolean(video && video.status === "COMPLETED" && video.outputAsset?.contentPath);
}

export function canPublishVideo(status?: string): boolean {
  return status === "COMPLETED";
}

export function scriptsHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/content/scripts`;
}

export function publishHref(projectId: string, videoId: string): string {
  return `/dashboard/projects/${projectId}/publish?videoId=${encodeURIComponent(videoId)}`;
}

export function scriptOptionLabel(script: ScriptRecord): string {
  const parsed = parseScriptPayload(script.payload);
  const topic = parseTopicSnapshot(script.topicSnapshot);
  return [
    `版本 ${script.version}`,
    parsed?.title || script.title || "脚本",
    topic?.title ? `选题 ${topic.title}` : "",
    parsed ? `${parsed.totalDuration} 秒` : "",
    formatVideoTime(script.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function formatVideoTime(value?: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function humanizeVideoError(
  error: unknown,
  action: "create" | "retry" | "export" | "poll" | "accept" = "create",
): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  if (code === "VIDEO_SCRIPT_NOT_CONFIRMED" || code === "SCRIPT_NOT_FOUND") {
    return "所选脚本已不可用，请重新选择。";
  }
  if (code === "VIDEO_CONFLICT") {
    return "当前视频状态不能重试。";
  }
  if (code === "VIDEO_EXPORT_NOT_AVAILABLE") {
    return "视频下载失败，请重试。";
  }
  if (code === "VIDEO_FINAL_ACCEPTANCE_NOT_AVAILABLE") {
    return "确认失败，请重试";
  }
  if (action === "retry") return "视频重试失败，请稍后重试。";
  if (action === "export") return "视频下载失败，请重试。";
  if (action === "accept") return "确认失败，请重试";
  if (action === "poll") return "暂时无法获取视频进度，请稍后刷新。";
  return "视频生成任务创建失败，请稍后重试。";
}

export function mountWriteOperations(): string[] {
  return [];
}

export function publicationCreateOnComplete(): boolean {
  return false;
}
