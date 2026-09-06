import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MembershipRole, Platform, PlatformAccountStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  migrateDeploy,
  startTestDatabase,
  stopTestDatabase,
} from '../../../database/test/harness.ts';
import { AppModule } from '../src/app.module.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from '../src/agents/definitions/account-positioning.fixture.js';
import { configureApp } from '../src/configure-app.js';
import { TokenService } from '../src/auth/token.service.js';
import { AppError, ErrorCode } from '../src/common/errors/app-error.js';
import { JobProcessor } from '../src/jobs/job.processor.js';
import { EncryptedDbSecretStore } from '../src/publishing/secrets/encrypted-db.secret-store.js';
import { PublishingProviderRegistry } from '../src/publishing/providers/publishing-provider.registry.js';
import { MockPublishingProvider } from '../src/publishing/providers/mock-publishing.provider.js';
import {
  MOCK_DOUYIN_CODE_INVALID,
  MOCK_DOUYIN_CODE_SUCCESS,
  MOCK_DOUYIN_CODE_USER_INFO_FAILURE,
  MOCK_DOUYIN_OPEN_ID,
} from '../src/publishing/oauth/douyin-oauth.types.js';
import { OAUTH_STATE_STORE } from '../src/publishing/oauth/oauth-state.js';
import { buildOAuthStateContext } from '../src/publishing/oauth/oauth-state.js';
import { InMemoryOAuthStateStore } from '../src/publishing/oauth/in-memory-oauth-state.store.js';
import { DOUYIN_OAUTH_SCOPE_USER_INFO } from '../src/publishing/oauth/douyin-oauth.config.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

function secretKeys(value: unknown): string[] {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return [
    '"credentialRef"',
    '"cipher"',
    '"nonce"',
    '"authTag"',
    '"accessToken"',
    '"refreshToken"',
    'client_secret',
    'clientSecret',
    'test-douyin-client-secret',
    'dummy-access-not-a-real-token',
  ].filter((key) => text.includes(key));
}

async function registerUser(app: INestApplication, name = 'Owner') {
  const email = `${name.toLowerCase()}-${suffix()}@example.com`;
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'password1', name })
    .expect(201);
  return {
    token: res.body.accessToken as string,
    userId: res.body.user.id as string,
    tenantId: res.body.tenant.id as string,
    workspaceId: res.body.workspace.id as string,
  };
}

function parseState(authorizationUrl: string): string {
  const state = new URL(authorizationUrl).searchParams.get('state');
  if (!state) {
    throw new Error('missing state');
  }
  return state;
}

