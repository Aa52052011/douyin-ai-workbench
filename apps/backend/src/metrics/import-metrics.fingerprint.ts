import type { NormalizedPublicationMetrics } from './ingestion.types.js';
import {
  comparableMetricNumber,
} from './publication-metrics.fingerprint.js';

export type ImportMetricsFingerprintInput = NormalizedPublicationMetrics & {
  publicationId: string;
  observedAt: Date;
  providerCollectedAt: Date | null;
  provider: string;
  providerMetadata: Record<string, unknown>;
};

export function importMetricsFingerprint(input: ImportMetricsFingerprintInput): string {
  return JSON.stringify({
    publicationId: input.publicationId,
    views: input.views,
    likes: input.likes,
    comments: input.comments,
    shares: input.shares,
    favorites: input.favorites,
    averageWatchTimeSeconds: comparableMetricNumber(input.averageWatchTimeSeconds),
    completionRate: comparableMetricNumber(input.completionRate),
    newFollowers: input.newFollowers,
    observedAt: input.observedAt.toISOString(),
    providerCollectedAt: input.providerCollectedAt ? input.providerCollectedAt.toISOString() : null,
    provider: input.provider,
    providerMetadata: input.providerMetadata,
  });
}

export type ImportMetricsStored = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  averageWatchTimeSeconds: unknown;
  completionRate: unknown;
  newFollowers: number | null;
  observedAt: Date;
  providerCollectedAt: Date | null;
  provider: string | null;
  providerMetadata: unknown;
};

export function fingerprintFromImportSnapshot(
  publicationId: string,
  existing: ImportMetricsStored,
): string {
  const metadata = existing.providerMetadata;
  return importMetricsFingerprint({
    publicationId,
    views: comparableMetricNumber(existing.views),
    likes: comparableMetricNumber(existing.likes),
    comments: comparableMetricNumber(existing.comments),
    shares: comparableMetricNumber(existing.shares),
    favorites: comparableMetricNumber(existing.favorites),
    averageWatchTimeSeconds: comparableMetricNumber(existing.averageWatchTimeSeconds),
    completionRate: comparableMetricNumber(existing.completionRate),
    newFollowers: comparableMetricNumber(existing.newFollowers),
    observedAt: existing.observedAt,
    providerCollectedAt: existing.providerCollectedAt,
    provider: existing.provider ?? '',
    providerMetadata:
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {},
  });
}

export function sameImportMetricsRequest(
  publicationId: string,
  existing: ImportMetricsStored,
  incoming: ImportMetricsFingerprintInput,
): boolean {
  return fingerprintFromImportSnapshot(publicationId, existing) === importMetricsFingerprint(incoming);
}
