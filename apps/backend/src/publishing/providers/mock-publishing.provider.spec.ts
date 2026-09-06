import { Platform } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { LocalStorageProvider } from '../../media/storage/local-storage.provider.js';
import { StorageService } from '../../media/storage/storage.service.js';
import { MockPublishingProvider } from './mock-publishing.provider.js';
import { PublishingProviderRegistry } from './publishing-provider.registry.js';
import type { PlatformAccountRef, PublishVideoInput } from './publishing-provider.types.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const PUBLICATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VIDEO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ASSET = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ACCOUNT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const STORAGE_KEY = `v1/${TENANT}/${WORKSPACE}/${PROJECT}/${ASSET}/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`;

function mockAccount(overrides?: Partial<PlatformAccountRef>): PlatformAccountRef {
  return {
    id: ACCOUNT,
    platform: Platform.MOCK,
    status: 'ACTIVE',
    credentialRef: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    externalAccountId: 'mock-user-1',
    displayName: 'Mock Account',
    ...overrides,
  };
}

function publishInput(overrides?: Partial<PublishVideoInput>): PublishVideoInput {
  return {
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    projectId: PROJECT,
    publicationId: PUBLICATION,
    videoId: VIDEO,
    platformAccount: mockAccount(),
    outputAsset: { assetId: ASSET, storageKey: STORAGE_KEY, mimeType: 'video/mp4', size: 12 },
    title: 'Mock title',
    description: 'desc',
    hashtags: ['demo'],
    visibility: 'PUBLIC',
    idempotencyKey: 'idem-1',
    ...overrides,
  };
}

function secretKeys(value: unknown): string[] {
  const text = JSON.stringify(value);
  return ['accessToken', 'refreshToken', 'clientSecret', 'Authorization', 'cookie', 'Set-Cookie'].filter((key) =>
    text.includes(`"${key}"`),
  );
}

describe('PublishingProviderRegistry', () => {
  const provider = new MockPublishingProvider();
  const registry = new PublishingProviderRegistry(provider);

  it('resolves MOCK', () => {
    expect(registry.resolve(Platform.MOCK)).toBe(provider);
    expect(registry.resolve(Platform.MOCK).platform).toBe(Platform.MOCK);
  });

  it.each([Platform.DOUYIN, Platform.TIKTOK, Platform.YOUTUBE, Platform.XIAOHONGSHU, Platform.BILIBILI, Platform.CHANNELS])(
    'fail-closes %s without falling back to MOCK',
    (platform) => {
      expect(() => registry.resolve(platform)).toThrow(AppError);
      try {
        registry.resolve(platform);
      } catch (error) {
        expect(error).toMatchObject({ code: ErrorCode.PUBLISHING_PROVIDER_NOT_IMPLEMENTED });
      }
    },
  );
});

