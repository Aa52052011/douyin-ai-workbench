import { Platform } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { MOCK_METRICS_READ_SCOPE } from './metrics-provider.types.js';
import { canReadPostMetrics } from './platform-capabilities.js';

describe('canReadPostMetrics', () => {
  it('does not treat Douyin user_info as metrics capability', () => {
    const result = canReadPostMetrics(Platform.DOUYIN, ['user_info']);
    expect(result.canReadPostMetrics).toBe(false);
    expect(result.reason).toBe('user_info_is_not_metrics');
  });

  it('accepts the test-only mock.metrics.read scope on MOCK only', () => {
    expect(canReadPostMetrics(Platform.MOCK, [MOCK_METRICS_READ_SCOPE]).canReadPostMetrics).toBe(true);
    expect(canReadPostMetrics(Platform.DOUYIN, [MOCK_METRICS_READ_SCOPE]).canReadPostMetrics).toBe(false);
  });
});
