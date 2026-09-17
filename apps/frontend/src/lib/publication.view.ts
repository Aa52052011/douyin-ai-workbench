import { formatVideoTime } from "./video.form";
import type { VideoRecord } from "./video.types";
import {
  PUBLICATION_RAW_CONTRACT_TERMS,
  type PublicationHistoryItemView,
  type PublicationRecord,
  type PublicationView,
} from "./publication.types";
import { looksLikeTechnicalId } from "./ux/publication-monitoring-v5";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parsePublicationRecord(value: unknown): PublicationRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = asText(value.id);
  const status = asText(value.status);
  const createdAt = asText(value.createdAt);
  if (!id || !status || !createdAt) {
    return null;
  }
  return {
    id,
    videoId: typeof value.videoId === "string" ? value.videoId : undefined,
    projectId: typeof value.projectId === "string" ? value.projectId : undefined,
    title: typeof value.title === "string" ? value.title : undefined,
    status,
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
    registeredAt: typeof value.registeredAt === "string" ? value.registeredAt : null,
    productionArtifactId: typeof value.productionArtifactId === "string" ? value.productionArtifactId : null,
    sourceVideoTitle: typeof value.sourceVideoTitle === "string" ? value.sourceVideoTitle : null,
    verificationStatus: typeof value.verificationStatus === "string" ? value.verificationStatus : null,
    externalPostId: typeof value.externalPostId === "string" ? value.externalPostId : null,
    externalUrl: typeof value.externalUrl === "string" ? value.externalUrl : null,
    errorMessage: typeof value.errorMessage === "string" ? value.errorMessage : null,
    createdAt,
  };
}

export function publicationStatusLabel(status?: string): string {
  switch (status) {
    case "PENDING":
      return "待发布";
    case "UPLOADING":
    case "SUBMITTING":
    case "PROCESSING":
      return "发布中";
    case "PUBLISHED":
      return "已发布";
    case "FAILED":
      return "发布失败";
    case "UNKNOWN_EXTERNAL_STATE":
      return "发布状态待确认";
    case "CANCELLED":
      return "已取消";
    default:
      return "";
  }
}

export function formatPublishedAt(value?: string | null): string {
  return formatVideoTime(value);
}

export function safeFailureMessage(message?: string | null): string {
  if (!message) {
    return "";
  }
  if (/oauth|token|secret|provider|stack|authorization/i.test(message)) {
    return "发布失败";
  }
  return message.length > 80 ? "发布失败" : message;
}

export function publicationView(record: PublicationRecord, video?: VideoRecord | null): PublicationView {
  return {
    title: record.title || "发布记录",
    statusLabel: publicationStatusLabel(record.status),
    sourceVideoTitle: video?.scriptTitle || "来源视频",
    publishedAtLabel: formatPublishedAt(record.publishedAt),
    createdAtLabel: formatVideoTime(record.createdAt),
    externalUrl: record.externalUrl || "",
    externalPostId: record.externalPostId || "",
    failureMessage: record.status === "FAILED" ? safeFailureMessage(record.errorMessage) || "发布失败" : "",
  };
}

export function meaningfulLinkedVideoTitle(record: PublicationRecord, video?: VideoRecord | null): string | null {
  const values = [video?.scriptTitle, record.sourceVideoTitle]
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  const title = values.find(
    (item) => item !== "来源视频" && item !== "关联成片" && !looksLikeTechnicalId(item),
  );
  return title || null;
}

export function parsedPublicationView(record: PublicationRecord, video?: VideoRecord | null): PublicationView | null {
  return parsePublicationRecord(record) ? publicationView(record, video) : null;
}

export function publicationHistoryViews(
  items: PublicationRecord[],
  videos: VideoRecord[],
): PublicationHistoryItemView[] {
  return [...items]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((item) => {
      const parsed = parsePublicationRecord(item);
      const video = videos.find((row) => row.id === item.videoId);
      return {
        title: item.title || "发布记录",
        sourceVideoTitle: video?.scriptTitle || "来源视频",
        statusLabel: publicationStatusLabel(parsed?.status || item.status),
        publishedAtLabel: formatPublishedAt(item.publishedAt),
        externalUrl: item.externalUrl || "",
        createdAtLabel: formatVideoTime(item.createdAt),
        readable: Boolean(parsed),
      };
    });
}

export function viewModelHasRawContract(view: object): boolean {
  return PUBLICATION_RAW_CONTRACT_TERMS.some((term) => JSON.stringify(view).includes(term));
}

export function viewModelHasSecret(view: object): boolean {
  return /platformSecret|accessToken|refreshToken|OAuth/i.test(JSON.stringify(view));
}
