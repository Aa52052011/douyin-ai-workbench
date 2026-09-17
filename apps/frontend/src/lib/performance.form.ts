import type { PublicationRecord } from "./publication.types";
import type { MetricFormState, MetricSnapshotRecord } from "./performance.types";

export function isEligiblePerformancePublication(item: PublicationRecord): boolean {
  return item.status === "PUBLISHED" && Boolean(item.publishedAt);
}

export function eligiblePerformancePublications(items: PublicationRecord[]): PublicationRecord[] {
  return items.filter(isEligiblePerformancePublication);
}

export function resolvePerformanceQuery(
  publicationId: string | null | undefined,
  items: PublicationRecord[],
): { publicationId: string; warning: string | null } {
  if (!publicationId) {
    return { publicationId: "", warning: null };
  }
  const found = items.find((item) => item.id === publicationId);
  if (!found || !isEligiblePerformancePublication(found)) {
    return { publicationId: "", warning: "所选作品暂不可录入表现数据，请重新选择。" };
  }
  return { publicationId: found.id, warning: null };
}

export function emptyMetricForm(observedAt = ""): MetricFormState {
  return {
    views: "",
    likes: "",
    comments: "",
    shares: "",
    favorites: "",
    completionRatePercent: "",
    averageWatchTimeSeconds: "",
    newFollowers: "",
    observedAt,
  };
}

export function percentInputToRate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }
  return Number((parsed / 100).toFixed(4));
}

export function optionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export function optionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export function createManualMetricsBody(form: MetricFormState) {
  const body: Record<string, number | string> = {};
  const views = optionalInt(form.views);
  const likes = optionalInt(form.likes);
  const comments = optionalInt(form.comments);
  const shares = optionalInt(form.shares);
  const favorites = optionalInt(form.favorites);
  const averageWatchTimeSeconds = optionalNumber(form.averageWatchTimeSeconds);
  const completionRate = percentInputToRate(form.completionRatePercent);
  const newFollowers = optionalInt(form.newFollowers);
  if (views != null) body.views = views;
  if (likes != null) body.likes = likes;
  if (comments != null) body.comments = comments;
  if (shares != null) body.shares = shares;
  if (favorites != null) body.favorites = favorites;
  if (averageWatchTimeSeconds != null) body.averageWatchTimeSeconds = averageWatchTimeSeconds;
  if (completionRate != null) body.completionRate = completionRate;
  if (newFollowers != null) body.newFollowers = newFollowers;
  if (form.observedAt.trim()) {
    const date = new Date(form.observedAt);
    if (!Number.isNaN(date.getTime())) {
      body.observedAt = date.toISOString();
    }
  }
  return body;
}

export function hasAtLeastOneMetric(form: MetricFormState): boolean {
  return Object.keys(createManualMetricsBody({ ...form, observedAt: "" })).length > 0;
}

function optionalFilledValid(value: string, parse: (value: string) => number | null): boolean {
  return !value.trim() || parse(value) != null;
}

export function canSubmitMetrics(form: MetricFormState): boolean {
  if (!hasAtLeastOneMetric(form)) {
    return false;
  }
  return (
    optionalFilledValid(form.views, optionalInt) &&
    optionalFilledValid(form.likes, optionalInt) &&
    optionalFilledValid(form.comments, optionalInt) &&
    optionalFilledValid(form.shares, optionalInt) &&
    optionalFilledValid(form.favorites, optionalInt) &&
    optionalFilledValid(form.newFollowers, optionalInt) &&
    optionalFilledValid(form.averageWatchTimeSeconds, optionalNumber) &&
    optionalFilledValid(form.completionRatePercent, percentInputToRate)
  );
}

export function sortSnapshotsNewestFirst(items: MetricSnapshotRecord[]): MetricSnapshotRecord[] {
  return [...items].sort((a, b) => +new Date(b.observedAt) - +new Date(a.observedAt) || +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0));
}

export function publishHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/publish`;
}

export function nextPlanHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/content/plans`;
}

export function publicationOptionLabel(item: PublicationRecord, hasData?: boolean): string {
  return [
    item.title || "已发布作品",
    item.publishedAt ? formatObservedAt(item.publishedAt) : "",
    hasData === true ? "已有数据" : hasData === false ? "暂无数据" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function formatObservedAt(value?: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function formatObservationDuration(startAt?: string | null, endAt?: string | null): string {
  if (!startAt || !endAt) {
    return "";
  }
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return "";
  }
  const totalMinutes = Math.round((end - start) / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes} 分钟`;
  }
  const days = Math.floor(totalMinutes / (24 * 60));
  const afterDays = totalMinutes % (24 * 60);
  const hours = Math.floor(afterDays / 60);
  const minutes = afterDays % 60;
  if (days > 0) {
    if (hours === 0 && minutes === 0) return `${days} 天`;
    if (minutes === 0) return `${days} 天 ${hours} 小时`;
    if (hours === 0) return `${days} 天 ${minutes} 分钟`;
    return `${days} 天 ${hours} 小时 ${minutes} 分钟`;
  }
  if (minutes === 0) {
    return `${hours} 小时`;
  }
  return `${hours} 小时 ${minutes} 分钟`;
}

export function hoursSince(startAt?: string | null, endAt?: string | null): string {
  return formatObservationDuration(startAt, endAt);
}

export function humanizeMetricsError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  if (code === "PUBLICATION_METRICS_NOT_AVAILABLE" || code === "PUBLICATION_NOT_FOUND") {
    return "所选作品暂不可录入表现数据，请重新选择。";
  }
  return "表现数据保存失败，请检查填写内容后重试。";
}

export function mountWriteOperations(): string[] {
  return [];
}

export function autoSyncEnabled(): boolean {
  return false;
}

export function autoStrategyEnabled(): boolean {
  return false;
}

export function pretendsFullFeedback(): boolean {
  return false;
}
