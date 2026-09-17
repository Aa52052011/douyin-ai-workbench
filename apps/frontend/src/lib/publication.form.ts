import { formatVideoTime } from "./video.form";
import type { VideoRecord } from "./video.types";
import { PUBLICATION_TITLE_MAX, PUBLICATION_URL_MAX, PUBLICATION_WORK_ID_MAX, type PublicationCompleteForm, type PublicationRecord } from "./publication.types";

export function isEligiblePublishVideo(video: VideoRecord): boolean {
  return (
    video.status === "COMPLETED" &&
    Boolean(video.outputAsset?.contentPath || video.outputAsset?.id) &&
    video.finalAcceptance?.current === true &&
    (video.finalAcceptance.variant === "VERTICAL" || !video.finalAcceptance.variant)
  );
}

export function eligiblePublishVideos(items: VideoRecord[]): VideoRecord[] {
  return items.filter(isEligiblePublishVideo);
}

export function pendingManualPublishVideos(
  items: VideoRecord[],
  publications: { videoId?: string }[],
): VideoRecord[] {
  const tied = new Set(publications.map((item) => item.videoId).filter((id): id is string => Boolean(id)));
  return eligiblePublishVideos(items).filter((video) => !tied.has(video.id));
}

export function resolvePublishVideoQuery(
  videoId: string | null | undefined,
  videos: VideoRecord[],
): { videoId: string; warning: string | null } {
  if (!videoId) {
    if (videos.length === 1) {
      return { videoId: videos[0]!.id, warning: null };
    }
    return { videoId: "", warning: null };
  }
  const found = videos.find((item) => item.id === videoId);
  if (!found || !isEligiblePublishVideo(found)) {
    return { videoId: "", warning: "所选视频已不可发布，请重新选择。" };
  }
  return { videoId: found.id, warning: null };
}

export function createPublicationBody(title: string) {
  return {
    platform: "DOUYIN",
    mode: "MANUAL",
    title: title.trim().slice(0, PUBLICATION_TITLE_MAX),
    visibility: "PUBLIC",
  };
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function emptyCompleteForm(): PublicationCompleteForm {
  return { externalUrl: "", externalPostId: "" };
}

export function completePublicationBody(form: PublicationCompleteForm) {
  const body: { externalUrl?: string; externalPostId?: string } = {};
  const url = form.externalUrl.trim();
  const workId = form.externalPostId.trim();
  if (url) body.externalUrl = url.slice(0, PUBLICATION_URL_MAX);
  if (workId) body.externalPostId = workId.slice(0, PUBLICATION_WORK_ID_MAX);
  return body;
}

export function validateExternalUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "请填写有效的作品链接。";
    }
    if (parsed.username || parsed.password) {
      return "请填写有效的作品链接。";
    }
    return null;
  } catch {
    return "请填写有效的作品链接。";
  }
}

export function canSubmitComplete(form: PublicationCompleteForm): boolean {
  const url = form.externalUrl.trim();
  const workId = form.externalPostId.trim();
  if (!url && !workId) {
    return false;
  }
  if (url && validateExternalUrl(form.externalUrl)) {
    return false;
  }
  return true;
}

export function isPublicationSourceBound(record: { videoId?: string | null; productionArtifactId?: string | null }): boolean {
  return Boolean(record.videoId);
}

export function isRegistrationFormVisible(declaredPublished: boolean, hasSelectedVideo: boolean): boolean {
  return declaredPublished === true && hasSelectedVideo === true;
}

export function publicationCreatedOnDeclarePublished(): boolean {
  return false;
}

export function findDuplicatePublication(
  items: PublicationRecord[],
  videoId: string,
  form: PublicationCompleteForm,
): PublicationRecord | null {
  const url = form.externalUrl.trim();
  const workId = form.externalPostId.trim();
  return (
    items.find((item) => {
      if (item.videoId !== videoId) {
        return false;
      }
      if (url && item.externalUrl === url) {
        return true;
      }
      if (workId && item.externalPostId === workId) {
        return true;
      }
      return false;
    }) ?? null
  );
}

export function linkFormatCopy(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || validateExternalUrl(trimmed)) {
    return null;
  }
  return "链接格式已识别";
}

export function canManualComplete(record: PublicationRecord | null): boolean {
  return record?.status === "PENDING";
}

export function canOpenMetrics(status?: string): boolean {
  return status === "PUBLISHED";
}

export function canRetryPublication(): boolean {
  return false;
}

export function publicationsForVideo(items: PublicationRecord[], videoId: string): PublicationRecord[] {
  return [...items]
    .filter((item) => item.videoId === videoId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function latestPublicationForVideo(items: PublicationRecord[], videoId: string): PublicationRecord | null {
  return publicationsForVideo(items, videoId)[0] ?? null;
}

export function videoOptionLabel(video: VideoRecord): string {
  return [
    video.scriptTitle || "视频",
    typeof video.duration === "number" ? `${video.duration} 秒` : "",
    formatVideoTime(video.updatedAt || video.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function videosHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/content/videos`;
}

export function performanceHref(projectId: string, publicationId: string): string {
  return `/dashboard/projects/${projectId}/performance?publicationId=${encodeURIComponent(publicationId)}`;
}

export function defaultPublicationTitle(video: VideoRecord | null): string {
  return (video?.scriptTitle || "成片").slice(0, PUBLICATION_TITLE_MAX);
}

export function humanizePublicationError(error: unknown, action: "create" | "complete" = "create"): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  if (code === "VIDEO_CONFLICT" || code === "VIDEO_NOT_FOUND") {
    return "所选视频已不可发布，请重新选择。";
  }
  if (code === "MANUAL_PUBLICATION_ALREADY_COMPLETED") {
    return "这条作品已经登记过。";
  }
  if (code === "MANUAL_PUBLICATION_EXTERNAL_IDENTITY_REQUIRED" || code === "VALIDATION_ERROR") {
    return "无法登记作品，请检查填写内容后重试。";
  }
  if (code === "SHORT_LINK_RESOLUTION_REQUIRED") {
    return "这个短链接暂时无法自动识别，请填写作品 ID 或使用完整作品链接。";
  }
  if (code === "MANUAL_PUBLICATION_INVALID_STATE") {
    return "无法登记作品，请检查填写内容后重试。";
  }
  if (action === "complete") {
    return "无法登记作品，请检查填写内容后重试。";
  }
  return "发布记录创建失败，请稍后重试。";
}

export function mountWriteOperations(): string[] {
  return [];
}

export function metricsCreateOnPublish(): boolean {
  return false;
}

export function mockProviderVisible(): boolean {
  return false;
}

export function oauthVisible(): boolean {
  return false;
}
