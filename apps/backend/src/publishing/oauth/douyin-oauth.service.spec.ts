import { Platform, PlatformAccountStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { DouyinOAuthService } from './douyin-oauth.service.js';
import { InMemoryOAuthStateStore } from './in-memory-oauth-state.store.js';
import { MockDouyinOAuthClient } from './mock-douyin-oauth.client.js';
import {
  DUMMY_DOUYIN_ACCESS_TOKEN,
  MOCK_DOUYIN_CODE_SUCCESS,
  MOCK_DOUYIN_OPEN_ID,
  MOCK_DOUYIN_REFRESH_EXPIRED,
  MOCK_DOUYIN_REFRESH_SUCCESS,
} from './douyin-oauth.types.js';
import { DOUYIN_OAUTH_SCOPE_USER_INFO } from './douyin-oauth.config.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const ACCOUNT = '44444444-4444-4444-8444-444444444444';
const SECRET_OLD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECRET_NEW = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const auth = { userId: USER, tenantId: TENANT, workspaceId: WORKSPACE, role: 'OWNER' };

describe('DouyinOAuthService', () => {
  const prisma = {
    platformAccount: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const secrets = {
    put: vi.fn(),
    get: vi.fn(),
    revoke: vi.fn(),
  };
  let states: InMemoryOAuthStateStore;
  let oauth: MockDouyinOAuthClient;
  let service: DouyinOAuthService;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DOUYIN_CLIENT_KEY = 'test-client-key';
    process.env.DOUYIN_CLIENT_SECRET = 'test-client-secret';
    process.env.DOUYIN_REDIRECT_URI = 'https://example.test/platform-accounts/douyin/callback';
    process.env.DOUYIN_OAUTH_BASE_URL = 'https://open.douyin.com';
    states = new InMemoryOAuthStateStore();
    oauth = new MockDouyinOAuthClient();
    service = new DouyinOAuthService(prisma as never, secrets as never, oauth, states);
  });

  it('builds an official authorize URL with user_info and cryptographic state', async () => {
    const result = await service.startConnect(auth);
    const url = new URL(result.authorizationUrl);
    expect(url.origin + url.pathname).toBe('https://open.douyin.com/platform/oauth/connect');
    expect(url.searchParams.get('client_key')).toBe('test-client-key');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe(DOUYIN_OAUTH_SCOPE_USER_INFO);
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.test/platform-accounts/douyin/callback');
    expect(url.searchParams.get('state')?.length).toBeGreaterThanOrEqual(32);
    expect(result.authorizationUrl).not.toContain('test-client-secret');
    expect(url.searchParams.get('scope')).not.toContain('video.create.bind');
  });

  it('upserts an ACTIVE Douyin account and encrypts credentials via SecretStore', async () => {
    secrets.put.mockResolvedValue({ id: SECRET_NEW });
    prisma.platformAccount.findFirst.mockResolvedValue(null);
    prisma.platformAccount.create.mockResolvedValue(accountRow({ credentialRef: SECRET_NEW }));
    const started = await service.startConnect(auth);
    const state = new URL(started.authorizationUrl).searchParams.get('state') as string;
    const created = await service.handleCallback({ code: MOCK_DOUYIN_CODE_SUCCESS, state });
    expect(created.externalAccountId).toBe(MOCK_DOUYIN_OPEN_ID);
    expect(created.status).toBe(PlatformAccountStatus.ACTIVE);
    expect(created).not.toHaveProperty('credentialRef');
    expect(secrets.put).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        workspaceId: WORKSPACE,
        payload: expect.objectContaining({ accessToken: DUMMY_DOUYIN_ACCESS_TOKEN }),
      }),
    );
    expect(prisma.platformAccount.create.mock.calls[0]?.[0]?.data?.externalAccountId).toBe(MOCK_DOUYIN_OPEN_ID);
  });

  it('reconnects the same open_id by rotating secret after the new put succeeds', async () => {
    secrets.put.mockResolvedValue({ id: SECRET_NEW });
    secrets.revoke.mockResolvedValue(undefined);
    prisma.platformAccount.findFirst.mockResolvedValue(accountRow({ credentialRef: SECRET_OLD }));
    prisma.platformAccount.update.mockResolvedValue(accountRow({ credentialRef: SECRET_NEW }));
    const started = await service.startConnect(auth);
    const state = new URL(started.authorizationUrl).searchParams.get('state') as string;
    await service.handleCallback({ code: MOCK_DOUYIN_CODE_SUCCESS, state });
    expect(secrets.put.mock.invocationCallOrder[0]).toBeLessThan(secrets.revoke.mock.invocationCallOrder[0]);
    expect(secrets.revoke).toHaveBeenCalledWith({ id: SECRET_OLD }, { tenantId: TENANT, workspaceId: WORKSPACE });
  });

  it('marks the account EXPIRED when refresh token is past expiry', async () => {
    secrets.get.mockResolvedValue({
      accessToken: DUMMY_DOUYIN_ACCESS_TOKEN,
      refreshToken: MOCK_DOUYIN_REFRESH_SUCCESS,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    prisma.platformAccount.findFirst.mockResolvedValue(accountRow({ credentialRef: SECRET_OLD }));
    prisma.platformAccount.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.refreshDouyinCredential(auth, ACCOUNT)).rejects.toMatchObject({
      code: ErrorCode.PLATFORM_REAUTH_REQUIRED,
    });
    expect(prisma.platformAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: PlatformAccountStatus.EXPIRED } }),
    );
  });

  it('does not refresh when access token is outside the safety window', async () => {
    const row = accountRow({ credentialRef: SECRET_OLD });
    secrets.get.mockResolvedValue({
      accessToken: DUMMY_DOUYIN_ACCESS_TOKEN,
      refreshToken: MOCK_DOUYIN_REFRESH_SUCCESS,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      refreshExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    secrets.put.mockResolvedValue({ id: SECRET_NEW });
    await service.ensureValidCredential(row);
    expect(secrets.put).not.toHaveBeenCalled();
  });

  it('maps provider refresh reauth to PLATFORM_REAUTH_REQUIRED', async () => {
    secrets.get.mockResolvedValue({
      accessToken: DUMMY_DOUYIN_ACCESS_TOKEN,
      refreshToken: MOCK_DOUYIN_REFRESH_EXPIRED,
      expiresAt: new Date(Date.now() + 1_000).toISOString(),
      refreshExpiresAt: new Date(Date.now() + 10_000).toISOString(),
    });
    prisma.platformAccount.findFirst.mockResolvedValue(accountRow({ credentialRef: SECRET_OLD }));
    prisma.platformAccount.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.refreshDouyinCredential(auth, ACCOUNT)).rejects.toMatchObject({
      code: ErrorCode.PLATFORM_REAUTH_REQUIRED,
    });
  });
});

function accountRow(overrides?: { credentialRef?: string }) {
  return {
    id: ACCOUNT,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    platform: Platform.DOUYIN,
    externalAccountId: MOCK_DOUYIN_OPEN_ID,
    displayName: 'Mock Douyin User',
    status: PlatformAccountStatus.ACTIVE,
    credentialRef: overrides?.credentialRef ?? SECRET_OLD,
    scopes: ['user_info'],
    metadata: {},
    connectedAt: new Date(),
    expiresAt: new Date(Date.now() + 1_000_000),
    lastRefreshedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}
