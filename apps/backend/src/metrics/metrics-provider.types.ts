import type { Platform } from '@prisma/client';

export type MetricsPlatformAccountRef = {
  id: string;
  platform: Platform;
  status: string;
  externalAccountId?: string;
};

/**
 * API metrics input. `externalPostId` is required; there is no urlToMetrics().
 * Tokens stay in SecretStore. `credentialRef` is a UUID pointer only.
 */
export type GetPostMetricsInput = {
  tenantId: string;
  workspaceId: string;
  projectId: string;
  publicationId: string;
  videoId: string;
  platform: Platform;
  externalPostId: string;
  platformAccount?: MetricsPlatformAccountRef;
  credentialRef?: string;
};

export type NormalizedPostMetrics = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  averageWatchTimeSeconds: number | null;
  completionRate: number | null;
  newFollowers: number | null;
};

export type PostMetricsResult = NormalizedPostMetrics & {
  observedAt: Date | null;
  providerCollectedAt: Date | null;
  providerRequestId: string | null;
  providerSnapshotId: string | null;
  metadata: Record<string, unknown>;
};

export interface PlatformMetricsProvider {
  readonly platform: Platform;
  getPostMetrics(input: GetPostMetricsInput): Promise<PostMetricsResult>;
}

export interface PlatformMetricsProviderRegistry {
  resolve(platform: Platform): PlatformMetricsProvider;
}

export const METRICS_PROVIDER_REGISTRY = Symbol('METRICS_PROVIDER_REGISTRY');

export const MOCK_METRICS_READ_SCOPE = 'mock.metrics.read';
