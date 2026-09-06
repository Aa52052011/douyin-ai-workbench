import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  JobKind,
  JobStatus,
  Platform,
  PlatformAccountStatus,
  PrismaClient,
  PublicationStatus,
} from '@prisma/client';
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
import { StorageService } from '../src/media/storage/storage.service.js';
import { buildStorageKey } from '../src/media/storage/storage-key.js';
import { MockPublishingProvider } from '../src/publishing/providers/mock-publishing.provider.js';

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
    email,
    token: res.body.accessToken as string,
    tenantId: res.body.tenant.id as string,
    workspaceId: res.body.workspace.id as string,
    userId: res.body.user.id as string,
  };
}

async function createProject(app: INestApplication, token: string) {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '发布项目' })
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

describe('Publication API + publish job pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let processor: JobProcessor;
  let mockPublisher: MockPublishingProvider;
  let queue: InMemoryJobQueue;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-pub-api-${process.pid}`);
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    process.env.MEDIA_COMPOSE_PROVIDER = 'mock';
    process.env.MEDIA_IMAGE_PROVIDER = 'color-background';
    delete process.env.AI_ENGINE_URL;
    delete process.env.MODEL_API_KEY;
    delete process.env.RUN_REDIS_TESTS;
    delete process.env.RUN_REAL_TTS_TESTS;
    delete process.env.RUN_REAL_VISUAL_TESTS;
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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  async function completedVideo(app: INestApplication, token: string) {
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
    expect(video.body.job.kind).toBe('VIDEO_GENERATION');
    return { project, video: video.body as { id: string; sourceJobId: string; projectId: string } };
  }

  async function mockAccount(
    tenantId: string,
    workspaceId: string,
    overrides?: { platform?: Platform; status?: PlatformAccountStatus },
  ) {
    return prisma.platformAccount.create({
      data: {
        tenantId,
        workspaceId,
        platform: overrides?.platform ?? Platform.MOCK,
        externalAccountId: `mock-${suffix()}`,
        displayName: 'Mock Account',
        status: overrides?.status ?? PlatformAccountStatus.ACTIVE,
        credentialRef: randomUUID(),
        connectedAt: new Date(),
      },
    });
  }

  function publishBody(accountId: string, overrides?: Record<string, unknown>) {
    return {
      platformAccountId: accountId,
      platform: 'MOCK',
      mode: 'API',
      title: 'Mock publish',
      description: 'desc',
      hashtags: ['demo'],
      visibility: 'PUBLIC',
      ...overrides,
    };
  }

  it('creates a MOCK publication, enqueues { jobId }, and publishes SUCCESS', async () => {
    const user = await registerUser(app, 'PubOk');
    const { project, video } = await completedVideo(app, user.token);
    const account = await mockAccount(user.tenantId, user.workspaceId);
    const idem = `pub-success-${suffix()}`;
    const created = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', idem)
      .send(publishBody(account.id))
      .expect(201);
    expect(created.body.status).toBe('PENDING');
    expect(created.body.publishedAt).toBeNull();
    expect(created.body.externalPostId).toBeNull();
    expect(created.body.platformAccount.credentialRef).toBeUndefined();
    expect(created.body.scenario).toBeUndefined();
    expect(secretKeys(created.body)).toEqual([]);

    const pendingJob = await prisma.job.findFirst({ where: { id: created.body.sourceJobId } });
    expect(pendingJob).toMatchObject({
      kind: JobKind.VIDEO_PUBLISH,
      status: JobStatus.PENDING,
      videoId: video.id,
    });
    expect(pendingJob?.input).toEqual({ publicationId: created.body.id });
    expect(JSON.stringify(pendingJob?.input)).not.toMatch(/storageKey|accessToken|title/);
    expect(queue.enqueued.some((item) => item.jobId === created.body.sourceJobId && Object.keys(item).join() === 'jobId')).toBe(true);

    await processor.process(created.body.sourceJobId);
    const published = await request(app.getHttpServer())
      .get(`/publications/${created.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(published.body.status).toBe('PUBLISHED');
    expect(published.body.externalPostId).toBeTruthy();
    expect(published.body.externalUrl).toMatch(/^mock:\/\//);
    expect(published.body.publishedAt).toBeTruthy();
    expect(secretKeys(published.body)).toEqual([]);

    const doneJob = await prisma.job.findFirst({ where: { id: created.body.sourceJobId } });
    expect(doneJob?.status).toBe(JobStatus.COMPLETED);
    expect(JSON.stringify(doneJob?.output)).not.toMatch(/storageKey|credentialRef|accessToken/);

    const listed = await request(app.getHttpServer())
      .get('/publications')
      .query({ videoId: video.id, projectId: project.id, status: 'PUBLISHED' })
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(listed.body).toHaveLength(1);

    const detail = await request(app.getHttpServer())
      .get(`/videos/${video.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(detail.body.job.id).toBe(video.sourceJobId);
    expect(detail.body.job.kind).toBe('VIDEO_GENERATION');

    const replay = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', idem)
      .send(publishBody(account.id))
      .expect(201);
    expect(replay.body.id).toBe(created.body.id);
    const jobs = await prisma.job.findMany({
      where: { tenantId: user.tenantId, kind: JobKind.VIDEO_PUBLISH, videoId: video.id },
    });
    expect(jobs).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', idem)
      .send(publishBody(account.id, { title: 'Different' }))
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
      });
  });

  it('rejects missing idempotency, Douyin API, scenario, and invalid visibility', async () => {
    const user = await registerUser(app, 'PubVal');
    const { video } = await completedVideo(app, user.token);
    const account = await mockAccount(user.tenantId, user.workspaceId);
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(publishBody(account.id))
      .expect(400)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.IDEMPOTENCY_KEY_REQUIRED));
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `manual-${suffix()}`)
      .send(publishBody(account.id, { mode: 'MANUAL' }))
      .expect(201)
      .expect((res) => {
        expect(res.body.mode).toBe('MANUAL');
        expect(res.body.sourceJobId).toBeNull();
      });
    const douyin = await mockAccount(user.tenantId, user.workspaceId, { platform: Platform.DOUYIN });
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `douyin-${suffix()}`)
      .send(publishBody(douyin.id, { platform: 'DOUYIN' }))
      .expect(501)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.PUBLISHING_PROVIDER_NOT_IMPLEMENTED));
    expect(await prisma.publication.count({ where: { tenantId: user.tenantId, platform: Platform.DOUYIN } })).toBe(0);
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `scen-${suffix()}`)
      .send(publishBody(account.id, { scenario: 'SUCCESS' }))
      .expect(400);
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `vis-${suffix()}`)
      .send(publishBody(account.id, { visibility: 'WORLD' }))
      .expect(400);
  });

  it('enforces tenant/workspace isolation and video/account preconditions', async () => {
    const owner = await registerUser(app, 'PubIsoA');
    const other = await registerUser(app, 'PubIsoB');
    const { video } = await completedVideo(app, owner.token);
    const account = await mockAccount(owner.tenantId, owner.workspaceId);
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${other.token}`)
      .set('x-idempotency-key', `cross-${suffix()}`)
      .send(publishBody(account.id))
      .expect(404);

    const pendingVideo = await prisma.video.create({
      data: {
        tenantId: owner.tenantId,
        workspaceId: owner.workspaceId,
        projectId: video.projectId,
        status: 'PENDING',
      },
    });
    await request(app.getHttpServer())
      .post(`/videos/${pendingVideo.id}/publications`)
      .set('Authorization', `Bearer ${owner.token}`)
      .set('x-idempotency-key', `pend-${suffix()}`)
      .send(publishBody(account.id))
      .expect(409);

    const ws = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'other-ws' })
      .expect(201);
    await prisma.video.update({
      where: { id_tenantId: { id: video.id, tenantId: owner.tenantId } },
      data: { workspaceId: ws.body.id },
    });
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${owner.token}`)
      .set('x-idempotency-key', `ws-${suffix()}`)
      .send(publishBody(account.id))
      .expect(404);
  });

  it('rejects missing output, unready asset, missing storage, inactive account, and platform mismatch', async () => {
    const user = await registerUser(app, 'PubPre');
    const { video } = await completedVideo(app, user.token);
    const account = await mockAccount(user.tenantId, user.workspaceId);
    const stored = await prisma.video.findFirst({ where: { id: video.id } });
    await prisma.video.update({
      where: { id_tenantId: { id: video.id, tenantId: user.tenantId } },
      data: { outputAssetId: null },
    });
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `noout-${suffix()}`)
      .send(publishBody(account.id))
      .expect(409);
    await prisma.video.update({
      where: { id_tenantId: { id: video.id, tenantId: user.tenantId } },
      data: { outputAssetId: stored?.outputAssetId },
    });

    await prisma.asset.update({
      where: { id_tenantId: { id: stored!.outputAssetId!, tenantId: user.tenantId } },
      data: { status: 'FAILED' },
    });
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `asset-${suffix()}`)
      .send(publishBody(account.id))
      .expect(409);
    await prisma.asset.update({
      where: { id_tenantId: { id: stored!.outputAssetId!, tenantId: user.tenantId } },
      data: { status: 'READY' },
    });

    await prisma.asset.update({
      where: { id_tenantId: { id: stored!.outputAssetId!, tenantId: user.tenantId } },
      data: {
        storageKey: buildStorageKey({
          tenantId: user.tenantId,
          workspaceId: user.workspaceId,
          projectId: video.projectId,
          assetId: stored!.outputAssetId!,
        }),
      },
    });
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `stor-${suffix()}`)
      .send(publishBody(account.id))
      .expect(409);

    const inactive = await mockAccount(user.tenantId, user.workspaceId, { status: PlatformAccountStatus.EXPIRED });
    const { video: video2 } = await completedVideo(app, user.token);
    await request(app.getHttpServer())
      .post(`/videos/${video2.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `inact-${suffix()}`)
      .send(publishBody(inactive.id))
      .expect(409)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.PLATFORM_ACCOUNT_INACTIVE));

    const douyin = await mockAccount(user.tenantId, user.workspaceId, { platform: Platform.DOUYIN });
    await request(app.getHttpServer())
      .post(`/videos/${video2.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `mm-${suffix()}`)
      .send(publishBody(douyin.id, { platform: 'MOCK' }))
      .expect(400)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.PUBLISH_PLATFORM_MISMATCH));
  });

  it('maps PROCESSING then reconciles to PUBLISHED without a second publish', async () => {
    const user = await registerUser(app, 'PubProc');
    const { video } = await completedVideo(app, user.token);
    const account = await mockAccount(user.tenantId, user.workspaceId);
    const created = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `proc-${suffix()}`)
      .send(publishBody(account.id))
      .expect(201);
    mockPublisher.configureScenario(created.body.id, 'PROCESSING');
    await processor.process(created.body.sourceJobId);
    const row = await prisma.publication.findFirst({ where: { id: created.body.id } });
    expect(row?.status).toBe(PublicationStatus.PUBLISHED);
    expect(row?.publishedAt).toBeTruthy();
    expect(mockPublisher.getPublishAttempts(created.body.id)).toBe(1);
    const job = await prisma.job.findFirst({ where: { id: created.body.sourceJobId } });
    expect(job?.status).toBe(JobStatus.COMPLETED);
    expect((job?.output as { platformStatus?: string }).platformStatus).toBe('PROCESSING');
  });

  it('maps VALIDATION_FAILURE to FAILED permanent and rejects retry', async () => {
    const user = await registerUser(app, 'PubValF');
    const { video } = await completedVideo(app, user.token);
    const account = await mockAccount(user.tenantId, user.workspaceId);
    const created = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `valf-${suffix()}`)
      .send(publishBody(account.id))
      .expect(201);
    mockPublisher.configureScenario(created.body.id, 'VALIDATION_FAILURE');
    await processor.process(created.body.sourceJobId);
    const body = await request(app.getHttpServer())
      .get(`/publications/${created.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(body.body.status).toBe('FAILED');
    expect(body.body.retryClass).toBe('PERMANENT');
    expect(body.body.externalPostId).toBeNull();
    const job = await prisma.job.findFirst({ where: { id: created.body.sourceJobId } });
    expect(job?.status).toBe(JobStatus.FAILED);
    await request(app.getHttpServer())
      .post(`/publications/${created.body.id}/retry`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `retry-perm-${suffix()}`)
      .expect(409)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.PUBLICATION_RETRY_NOT_ALLOWED));
  });

  it('retries UPLOAD_FAILURE on the same publication with a new job until SUCCESS', async () => {
    const user = await registerUser(app, 'PubUp');
    const { video } = await completedVideo(app, user.token);
    const account = await mockAccount(user.tenantId, user.workspaceId);
    const created = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `up-${suffix()}`)
      .send(publishBody(account.id))
      .expect(201);
    const firstJobId = created.body.sourceJobId as string;
    mockPublisher.configureScenario(created.body.id, 'UPLOAD_FAILURE');
    await processor.process(firstJobId);
    const failed = await request(app.getHttpServer())
      .get(`/publications/${created.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(failed.body.status).toBe('FAILED');
    expect(failed.body.retryClass).toBe('SAFE_TO_RETRY');

    mockPublisher.configureScenario(created.body.id, 'SUCCESS');
    const retryKey = `retry-up-${suffix()}`;
    const retried = await request(app.getHttpServer())
      .post(`/publications/${created.body.id}/retry`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', retryKey)
      .expect(200);
    expect(retried.body.id).toBe(created.body.id);
    expect(retried.body.sourceJobId).not.toBe(firstJobId);
    expect(retried.body.status).toBe('PENDING');
    const replay = await request(app.getHttpServer())
      .post(`/publications/${created.body.id}/retry`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', retryKey)
      .expect(200);
    expect(replay.body.sourceJobId).toBe(retried.body.sourceJobId);

    await processor.process(retried.body.sourceJobId);
    const published = await prisma.publication.findFirst({ where: { id: created.body.id } });
    expect(published?.status).toBe(PublicationStatus.PUBLISHED);
    expect(published?.publishedAt).toBeTruthy();
    expect(await prisma.job.count({ where: { tenantId: user.tenantId, videoId: video.id, kind: JobKind.VIDEO_PUBLISH } })).toBe(2);
  });

  it('maps UNKNOWN without fake externalPostId, rejects retry, and does not republish on replay', async () => {
    const user = await registerUser(app, 'PubUnk');
    const { video } = await completedVideo(app, user.token);
    const account = await mockAccount(user.tenantId, user.workspaceId);
    const created = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `unk-${suffix()}`)
      .send(publishBody(account.id))
      .expect(201);
    mockPublisher.configureScenario(created.body.id, 'UNKNOWN_AFTER_SUBMIT');
    await processor.process(created.body.sourceJobId);
    const row = await prisma.publication.findFirst({ where: { id: created.body.id } });
    expect(row?.status).toBe(PublicationStatus.UNKNOWN_EXTERNAL_STATE);
    expect(row?.externalPostId).toBeNull();
    expect(row?.publishedAt).toBeNull();
    expect(row?.providerUploadId).toBeTruthy();
    const job = await prisma.job.findFirst({ where: { id: created.body.sourceJobId } });
    expect(job?.status).toBe(JobStatus.COMPLETED);
    expect(mockPublisher.getPublishAttempts(created.body.id)).toBe(1);

    await request(app.getHttpServer())
      .post(`/publications/${created.body.id}/retry`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `retry-unk-${suffix()}`)
      .expect(409);

    await prisma.job.update({
      where: { id: created.body.sourceJobId },
      data: { status: JobStatus.PENDING, completedAt: null, lockedAt: null, lastHeartbeatAt: null },
    });
    await processor.process(created.body.sourceJobId);
    expect(mockPublisher.getPublishAttempts(created.body.id)).toBe(1);
    const again = await prisma.publication.findFirst({ where: { id: created.body.id } });
    expect(again?.status).toBe(PublicationStatus.UNKNOWN_EXTERNAL_STATE);
    expect(again?.externalPostId).toBeNull();
  });

  it('skips a superseded job without calling the provider', async () => {
    const user = await registerUser(app, 'PubSup');
    const { video } = await completedVideo(app, user.token);
    const account = await mockAccount(user.tenantId, user.workspaceId);
    const created = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `sup-${suffix()}`)
      .send(publishBody(account.id))
      .expect(201);
    const oldJobId = created.body.sourceJobId as string;
    const newer = await prisma.job.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        projectId: video.projectId,
        kind: JobKind.VIDEO_PUBLISH,
        status: JobStatus.PENDING,
        requestId: `newer-${suffix()}`,
        videoId: video.id,
        input: { publicationId: created.body.id },
      },
    });
    await prisma.publication.update({
      where: { id_tenantId: { id: created.body.id, tenantId: user.tenantId } },
      data: { sourceJobId: newer.id },
    });
    const result = await processor.process(oldJobId);
    expect(result.status).toBe('skipped');
    expect(mockPublisher.getPublishAttempts(created.body.id)).toBe(0);
    const old = await prisma.job.findFirst({ where: { id: oldJobId } });
    expect(old?.status).toBe(JobStatus.CANCELLED);
  });

  it('allows EDITOR write and forbids VIEWER write while allowing authenticated read', async () => {
    const owner = await registerUser(app, 'PubPerm');
    const { video } = await completedVideo(app, owner.token);
    const account = await mockAccount(owner.tenantId, owner.workspaceId);
    await prisma.membership.updateMany({
      where: { userId: owner.userId, tenantId: owner.tenantId },
      data: { role: 'EDITOR' },
    });
    const editorLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: owner.email, password: 'password1' })
      .expect(201);
    const editorToken = editorLogin.body.accessToken as string;
    const created = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${editorToken}`)
      .set('x-idempotency-key', `ed-${suffix()}`)
      .send(publishBody(account.id))
      .expect(201);
    await processor.process(created.body.sourceJobId);

    await prisma.membership.updateMany({
      where: { userId: owner.userId, tenantId: owner.tenantId },
      data: { role: 'VIEWER' },
    });
    const viewerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: owner.email, password: 'password1' })
      .expect(201);
    const viewerToken = viewerLogin.body.accessToken as string;
    await request(app.getHttpServer())
      .get(`/publications/${created.body.id}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/publications/${created.body.id}/retry`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .set('x-idempotency-key', `view-${suffix()}`)
      .expect(403);
  });

  it('returns 404 for another tenant publication', async () => {
    const a = await registerUser(app, 'PubTenA');
    const b = await registerUser(app, 'PubTenB');
    const { video } = await completedVideo(app, a.token);
    const account = await mockAccount(a.tenantId, a.workspaceId);
    const created = await request(app.getHttpServer())
      .post(`/videos/${video.id}/publications`)
      .set('Authorization', `Bearer ${a.token}`)
      .set('x-idempotency-key', `ten-${suffix()}`)
      .send(publishBody(account.id))
      .expect(201);
    await request(app.getHttpServer())
      .get(`/publications/${created.body.id}`)
      .set('Authorization', `Bearer ${b.token}`)
      .expect(404);
  });
});

