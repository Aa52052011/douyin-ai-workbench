import { Platform } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { MockPublishingProvider } from '../publishing/providers/mock-publishing.provider.js';
import { PublishingProviderRegistry } from '../publishing/providers/publishing-provider.registry.js';
import type { DouyinOAuthClient } from '../publishing/oauth/douyin-oauth.types.js';
import { RealDouyinOAuthClient } from '../publishing/oauth/real-douyin-oauth.client.js';
import { MockMetricsProvider } from './mock-metrics.provider.js';
import { PlatformMetricsProviderRegistry } from './metrics-provider.registry.js';
import type { GetPostMetricsInput } from './metrics-provider.types.js';

describe('PlatformMetricsProviderRegistry', () => {
  const registry = new PlatformMetricsProviderRegistry(new MockMetricsProvider());

  it('resolves MOCK to MockMetricsProvider', () => {
    expect(registry.resolve(Platform.MOCK)).toBeInstanceOf(MockMetricsProvider);
    expect(registry.resolve(Platform.MOCK).platform).toBe(Platform.MOCK);
  });

  it.each([Platform.DOUYIN, Platform.TIKTOK, Platform.YOUTUBE, Platform.XIAOHONGSHU, Platform.BILIBILI, Platform.CHANNELS])(
    'fail-closes %s metrics provider',
    (platform) => {
      expect(() => registry.resolve(platform)).toThrow(AppError);
      try {
        registry.resolve(platform);
      } catch (error) {
        expect(error).toMatchObject({ code: ErrorCode.PLATFORM_METRICS_PROVIDER_NOT_IMPLEMENTED });
      }
    },
  );
});

describe('adjacent contracts remain unchanged', () => {
  it('does not change PublishingProviderRegistry MOCK or Douyin fail-closed behavior', () => {
    const publishing = new PublishingProviderRegistry(new MockPublishingProvider());
    expect(publishing.resolve(Platform.MOCK).platform).toBe(Platform.MOCK);
    expect(() => publishing.resolve(Platform.DOUYIN)).toThrow(AppError);
    try {
      publishing.resolve(Platform.DOUYIN);
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.PUBLISHING_PROVIDER_NOT_IMPLEMENTED });
    }
  });

  it('does not add metrics methods to DouyinOAuthClient', () => {
    const client: DouyinOAuthClient = new RealDouyinOAuthClient();
    expect(typeof client.exchangeCode).toBe('function');
    expect(typeof client.refreshToken).toBe('function');
    expect(typeof client.getUserInfo).toBe('function');
    expect(client).not.toHaveProperty('getPostMetrics');
  });

  it('does not accept plaintext tokens on GetPostMetricsInput samples', () => {
    const input: GetPostMetricsInput = {
      tenantId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      publicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      videoId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      platform: Platform.DOUYIN,
      externalPostId: 'ext-1',
      credentialRef: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    };
    const text = JSON.stringify(input);
    expect(text).not.toContain('accessToken');
    expect(text).not.toContain('refreshToken');
    expect(text).not.toContain('Authorization');
    expect(text).not.toContain('clientSecret');
  });
});
