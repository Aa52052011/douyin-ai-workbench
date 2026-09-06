import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import {
  emptyNormalizedPublicationMetrics,
  normalizePublicationMetrics,
  requireAtLeastOneNormalizedMetric,
} from './normalize-ingestion-metrics.js';

describe('normalizePublicationMetrics', () => {
  it('turns omitted and undefined fields into null, not 0', () => {
    const result = normalizePublicationMetrics({});
    expect(result).toEqual(emptyNormalizedPublicationMetrics());
    expect(result.views).toBeNull();
    expect(normalizePublicationMetrics({ views: undefined }).views).toBeNull();
  });

  it('preserves explicit zero', () => {
    const result = normalizePublicationMetrics({
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
    expect(result.completionRate).toBe(0);
    expect(result.averageWatchTimeSeconds).toBe(0);
  });

  it('rejects negative counts and watch time', () => {
    expect(() => normalizePublicationMetrics({ views: -1 })).toThrow(AppError);
    try {
      normalizePublicationMetrics({ likes: -2 });
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    }
    expect(() => normalizePublicationMetrics({ averageWatchTimeSeconds: -0.01 })).toThrow(AppError);
  });

  it('rejects completionRate outside 0–1', () => {
    expect(() => normalizePublicationMetrics({ completionRate: 1.01 })).toThrow(AppError);
    expect(() => normalizePublicationMetrics({ completionRate: -0.01 })).toThrow(AppError);
    expect(() => normalizePublicationMetrics({ completionRate: 63 })).toThrow(AppError);
    expect(normalizePublicationMetrics({ completionRate: 0.63 }).completionRate).toBe(0.63);
    expect(normalizePublicationMetrics({ completionRate: 1 }).completionRate).toBe(1);
  });

  it('requires at least one non-null metric', () => {
    expect(() => requireAtLeastOneNormalizedMetric(emptyNormalizedPublicationMetrics())).toThrow(AppError);
    expect(requireAtLeastOneNormalizedMetric(normalizePublicationMetrics({ views: 0 })).views).toBe(0);
  });
});
