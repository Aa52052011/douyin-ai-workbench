import { Platform } from '@prisma/client';
import { MOCK_METRICS_READ_SCOPE } from './metrics-provider.types.js';

export type PostMetricsCapability = {
  canReadPostMetrics: boolean;
  reason: string;
};

/**
 * Maps PlatformAccount.scopes to post-metrics capability.
 * Official Douyin metrics scope is NOT pinned in Step 9.2.
 * `user_info` never grants metrics. `mock.metrics.read` is test-only.
 */
export function canReadPostMetrics(platform: Platform, scopes: readonly string[]): PostMetricsCapability {
  const set = new Set(scopes);
  if (platform === Platform.MOCK && set.has(MOCK_METRICS_READ_SCOPE)) {
    return { canReadPostMetrics: true, reason: 'mock.metrics.read' };
  }
  if (set.has('user_info')) {
    return { canReadPostMetrics: false, reason: 'user_info_is_not_metrics' };
  }
  return { canReadPostMetrics: false, reason: 'metrics_scope_unconfirmed' };
}

export function resolvePlatformCapabilities(platform: Platform, scopes: readonly string[]): PostMetricsCapability {
  return canReadPostMetrics(platform, scopes);
}
