import { Platform } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { emptyNormalizedMetrics, normalizePostMetricsResult } from './normalize-post-metrics.js';

describe('normalizePostMetricsResult', () => {
  it('preserves null for missing metrics and does not coerce undefined to 0', () => {
    const result = normalizePostMetricsResult({});
    expect(result).toMatchObject(emptyNormalizedMetrics());
    expect(result.views).toBeNull();
    expect(result.likes).toBeNull();
    expect(result.completionRate).toBeNull();
    expect(result.averageWatchTimeSeconds).toBeNull();
    expect(result.observedAt).toBeNull();
    expect(result.metadata).toEqual({});
  });

  it('preserves explicit zero as zero', () => {
    const result = normalizePostMetricsResult({
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      favorites: 0,
      averageWatchTimeSeconds: 0,
      completionRate: 0,
      newFollowers: 0,
    });
    expect(result.views).toBe(0);
    expect(result.likes).toBe(0);
    expect(result.averageWatchTimeSeconds).toBe(0);
    expect(result.completionRate).toBe(0);
    expect(result.newFollowers).toBe(0);
  });

  it('rejects negative counts', () => {
    expect(() => normalizePostMetricsResult({ views: -1 })).toThrow(AppError);
    try {
      normalizePostMetricsResult({ likes: -2 });
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.METRICS_PROVIDER_INVALID_RESPONSE });
    }
  });

  it('rejects completionRate above 1 or below 0', () => {
    expect(() => normalizePostMetricsResult({ completionRate: 1.01 })).toThrow(AppError);
    expect(() => normalizePostMetricsResult({ completionRate: -0.01 })).toThrow(AppError);
    expect(normalizePostMetricsResult({ completionRate: 1 }).completionRate).toBe(1);
    expect(normalizePostMetricsResult({ completionRate: 0.63 }).completionRate).toBe(0.63);
  });

  it('rejects negative watch time', () => {
    expect(() => normalizePostMetricsResult({ averageWatchTimeSeconds: -0.1 })).toThrow(AppError);
    expect(normalizePostMetricsResult({ averageWatchTimeSeconds: 8.25 }).averageWatchTimeSeconds).toBe(8.25);
  });
});