describe('MockPublishingProvider', () => {
  it('honors test-only configureScenario', async () => {
    const provider = new MockPublishingProvider();
    provider.configureScenario(PUBLICATION, 'VALIDATION_FAILURE');
    const result = await provider.publishVideo(publishInput());
    expect(result).toMatchObject({ outcome: 'REJECTED', retryClass: 'PERMANENT' });
  });

  it('validates a healthy mock account', async () => {
    const provider = new MockPublishingProvider();
    await expect(
      provider.validateAccount({
        tenantId: TENANT,
        workspaceId: WORKSPACE,
        account: mockAccount(),
        expectedPlatform: Platform.MOCK,
      }),
    ).resolves.toEqual({ healthy: true, platform: Platform.MOCK, accountId: ACCOUNT });
  });

  it('rejects Douyin accounts on the mock provider', async () => {
    const provider = new MockPublishingProvider();
    const account = mockAccount({ platform: Platform.DOUYIN });
    await expect(
      provider.validateAccount({
        tenantId: TENANT,
        workspaceId: WORKSPACE,
        account,
        expectedPlatform: Platform.DOUYIN,
      }),
    ).resolves.toMatchObject({ healthy: false, reason: 'PLATFORM_MISMATCH' });
    const published = await provider.publishVideo(publishInput({ platformAccount: account }));
    expect(published.outcome).toBe('REJECTED');
    if (published.outcome === 'REJECTED') {
      expect(published.retryClass).toBe('PERMANENT');
      expect(published.errorCode).toBe('PUBLISH_PLATFORM_MISMATCH');
    }
  });

  it('returns deterministic SUCCESS ids', async () => {
    const provider = new MockPublishingProvider();
    const first = await provider.publishVideo(publishInput());
    const second = await provider.publishVideo(publishInput({ idempotencyKey: 'idem-1' }));
    expect(first).toMatchObject({
      outcome: 'ACCEPTED',
      platformStatus: 'PUBLISHED',
      providerUploadId: `mock-upload-${PUBLICATION}`,
      providerItemId: `mock-item-${PUBLICATION}`,
      externalPostId: `mock-post-${PUBLICATION}`,
      externalUrl: `mock://publication/${PUBLICATION}`,
      requestId: `mock-req-${PUBLICATION}`,
    });
    expect(second).toEqual(first);
  });

  it('skips upload when providerUploadId already exists', async () => {
    const provider = new MockPublishingProvider();
    const first = await provider.publishVideo(publishInput());
    expect(provider.getUploadAttempts(PUBLICATION)).toBe(1);
    expect(first.outcome).toBe('ACCEPTED');
    const uploadId = first.outcome === 'ACCEPTED' ? first.providerUploadId : '';
    await provider.publishVideo(publishInput({ providerUploadId: uploadId }));
    expect(provider.getUploadAttempts(PUBLICATION)).toBe(1);
  });

  it('returns PERMANENT validation failure without an external post id', async () => {
    const provider = new MockPublishingProvider();
    const result = await provider.publishVideo(publishInput({ scenario: 'VALIDATION_FAILURE' }));
    expect(result).toMatchObject({ outcome: 'REJECTED', retryClass: 'PERMANENT', errorCode: 'PUBLISH_VALIDATION_FAILED' });
    expect(result).not.toHaveProperty('externalPostId');
    expect(provider.getUploadAttempts(PUBLICATION)).toBe(0);
  });

  it('rejects invalid visibility as a permanent validation failure', async () => {
    const provider = new MockPublishingProvider();
    const result = await provider.publishVideo(publishInput({ visibility: 'WORLD' }));
    expect(result).toMatchObject({ outcome: 'REJECTED', retryClass: 'PERMANENT' });
  });

  it('returns SAFE_TO_RETRY for upload failure before submit', async () => {
    const provider = new MockPublishingProvider();
    const result = await provider.publishVideo(publishInput({ scenario: 'UPLOAD_FAILURE' }));
    expect(result).toMatchObject({
      outcome: 'REJECTED',
      retryClass: 'SAFE_TO_RETRY',
      errorCode: 'PUBLISH_UPLOAD_FAILED',
    });
    expect(result).not.toHaveProperty('providerUploadId');
    expect(result).not.toHaveProperty('externalPostId');
  });

  it('returns UNKNOWN after submit without a fake externalPostId', async () => {
    const provider = new MockPublishingProvider();
    const result = await provider.publishVideo(publishInput({ scenario: 'UNKNOWN_AFTER_SUBMIT' }));
    expect(result.outcome).toBe('UNKNOWN');
    if (result.outcome === 'UNKNOWN') {
      expect(result.retryClass).toBe('UNKNOWN_EXTERNAL_STATE');
      expect(result.providerUploadId).toBe(`mock-upload-${PUBLICATION}`);
      expect(result.requestId).toBe(`mock-unk-${PUBLICATION}`);
      expect(result).not.toHaveProperty('externalPostId');
      expect(JSON.stringify(result)).not.toContain('mock-post-');
    }
  });

  it('does not invent an external post when re-submitting UNKNOWN_AFTER_SUBMIT', async () => {
    const provider = new MockPublishingProvider();
    const first = await provider.publishVideo(publishInput({ scenario: 'UNKNOWN_AFTER_SUBMIT' }));
    const uploadId = first.outcome === 'UNKNOWN' ? first.providerUploadId : undefined;
    const second = await provider.publishVideo(
      publishInput({ scenario: 'UNKNOWN_AFTER_SUBMIT', providerUploadId: uploadId }),
    );
    expect(provider.getUploadAttempts(PUBLICATION)).toBe(1);
    expect(second.outcome).toBe('UNKNOWN');
    expect(JSON.stringify(second)).not.toContain('externalPostId');
  });

  it('accepts PROCESSING then getPublishStatus becomes PUBLISHED without waiting', async () => {
    const provider = new MockPublishingProvider();
    const published = await provider.publishVideo(publishInput({ scenario: 'PROCESSING' }));
    expect(published).toMatchObject({
      outcome: 'ACCEPTED',
      platformStatus: 'PROCESSING',
      providerItemId: `mock-item-${PUBLICATION}`,
    });
    if (published.outcome === 'ACCEPTED') {
      expect(published.externalPostId).toBeUndefined();
      const status = await provider.getPublishStatus({
        tenantId: TENANT,
        workspaceId: WORKSPACE,
        platformAccount: mockAccount(),
        publicationId: PUBLICATION,
        providerItemId: published.providerItemId,
        requestId: published.requestId,
        scenario: 'PROCESSING',
      });
      expect(status.platformStatus).toBe('PUBLISHED');
      expect(status.externalPostId).toBe(`mock-post-${PUBLICATION}`);
    }
  });

  it('returns UNKNOWN when status query has no resolvable identity', async () => {
    const provider = new MockPublishingProvider();
    await expect(
      provider.getPublishStatus({
        tenantId: TENANT,
        workspaceId: WORKSPACE,
        platformAccount: mockAccount(),
      }),
    ).resolves.toMatchObject({ platformStatus: 'UNKNOWN' });
  });

  it('returns PUBLISHED status for a SUCCESS externalPostId', async () => {
    const provider = new MockPublishingProvider();
    const created = await provider.publishVideo(publishInput());
    if (created.outcome !== 'ACCEPTED') {
      throw new Error('expected accepted');
    }
    await expect(
      provider.getPublishStatus({
        tenantId: TENANT,
        workspaceId: WORKSPACE,
        platformAccount: mockAccount(),
        externalPostId: created.externalPostId,
        publicationId: PUBLICATION,
      }),
    ).resolves.toMatchObject({ platformStatus: 'PUBLISHED', externalPostId: created.externalPostId });
  });

  it('does not leak token-like fields', async () => {
    const provider = new MockPublishingProvider();
    const result = await provider.publishVideo(publishInput());
    expect(secretKeys(result)).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/Bearer |act\./);
  });

  it('does not take a Prisma client or mutate business tables', () => {
    const provider = new MockPublishingProvider();
    expect(provider).not.toHaveProperty('prisma');
    expect(typeof (provider as { publication?: unknown }).publication).toBe('undefined');
  });

  it('does not require a public storage URL', async () => {
    const exists = vi.fn().mockResolvedValue(true);
    const getUrl = vi.fn().mockReturnValue('local://never-used');
    const get = vi.fn();
    const provider = new MockPublishingProvider({ exists, getUrl, get });
    const result = await provider.publishVideo(publishInput());
    expect(result.outcome).toBe('ACCEPTED');
    expect(exists).toHaveBeenCalledWith(STORAGE_KEY);
    expect(getUrl).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('reads LocalStorage by key without treating getUrl as a public HTTP URL', async () => {
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-pub-mock-${process.pid}`);
    const storage = new StorageService(new LocalStorageProvider());
    await storage.put(STORAGE_KEY, Buffer.from('mock-mp4-bytes'), { mimeType: 'video/mp4' });
    const provider = new MockPublishingProvider(storage);
    const result = await provider.publishVideo(publishInput());
    expect(result.outcome).toBe('ACCEPTED');
    expect(storage.getUrl(STORAGE_KEY).startsWith('local://')).toBe(true);
  });
});
