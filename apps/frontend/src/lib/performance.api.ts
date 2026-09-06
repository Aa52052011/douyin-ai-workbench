import { api } from "./api";
import { newIdempotencyKey } from "./publication.form";
import { createManualMetricsBody } from "./performance.form";
import type { MetricFormState, MetricSnapshotRecord, PerformanceInsightResult, PerformanceSummaryRecord } from "./performance.types";

export function listPublicationMetrics(accessToken: string, publicationId: string) {
  return api<{ items: MetricSnapshotRecord[]; limit: number }>(`/publications/${publicationId}/metrics`, { accessToken });
}

export function getLatestMetrics(accessToken: string, publicationId: string) {
  return api<{ snapshot: MetricSnapshotRecord | null }>(`/publications/${publicationId}/metrics/latest`, { accessToken });
}

export function getMetricsSummary(accessToken: string, publicationId: string) {
  return api<PerformanceSummaryRecord>(`/publications/${publicationId}/metrics/summary`, { accessToken });
}

export function getMetricsInsights(accessToken: string, publicationId: string) {
  return api<PerformanceInsightResult>(`/publications/${publicationId}/metrics/insights`, { accessToken });
}

export function createManualMetrics(accessToken: string, publicationId: string, form: MetricFormState) {
  return api<MetricSnapshotRecord>(`/publications/${publicationId}/metrics/manual`, {
    method: "POST",
    accessToken,
    headers: { "x-idempotency-key": newIdempotencyKey() },
    body: JSON.stringify(createManualMetricsBody(form)),
  });
}
