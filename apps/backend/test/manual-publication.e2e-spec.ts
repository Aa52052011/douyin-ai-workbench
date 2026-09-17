import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JobKind, Platform, PlatformAccountStatus, PrismaClient } from '@prisma/client';
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
import { ErrorCode } from '../src/common/errors/app-error.js';
import { JobProcessor } from '../src/jobs/job.processor.js';
import { JOB_QUEUE } from '../src/jobs/queue/queue.constants.js';
import { InMemoryJobQueue } from '../src/jobs/queue/in-memory-job.queue.js';
import { buildStorageKey } from '../src/media/storage/storage-key.js';
import { MockPublishingProvider } from '../src/publishing/providers/mock-publishing.provider.js';
import { StorageService } from '../src/media/storage/storage.service.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

function secretKeys(value: unknown): string[] {
  const text = JSON.stringify(value);
  return ['accessToken', 'refreshToken', 'clientSecret', 'Authorization', 'cookie', 'credentialRef', 'storageKey'].filter(
    (key) => text.includes(`"${key}"`),
  );
}

async function registerUser(app: INestApplication, name = 'Owner') {
  const email = `${name.toLowerCase()}-${suffix()}@example.com`;
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'password1', name })
    .expect(201);
  return {
    token: res.body.accessToken as string,
    tenantId: res.body.tenant.id as string,
    workspaceId: res.body.workspace.id as string,
  };
}

async function createProject(app: INestApplication, token: string) {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '手动发布' })
    .expect(201);
  return res.body as { id: string };
}

