import type { MetricFieldKey } from './publication-metrics.constants.js';

export type NormalizedPublicationMetrics = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  averageWatchTimeSeconds: number | null;
  completionRate: number | null;
  newFollowers: number | null;
};

export type RawPublicationMetrics = Partial<Record<MetricFieldKey, number | null | undefined>>;

/**
 * Internal ingestion contract. `undefined` is not representable after normalize:
 * omitted fields become `null`. Explicit `0` stays `0`.
 */
export type NormalizedPublicationMetricsInput = {
  publicationId: string;
  observedAt: Date;
  providerCollectedAt: Date | null;
  metrics: NormalizedPublicationMetrics;
  provider: string;
  providerMetadata: Record<string, unknown>;
  collectionKey: string;
};
