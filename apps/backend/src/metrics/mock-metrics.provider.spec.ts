import { Platform } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { MockMetricsProvider } from './mock-metrics.provider.js';
import type { GetPostMetricsInput } from './metrics-provider.types.js';
import { normalizePostMetricsResult } from './normalize-post-metrics.js';

const INPUT: GetPostMetricsInput = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  publicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  videoId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  platform: Platform.MOCK,
  externalPostId: 'mock-post-1',
};

describe('MockMetricsProvider', () => {
  it('is deterministic and makes no network calls', async () => {
    const provider = new MockMetricsProvider();
    const a = await provider.getPostMetrics(INPUT);
    const b = await provider.getPostMetrics(INPUT);
    expect(a).toEqual(b);
    expect(a.views).toBeGreaterThan(0);
    expect(a.likes).toBeGreaterThanOrEqual(0);
    expect(a.completionRate).toBeGreaterThanOrEqual(0);
    expect(a.completionRate).toBeLessThanOrEqual(1);
    expect(a.averageWatchTimeSeconds).toBeGreaterThan(0);
    expect(a.observedAt).toBeInstanceOf(Date);
    expect(a.providerCollectedAt).toBeInstanceOf(Date);
    expect(a.metadata).toEqual({ apiVersion: 'mock-metrics-v1', mappingVersion: 'metrics-v1' });
    expect(JSON.stringify(a)).not.toMatch(/accessToken|refreshToken|credentialRef/i);
  });

  it('keeps PARTIAL metrics null instead of coercing to 0', async () => {
    const provider = new MockMetricsProvider();
    provider.configureScenario(INPUT.publicationId, 'PARTIAL');
    const result = await provider.getPostMetrics(INPUT);
    expect(result.views).toBe(1000);
    expect(result.likes).toBe(50);
    expect(result.comments).toBeNull();
    expect(result.shares).toBeNull();
    expect(result.favorites).toBeNull();
    expect(result.completionRate).toBeNull();
    expect(result.averageWatchTimeSeconds).toBeNull();
    expect(result.newFollowers).toBeNull();
  });

  it('preserves explicit zeros', async () => {
    const provider = new MockMetricsProvider();
    provider.configureScenario(INPUT.publicationId, 'ZERO');
    const result = await provider.getPostMetrics(INPUT);
    expect(result.views).toBe(0);
    expect(result.likes).toBe(0);
    expect(result.completionRate).toBe(0);
    expect(result.averageWatchTimeSeconds).toBe(0);
  });

  it('returns an invalid payload that the normalizer rejects', async () => {
    const provider = new MockMetricsProvider();
    provider.configureScenario(INPUT.publicationId, 'INVALID_RESPONSE');
    const raw = await provider.getPostMetrics(INPUT);
    expect(() => normalizePostMetricsResult(raw)).toThrow(AppError);
    try {
      normalizePostMetricsResult(raw);
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.METRICS_PROVIDER_INVALID_RESPONSE });
    }
  });

  it('throws temporary and permanent failures without inserting metrics', async () => {
    const provider = new MockMetricsProvider();
    provider.configureScenario(INPUT.publicationId, 'TEMPORARY_FAILURE');
    await expect(provider.getPostMetrics(INPUT)).rejects.toMatchObject({
      code: ErrorCode.METRICS_PROVIDER_TEMPORARY_FAILURE,
    });
    provider.configureScenario(INPUT.publicationId, 'PERMANENT_FAILURE');
    await expect(provider.getPostMetrics(INPUT)).rejects.toMatchObject({
      code: ErrorCode.METRICS_PROVIDER_PERMANENT_FAILURE,
    });
  });
});