describe('Publication enqueue failure (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let mockPublisher: MockPublishingProvider;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-pub-enq-${process.pid}`);
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    process.env.MEDIA_COMPOSE_PROVIDER = 'mock';
    process.env.MEDIA_IMAGE_PROVIDER = 'color-background';
    delete process.env.AI_ENGINE_URL;
    delete process.env.MODEL_API_KEY;
    delete process.env.RUN_REDIS_TESTS;
    const databaseUrl = await startTestDatabase();
    process.env.DATABASE_URL = databaseUrl;
    migrateDeploy(databaseUrl);
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JOB_QUEUE)
      .useValue({
        enqueue: async () => {
          throw new Error('redis down');
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    mockPublisher = app.get(MockPublishingProvider);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('fails Publication and Job with JOB_ENQUEUE_FAILED and never calls the provider', async () => {
    const email = `enq-${suffix()}@example.com`;
    const userRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password1', name: 'EnqPub' })
      .expect(201);
    const token = userRes.body.accessToken as string;
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'enq' })
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
    const video = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${token}`)
      .send({ scriptId: script.body.id })
      .expect(503);
    expect(video.body.code).toBe(ErrorCode.JOB_ENQUEUE_FAILED);

    const completedSetup = await prisma.video.findFirst({
      where: { tenantId: userRes.body.tenant.id, scriptId: script.body.id },
    });
    expect(completedSetup).toBeTruthy();
    await prisma.video.update({
      where: { id_tenantId: { id: completedSetup!.id, tenantId: userRes.body.tenant.id } },
      data: { status: 'COMPLETED' },
    });
    const assetId = randomUUID();
    const storageKey = buildStorageKey({
      tenantId: userRes.body.tenant.id,
      workspaceId: userRes.body.workspace.id,
      projectId: project.body.id,
      assetId,
    });
    const asset = await prisma.asset.create({
      data: {
        id: assetId,
        tenantId: userRes.body.tenant.id,
        workspaceId: userRes.body.workspace.id,
        projectId: project.body.id,
        type: 'VIDEO',
        status: 'READY',
        storageProvider: 'local',
        storageKey,
        mimeType: 'video/mp4',
        size: 12,
      },
    });
    await prisma.video.update({
      where: { id_tenantId: { id: completedSetup!.id, tenantId: userRes.body.tenant.id } },
      data: { outputAssetId: asset.id },
    });
    await prisma.assetLink.create({
      data: {
        tenantId: userRes.body.tenant.id,
        workspaceId: userRes.body.workspace.id,
        projectId: project.body.id,
        assetId: asset.id,
        videoId: completedSetup!.id,
        role: 'VIDEO_OUTPUT',
      },
    });
    const storage = app.get(StorageService);
    await storage.put(asset.storageKey, Buffer.from('mock-mp4'), { mimeType: 'video/mp4' });
    const account = await prisma.platformAccount.create({
      data: {
        tenantId: userRes.body.tenant.id,
        workspaceId: userRes.body.workspace.id,
        platform: Platform.MOCK,
        externalAccountId: `enq-${suffix()}`,
        displayName: 'Mock',
        status: PlatformAccountStatus.ACTIVE,
        credentialRef: randomUUID(),
        connectedAt: new Date(),
      },
    });
    await request(app.getHttpServer())
      .post(`/videos/${completedSetup!.id}/publications`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `enq-pub-${suffix()}`)
      .send({
        platformAccountId: account.id,
        platform: 'MOCK',
        mode: 'API',
        title: 'enqueue fail',
        visibility: 'PUBLIC',
      })
      .expect(503)
      .expect((res) => expect(res.body.code).toBe(ErrorCode.JOB_ENQUEUE_FAILED));
    const publication = await prisma.publication.findFirst({
      where: { tenantId: userRes.body.tenant.id, videoId: completedSetup!.id },
    });
    expect(publication?.status).toBe(PublicationStatus.FAILED);
    expect(publication?.errorCode).toBe(ErrorCode.JOB_ENQUEUE_FAILED);
    const job = await prisma.job.findFirst({
      where: { tenantId: userRes.body.tenant.id, kind: JobKind.VIDEO_PUBLISH },
    });
    expect(job?.status).toBe(JobStatus.FAILED);
    expect((job?.error as { code?: string } | null)?.code).toBe(ErrorCode.JOB_ENQUEUE_FAILED);
    expect(mockPublisher.getPublishAttempts(publication!.id)).toBe(0);
  });
});