async function createConfirmedScript(app: INestApplication, token: string, projectId: string) {
  const plan = await request(app.getHttpServer())
    .post('/content-plans')
    .set('Authorization', `Bearer ${token}`)
    .send({
      projectId,
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
  return script.body as { id: string };
}

describe('Manual export + manual publication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let processor: JobProcessor;
  let mockPublisher: MockPublishingProvider;
  let queue: InMemoryJobQueue;
  let storage: StorageService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-manual-${process.pid}`);
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    process.env.MEDIA_COMPOSE_PROVIDER = 'mock';
    process.env.MEDIA_IMAGE_PROVIDER = 'color-background';
    delete process.env.AI_ENGINE_URL;
    delete process.env.MODEL_API_KEY;
    delete process.env.RUN_REDIS_TESTS;
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
    processor = app.get(JobProcessor);
    mockPublisher = app.get(MockPublishingProvider);
    queue = app.get(JOB_QUEUE) as InMemoryJobQueue;
    storage = app.get(StorageService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  async function completedVideo(token: string) {
    const project = await createProject(app, token);
    const script = await createConfirmedScript(app, token, project.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${token}`)
      .send({ scriptId: script.id, targetDuration: 15 })
      .expect(201);
    await processor.process(created.body.sourceJobId);
    const video = await request(app.getHttpServer())
      .get(`/videos/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(video.body.status).toBe('COMPLETED');
    return { project, video: video.body as { id: string; sourceJobId: string; projectId: string; outputAssetId: string } };
  }

  function manualBody(overrides?: Record<string, unknown>) {
    return {
      platform: 'DOUYIN',
      mode: 'MANUAL',
      title: '手工发布',
      description: 'desc',
      hashtags: ['manual'],
      visibility: 'PUBLIC',
      ...overrides,
    };
  }

  it('creates MANUAL publications without Job, enqueue, or Provider', async () => {
    const user = await registerUser(app, 'ManCreate');
    const { video } = await completedVideo(user.token);
    const beforeJobs = await prisma.job.count({ where: { tenantId: user.tenantId, kind: JobKind.VIDEO_PUBLISH } });
    const beforeEnqueue = queue.enqueued.length;

    const douyin = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `man-dy-${suffix()}`)
      .send(manualBody())
      .expect(201);
    expect(douyin.body).toMatchObject({
      mode: 'MANUAL',
      platform: 'DOUYIN',
      status: 'PENDING',
      sourceJobId: null,
      platformAccount: null,
    });
    expect(secretKeys(douyin.body)).toEqual([]);
    expect(mockPublisher.getPublishAttempts(douyin.body.id)).toBe(0);

    const tiktok = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `man-tt-${suffix()}`)
      .send(manualBody({ platform: 'TIKTOK', title: 'tiktok' }))
      .expect(201);
    expect(tiktok.body.platform).toBe('TIKTOK');
    expect(tiktok.body.sourceJobId).toBeNull();

    const afterJobs = await prisma.job.count({ where: { tenantId: user.tenantId, kind: JobKind.VIDEO_PUBLISH } });
    expect(afterJobs).toBe(beforeJobs);
    expect(queue.enqueued.length).toBe(beforeEnqueue);

    const idem = `man-same-${suffix()}`;
    const first = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', idem)
      .send(manualBody({ platform: 'YOUTUBE', title: 'yt' }))
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', idem)
      .send(manualBody({ platform: 'YOUTUBE', title: 'yt' }))
      .expect(201);
    expect(replay.body.id).toBe(first.body.id);
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', idem)
      .send(manualBody({ platform: 'YOUTUBE', title: 'changed' }))
      .expect(409)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.IDEMPOTENCY_KEY_CONFLICT));
  });

  it('rejects incomplete video, invalid output, and cross-tenant manual create', async () => {
    const owner = await registerUser(app, 'ManPreA');
    const other = await registerUser(app, 'ManPreB');
    const { video } = await completedVideo(owner.token);
    const pending = await prisma.video.create({
      data: {
        tenantId: owner.tenantId,
        workspaceId: owner.workspaceId,
        projectId: video.projectId,
        status: 'PENDING',
      },
    });
    await request(app.getHttpServer())
      .post(`/videos/${pending.id}/publications`)
      .set('Authorization', `Bearer ${owner.token}`)
      .set('x-idempotency-key', `man-pend-${suffix()}`)
      .send(manualBody())
      .expect(409);
    await prisma.asset.update({
      where: { id_tenantId: { id: video.outputAssetId, tenantId: owner.tenantId } },
      data: { status: 'FAILED' },
    });
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${owner.token}`)
      .set('x-idempotency-key', `man-asset-${suffix()}`)
      .send(manualBody())
      .expect(409);
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${other.token}`)
      .set('x-idempotency-key', `man-cross-${suffix()}`)
      .send(manualBody())
      .expect(404);
  });

  it('exports completed video bytes with safe download headers', async () => {
    const user = await registerUser(app, 'ManExp');
    const other = await registerUser(app, 'ManExpB');
    const { video } = await completedVideo(user.token);
    const asset = await prisma.asset.findFirst({ where: { id: video.outputAssetId, tenantId: user.tenantId } });
    const stored = await storage.get(asset!.storageKey);
    const exported = await request(app.getHttpServer())
      .get(`/videos/${video.id}/export`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(exported.headers['content-type']).toMatch(/video\/mp4/);
    expect(exported.headers['content-disposition']).toMatch(/^attachment; filename="video_vertical\.mp4"; filename\*=UTF-8''/);
    expect(exported.headers['content-disposition']).toMatch(/\.mp4/);
    expect(exported.headers['content-disposition']).not.toMatch(/[\r\n]/);
    expect(createHash('sha256').update(exported.body).digest('hex')).toBe(createHash('sha256').update(stored).digest('hex'));
    expect(JSON.stringify(exported.headers)).not.toContain('storageKey');
    expect(JSON.stringify(exported.headers)).not.toMatch(/[A-Za-z]:\\/);

    await request(app.getHttpServer())
      .get(`/videos/${video.id}/export`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);

    await prisma.video.update({
      where: { id_tenantId: { id: video.id, tenantId: user.tenantId } },
      data: { outputAssetId: null },
    });
    await request(app.getHttpServer())
      .get(`/videos/${video.id}/export`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.VIDEO_EXPORT_NOT_AVAILABLE));

    const { video: video2 } = await completedVideo(user.token);
    await prisma.asset.update({
      where: { id_tenantId: { id: video2.outputAssetId, tenantId: user.tenantId } },
      data: {
        storageKey: buildStorageKey({
          tenantId: user.tenantId,
          workspaceId: user.workspaceId,
          projectId: video2.projectId,
          assetId: video2.outputAssetId,
        }),
      },
    });
    await request(app.getHttpServer())
      .get(`/videos/${video2.id}/export`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.VIDEO_EXPORT_NOT_AVAILABLE));
  });

  it('completes MANUAL publications with URL or post id and is identity-idempotent', async () => {
    const user = await registerUser(app, 'ManDone');
    const { video } = await completedVideo(user.token);
    const beforeJobs = await prisma.job.count({ where: { tenantId: user.tenantId, kind: JobKind.VIDEO_PUBLISH } });
    const created = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `man-done-${suffix()}`)
      .send(manualBody())
      .expect(201);
    await request(app.getHttpServer())
      .post(`/publications/${created.body.id}/manual-complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(400)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.MANUAL_PUBLICATION_EXTERNAL_IDENTITY_REQUIRED));
    await request(app.getHttpServer())
      .post(`/publications/${created.body.id}/manual-complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ externalUrl: 'douyin://video/1' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/publications/${created.body.id}/manual-complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ externalPostId: 'id\u0001bad' })
      .expect(400);

    const completed = await request(app.getHttpServer())
      .post(`/publications/${created.body.id}/manual-complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ externalUrl: 'https://www.douyin.com/video/abc' })
      .expect(200);
    expect(completed.body.status).toBe('PUBLISHED');
    expect(completed.body.externalUrl).toBe('https://www.douyin.com/video/abc');
    expect(completed.body.publishedAt).toBeTruthy();
    expect(completed.body.sourceJobId).toBeNull();
    expect(mockPublisher.getPublishAttempts(created.body.id)).toBe(0);

    const replay = await request(app.getHttpServer())
      .post(`/publications/${created.body.id}/manual-complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ externalUrl: 'https://www.douyin.com/video/abc' })
      .expect(200);
    expect(replay.body.id).toBe(created.body.id);
    await request(app.getHttpServer())
      .post(`/publications/${created.body.id}/manual-complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ externalUrl: 'https://www.douyin.com/video/other' })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.MANUAL_PUBLICATION_ALREADY_COMPLETED));

    const byId = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `man-id-${suffix()}`)
      .send(manualBody({ platform: 'BILIBILI', title: 'bili' }))
      .expect(201);
    const published = await request(app.getHttpServer())
      .post(`/publications/${byId.body.id}/manual-complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ externalPostId: 'BV1xx411c7mD' })
      .expect(200);
    expect(published.body.externalPostId).toBe('BV1xx411c7mD');
    expect(await prisma.job.count({ where: { tenantId: user.tenantId, kind: JobKind.VIDEO_PUBLISH } })).toBe(beforeJobs);
  });

  it('rejects manual-complete on API publications and unknown fields', async () => {
    const user = await registerUser(app, 'ManApi');
    const { video } = await completedVideo(user.token);
    const account = await prisma.platformAccount.create({
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
    const api = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `api-${suffix()}`)
      .send({
        platformAccountId: account.id,
        platform: 'MOCK',
        mode: 'API',
        title: 'api',
        visibility: 'PUBLIC',
      })
      .expect(201);
    await processor.process(api.body.sourceJobId);
    const published = await request(app.getHttpServer())
      .get(`/publications/${api.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(published.body.status).toBe('PUBLISHED');
    await request(app.getHttpServer())
      .post(`/publications/${api.body.id}/manual-complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ externalUrl: 'https://example.com/p' })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.MANUAL_PUBLICATION_INVALID_STATE));
    await request(app.getHttpServer())
      .post(`/publications/${api.body.id}/manual-complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ externalUrl: 'https://example.com/p', accessToken: 'nope' })
      .expect(400);
  });

  it('lets MANUAL Douyin and API MOCK publications coexist without changing Video status', async () => {
    const user = await registerUser(app, 'ManCo');
    const { video } = await completedVideo(user.token);
    const generationJobId = video.sourceJobId;
    const manual = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `co-man-${suffix()}`)
      .send(manualBody())
      .expect(201);
    await request(app.getHttpServer())
      .post(`/publications/${manual.body.id}/manual-complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ externalUrl: 'https://www.douyin.com/video/coexist' })
      .expect(200);
    const account = await prisma.platformAccount.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        platform: Platform.MOCK,
        externalAccountId: `co-${suffix()}`,
        displayName: 'Mock',
        status: PlatformAccountStatus.ACTIVE,
        credentialRef: randomUUID(),
        connectedAt: new Date(),
      },
    });
    const api = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `co-api-${suffix()}`)
      .send({
        platformAccountId: account.id,
        platform: 'MOCK',
        mode: 'API',
        title: 'api mock',
        visibility: 'PUBLIC',
      })
      .expect(201);
    await processor.process(api.body.sourceJobId);
    const listed = await request(app.getHttpServer())
      .get('/publications')
      .query({ videoId: video.id })
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(listed.body).toHaveLength(2);
    expect(listed.body.map((row: { mode: string }) => row.mode).sort()).toEqual(['API', 'MANUAL']);
    expect(listed.body.every((row: { status: string }) => row.status === 'PUBLISHED')).toBe(true);
    const detail = await request(app.getHttpServer())
      .get(`/videos/${video.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(detail.body.status).toBe('COMPLETED');
    expect(detail.body.job.id).toBe(generationJobId);
    expect(detail.body.job.kind).toBe('VIDEO_GENERATION');
    const fetched = await request(app.getHttpServer())
      .get(`/publications/${manual.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(secretKeys(fetched.body)).toEqual([]);
    expect(fetched.body.mode).toBe('MANUAL');
    expect(fetched.body.externalUrl).toBe('https://www.douyin.com/video/coexist');
  });
});