describe('Douyin OAuth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tokens: TokenService;
  const masterKey = randomBytes(32);
  const redirectUri = 'https://example.test/platform-accounts/douyin/callback';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = masterKey.toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-oauth-${process.pid}`);
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    process.env.MEDIA_COMPOSE_PROVIDER = 'mock';
    process.env.MEDIA_IMAGE_PROVIDER = 'color-background';
    process.env.DOUYIN_CLIENT_KEY = 'test-douyin-client-key';
    process.env.DOUYIN_CLIENT_SECRET = 'test-douyin-client-secret';
    process.env.DOUYIN_REDIRECT_URI = redirectUri;
    process.env.DOUYIN_OAUTH_BASE_URL = 'https://open.douyin.com';
    process.env.DOUYIN_API_BASE_URL = 'https://open.douyin.com';
    delete process.env.AI_ENGINE_URL;
    delete process.env.MODEL_API_KEY;
    delete process.env.RUN_REDIS_TESTS;
    delete process.env.RUN_REAL_TTS_TESTS;
    delete process.env.RUN_REAL_VISUAL_TESTS;
    delete process.env.RUN_REAL_DOUYIN_OAUTH_TESTS;
    delete process.env.WANX_API_KEY;
    delete process.env.MINIMAX_TTS_API_KEY;
    const databaseUrl = await startTestDatabase();
    process.env.DATABASE_URL = databaseUrl;
    migrateDeploy(databaseUrl);
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  async function startConnect(token: string) {
    const res = await request(app.getHttpServer())
      .post('/platform-accounts/douyin/connect')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    expect(secretKeys(res.body)).toEqual([]);
    return res.body.authorizationUrl as string;
  }

  async function callback(code: string, state: string, expectedStatus = 200) {
    return request(app.getHttpServer())
      .get('/platform-accounts/douyin/callback')
      .query({ code, state })
      .expect(expectedStatus);
  }

  async function createCompletedVideo(token: string) {
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'OAuth回归' })
      .expect(201);
    const plan = await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectId: project.body.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/content-plans/${plan.body.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const script = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contentPlanId: plan.body.id,
        topicId: plan.body.payload.topics[0].id,
        targetDuration: 15,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/scripts/${script.body.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${token}`)
      .send({ scriptId: script.body.id, targetDuration: 15 })
      .expect(201);
    await app.get(JobProcessor).process(created.body.sourceJobId);
    const video = await request(app.getHttpServer())
      .get(`/videos/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(video.body.status).toBe('COMPLETED');
    return { projectId: project.body.id as string, videoId: video.body.id as string };
  }

  it('lets OWNER and ADMIN start connect with official authorize URL fields', async () => {
    const owner = await registerUser(app, 'OauthOwner');
    const url = new URL(await startConnect(owner.token));
    expect(url.origin).toBe('https://open.douyin.com');
    expect(url.pathname).toBe('/platform/oauth/connect');
    expect(url.searchParams.get('client_key')).toBe('test-douyin-client-key');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe(DOUYIN_OAUTH_SCOPE_USER_INFO);
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(url.searchParams.get('state')?.length).toBeGreaterThanOrEqual(32);
    expect(url.toString()).not.toContain('test-douyin-client-secret');
    expect(url.searchParams.get('scope')).not.toContain('video.create.bind');

    await prisma.membership.update({
      where: { userId_tenantId: { userId: owner.userId, tenantId: owner.tenantId } },
      data: { role: MembershipRole.ADMIN },
    });
    const adminToken = tokens.signAccess({
      userId: owner.userId,
      tenantId: owner.tenantId,
      workspaceId: owner.workspaceId,
      role: 'ADMIN',
    });
    await startConnect(adminToken);

    const editorToken = tokens.signAccess({
      userId: owner.userId,
      tenantId: owner.tenantId,
      workspaceId: owner.workspaceId,
      role: 'EDITOR',
    });
    await request(app.getHttpServer())
      .post('/platform-accounts/douyin/connect')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({})
      .expect(403);

    const store = app.get(OAUTH_STATE_STORE);
    if (store instanceof InMemoryOAuthStateStore) {
      expect(store.size()).toBeGreaterThan(0);
    }
  });

  it('rejects wrong, expired, replayed and concurrent state', async () => {
    const user = await registerUser(app, 'OauthState');
    const authorizationUrl = await startConnect(user.token);
    const state = parseState(authorizationUrl);

    const wrong = await callback(MOCK_DOUYIN_CODE_SUCCESS, 'not-a-real-state', 400);
    expect(wrong.body.code).toBe(ErrorCode.DOUYIN_OAUTH_INVALID_STATE);
    expect(secretKeys(wrong.body)).toEqual([]);

    const store = app.get(OAUTH_STATE_STORE);
    await store.save(
      state,
      buildOAuthStateContext({
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        userId: user.userId,
        requestedScopes: ['user_info'],
        ttlMs: 1,
      }),
      1,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const expired = await callback(MOCK_DOUYIN_CODE_SUCCESS, state, 400);
    expect(expired.body.code).toBe(ErrorCode.DOUYIN_OAUTH_STATE_EXPIRED);

    const fresh = parseState(await startConnect(user.token));
    const first = await callback(MOCK_DOUYIN_CODE_SUCCESS, fresh);
    expect(first.text).toContain('Douyin account connected');
    expect(secretKeys(first.text)).toEqual([]);
    const replay = await callback(MOCK_DOUYIN_CODE_SUCCESS, fresh, 400);
    expect(replay.body.code).toBe(ErrorCode.DOUYIN_OAUTH_INVALID_STATE);

    const concurrentState = parseState(await startConnect(user.token));
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .get('/platform-accounts/douyin/callback')
        .query({ code: MOCK_DOUYIN_CODE_SUCCESS, state: concurrentState }),
      request(app.getHttpServer())
        .get('/platform-accounts/douyin/callback')
        .query({ code: MOCK_DOUYIN_CODE_SUCCESS, state: concurrentState }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 400]);
  });

  it('creates and reconnects a Douyin PlatformAccount with encrypted credentials', async () => {
    const user = await registerUser(app, 'OauthUpsert');
    const state = parseState(await startConnect(user.token));
    await callback(MOCK_DOUYIN_CODE_SUCCESS, state);

    const listed = await request(app.getHttpServer())
      .get('/platform-accounts')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].platform).toBe('DOUYIN');
    expect(listed.body[0].externalAccountId).toBe(MOCK_DOUYIN_OPEN_ID);
    expect(listed.body[0].displayName).toBeTruthy();
    expect(listed.body[0].status).toBe('ACTIVE');
    expect(listed.body[0].scopes).toEqual(['user_info']);
    expect(secretKeys(listed.body)).toEqual([]);

    const accountId = listed.body[0].id as string;
    const row = await prisma.platformAccount.findFirstOrThrow({ where: { id: accountId } });
    expect(row.credentialRef).toBeTruthy();
    const secretRow = await prisma.platformSecret.findFirstOrThrow({ where: { id: row.credentialRef } });
    expect(secretRow).not.toHaveProperty('accessToken');
    expect(Buffer.from(secretRow.cipher).toString('utf8')).not.toContain('dummy-access-not-a-real-token');
    const payload = await app.get(EncryptedDbSecretStore).get(
      { id: row.credentialRef },
      { tenantId: user.tenantId, workspaceId: user.workspaceId },
    );
    expect(payload.accessToken).toBe('dummy-access-not-a-real-token');
    expect(payload.expiresAt).toBeTruthy();
    expect(payload.refreshExpiresAt).toBeTruthy();

    const reconnectState = parseState(await startConnect(user.token));
    await callback(MOCK_DOUYIN_CODE_SUCCESS, reconnectState);
    const listedAgain = await request(app.getHttpServer())
      .get('/platform-accounts')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(listedAgain.body).toHaveLength(1);
    expect(listedAgain.body[0].id).toBe(accountId);
    expect(listedAgain.body[0].status).toBe('ACTIVE');
    const rotated = await prisma.platformAccount.findFirstOrThrow({ where: { id: accountId } });
    expect(rotated.credentialRef).not.toBe(row.credentialRef);
    const oldSecret = await prisma.platformSecret.findFirstOrThrow({ where: { id: row.credentialRef } });
    expect(oldSecret.revokedAt).not.toBeNull();
  });

  it('refreshes credentials on demand and expires when refresh is no longer valid', async () => {
    const user = await registerUser(app, 'OauthRefresh');
    await callback(MOCK_DOUYIN_CODE_SUCCESS, parseState(await startConnect(user.token)));
    const listed = await request(app.getHttpServer())
      .get('/platform-accounts')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const accountId = listed.body[0].id as string;
    const before = await prisma.platformAccount.findFirstOrThrow({ where: { id: accountId } });

    const refreshed = await request(app.getHttpServer())
      .post(`/platform-accounts/${accountId}/refresh`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(refreshed.body.status).toBe('ACTIVE');
    expect(secretKeys(refreshed.body)).toEqual([]);
    const after = await prisma.platformAccount.findFirstOrThrow({ where: { id: accountId } });
    expect(after.credentialRef).not.toBe(before.credentialRef);
    expect(after.lastRefreshedAt).toBeTruthy();
    expect(after.expiresAt).toBeTruthy();
    const old = await prisma.platformSecret.findFirstOrThrow({ where: { id: before.credentialRef } });
    expect(old.revokedAt).not.toBeNull();

    await app.get(EncryptedDbSecretStore).put({
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      kind: 'PLATFORM_OAUTH',
      payload: {
        accessToken: 'dummy-access-not-a-real-token',
        refreshToken: 'dummy-refresh-expired',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    }).then(async (ref) => {
      await prisma.platformAccount.update({
        where: { id_tenantId: { id: accountId, tenantId: user.tenantId } },
        data: { credentialRef: ref.id },
      });
    });

    const expired = await request(app.getHttpServer())
      .post(`/platform-accounts/${accountId}/refresh`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409);
    expect(expired.body.code).toBe(ErrorCode.PLATFORM_REAUTH_REQUIRED);
    expect(secretKeys(expired.body)).toEqual([]);
    const expiredRow = await prisma.platformAccount.findFirstOrThrow({ where: { id: accountId } });
    expect(expiredRow.status).toBe(PlatformAccountStatus.EXPIRED);
  });

  it('disconnects without deleting history publications', async () => {
    const user = await registerUser(app, 'OauthDisc');
    await callback(MOCK_DOUYIN_CODE_SUCCESS, parseState(await startConnect(user.token)));
    const listed = await request(app.getHttpServer())
      .get('/platform-accounts')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const accountId = listed.body[0].id as string;
    const before = await prisma.platformAccount.findFirstOrThrow({ where: { id: accountId } });
    const { videoId } = await createCompletedVideo(user.token);
    const manual = await request(app.getHttpServer())
      .post(`/videos/${videoId}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `manual-${suffix()}`)
      .send({
        platform: 'DOUYIN',
        mode: 'MANUAL',
        title: 'manual',
        visibility: 'PUBLIC',
      })
      .expect(201);

    const disconnected = await request(app.getHttpServer())
      .delete(`/platform-accounts/${accountId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(disconnected.body.status).toBe('DISCONNECTED');
    const secret = await prisma.platformSecret.findFirstOrThrow({ where: { id: before.credentialRef } });
    expect(secret.revokedAt).not.toBeNull();
    const publication = await request(app.getHttpServer())
      .get(`/publications/${manual.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(publication.body.id).toBe(manual.body.id);
    expect(publication.body.status).toBe('PENDING');
  });

  it('isolates accounts and secrets across tenant and workspace', async () => {
    const a = await registerUser(app, 'OauthIsoA');
    const b = await registerUser(app, 'OauthIsoB');
    await callback(MOCK_DOUYIN_CODE_SUCCESS, parseState(await startConnect(a.token)));
    const listed = await request(app.getHttpServer())
      .get('/platform-accounts')
      .set('Authorization', `Bearer ${a.token}`)
      .expect(200);
    const accountId = listed.body[0].id as string;
    await request(app.getHttpServer())
      .get(`/platform-accounts/${accountId}`)
      .set('Authorization', `Bearer ${b.token}`)
      .expect(404)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.PLATFORM_ACCOUNT_NOT_FOUND));

    const extra = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ name: '第二空间' })
      .expect(201);
    const workspaceBToken = tokens.signAccess({
      userId: a.userId,
      tenantId: a.tenantId,
      workspaceId: extra.body.id,
      role: 'OWNER',
    });
    await callback(MOCK_DOUYIN_CODE_SUCCESS, parseState(await startConnect(workspaceBToken)));
    const listB = await request(app.getHttpServer())
      .get('/platform-accounts')
      .set('Authorization', `Bearer ${workspaceBToken}`)
      .expect(200);
    expect(listB.body).toHaveLength(1);
    const accountB = await prisma.platformAccount.findFirstOrThrow({
      where: { id: listB.body[0].id as string, workspaceId: extra.body.id },
    });
    await expect(
      app.get(EncryptedDbSecretStore).get(
        { id: accountB.credentialRef },
        { tenantId: a.tenantId, workspaceId: a.workspaceId },
      ),
    ).rejects.toMatchObject({ code: ErrorCode.SECRET_NOT_FOUND });
  });

  it('keeps Douyin API publishing unimplemented while MANUAL and MOCK still work', async () => {
    const user = await registerUser(app, 'OauthReg');
    await callback(MOCK_DOUYIN_CODE_SUCCESS, parseState(await startConnect(user.token)));
    const listed = await request(app.getHttpServer())
      .get('/platform-accounts')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const { videoId } = await createCompletedVideo(user.token);

    await request(app.getHttpServer())
      .post(`/videos/${videoId}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `api-dy-${suffix()}`)
      .send({
        platformAccountId: listed.body[0].id,
        platform: 'DOUYIN',
        mode: 'API',
        title: 'api',
        visibility: 'PUBLIC',
      })
      .expect(501)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.PUBLISHING_PROVIDER_NOT_IMPLEMENTED));

    expect(() => app.get(PublishingProviderRegistry).resolve(Platform.DOUYIN)).toThrow(AppError);

    const manual = await request(app.getHttpServer())
      .post(`/videos/${videoId}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `man-dy-${suffix()}`)
      .send({
        platform: 'DOUYIN',
        mode: 'MANUAL',
        title: 'manual still works',
        visibility: 'PUBLIC',
      })
      .expect(201);
    expect(manual.body.status).toBe('PENDING');
    expect(manual.body.sourceJobId).toBeNull();

    const mockAccount = await prisma.platformAccount.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        platform: Platform.MOCK,
        externalAccountId: `mock-${suffix()}`,
        displayName: 'Mock',
        status: PlatformAccountStatus.ACTIVE,
        credentialRef: randomUUID(),
        connectedAt: new Date(),
      },
    });
    const created = await request(app.getHttpServer())
      .post(`/videos/${videoId}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `mock-api-${suffix()}`)
      .send({
        platformAccountId: mockAccount.id,
        platform: 'MOCK',
        mode: 'API',
        title: 'mock',
        visibility: 'PUBLIC',
      })
      .expect(201);
    app.get(MockPublishingProvider).configureScenario(created.body.id, 'SUCCESS');
    await app.get(JobProcessor).process(created.body.sourceJobId);
    const published = await request(app.getHttpServer())
      .get(`/publications/${created.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(published.body.status).toBe('PUBLISHED');
  });

  it('maps denied and invalid callback errors without leaking secrets', async () => {
    const user = await registerUser(app, 'OauthErr');
    const deniedState = parseState(await startConnect(user.token));
    const denied = await request(app.getHttpServer())
      .get('/platform-accounts/douyin/callback')
      .query({ error: 'access_denied', state: deniedState })
      .expect(400);
    expect(denied.body.code).toBe(ErrorCode.DOUYIN_OAUTH_DENIED);
    expect(secretKeys(denied.body)).toEqual([]);

    const invalidState = parseState(await startConnect(user.token));
    const invalid = await callback(MOCK_DOUYIN_CODE_INVALID, invalidState, 400);
    expect(invalid.body.code).toBe(ErrorCode.DOUYIN_OAUTH_INVALID_CODE);

    const infoState = parseState(await startConnect(user.token));
    const info = await callback(MOCK_DOUYIN_CODE_USER_INFO_FAILURE, infoState, 502);
    expect(info.body.code).toBe(ErrorCode.DOUYIN_USER_INFO_FAILED);
    expect(secretKeys(info.body)).toEqual([]);
  });
});
