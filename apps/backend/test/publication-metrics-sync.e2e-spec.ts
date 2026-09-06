import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  JobKind,
  JobStatus,
  MembershipRole,
  MetricSource,
  Platform,
  PrismaClient,
  PublicationMode,
  PublicationStatus,
} from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  migrateDeploy,
  startTestDatabase,
  stopTestDatabase,
} from '../../../database/test/harness.ts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AppError, ErrorCode } from '../src/common/errors/app-error.js';
import { JobProcessor } from '../src/jobs/job.processor.js';
import { JOB_QUEUE } from '../src/jobs/queue/queue.constants.js';
import { InMemoryJobQueue } from '../src/jobs/queue/in-memory-job.queue.js';
import { apiCollectionKey } from '../src/metrics/api-metrics.constants.js';
import { MockMetricsProvider } from '../src/metrics/mock-metrics.provider.js';
import { PlatformMetricsProviderRegistry } from '../src/metrics/metrics-provider.registry.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function registerUser(app: INestApplication, name = 'SyncOwner') {
  const email = `${name.toLowerCase()}-${suffix()}@example.com`;
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'password1', name })
    .expect(201);
  return {
    token: res.body.accessToken as string,
    tenantId: res.body.tenant.id as string,
    workspaceId: res.body.workspace.id as string,
    userId: res.body.user.id as string,
    email,
  };
}

async function login(app: INestApplication, email: string) {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'password1' })
    .expect(201);
  return res.body.accessToken as string;
}

async function seedPublication(
  prisma: PrismaClient,
  user: { tenantId: string; workspaceId: string; userId: string },
  opts: {
    platform?: Platform;
    status?: PublicationStatus;
    publishedAt?: Date | null;
    externalPostId?: string | null;
    externalUrl?: string | null;
  } = {},
) {
  const tag = suffix();
  const project = await prisma.project.create({
    data: { tenantId: user.tenantId, workspaceId: user.workspaceId, name: `Sync ${tag}` },
  });
  const video = await prisma.video.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: project.id,
      status: 'COMPLETED',
    },
  });
  const status = opts.status ?? PublicationStatus.PUBLISHED;
  const publishedAt =
    opts.publishedAt !== undefined
      ? opts.publishedAt
      : status === PublicationStatus.PUBLISHED
        ? new Date('2026-08-01T00:00:00.000Z')
        : null;
  const publication = await prisma.publication.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: project.id,
      videoId: video.id,
      platform: opts.platform ?? Platform.MOCK,
      mode: PublicationMode.API,
      status,
      title: `Sync ${tag}`,
      visibility: 'PUBLIC',
      publishedAt,
      externalPostId: opts.externalPostId === undefined ? `ext-${tag}` : opts.externalPostId,
      externalUrl: opts.externalUrl ?? null,
      idempotencyKey: `idem-sync-${tag}`,
      createdByUserId: user.userId,
    },
  });
  return { project, video, publication };
}

function postSync(app: INestApplication, token: string, publicationId: string, key = `sync-${suffix()}${suffix()}`) {
  return request(app.getHttpServer())
    .post(`/publications/${publicationId}/metrics/sync`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-idempotency-key', key)
    .send({});
}

describe('Mock metrics sync pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let queue: InMemoryJobQueue;
  let processor: JobProcessor;
  let mockMetrics: MockMetricsProvider;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-metrics-sync-${process.pid}`);
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
    queue = app.get(JOB_QUEUE) as InMemoryJobQueue;
    processor = app.get(JobProcessor);
    mockMetrics = app.get(MockMetricsProvider);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('creates a PENDING metrics job, enqueues only jobId, and completes via MOCK provider', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const queuedBefore = queue.enqueued.length;
    const callsBefore = mockMetrics.getCallCount(publication.id);

    const created = await postSync(app, user.token, publication.id).expect(201);
    expect(created.body.job.kind).toBe(JobKind.PUBLICATION_METRICS_SYNC);
    expect(created.body.job.status).toBe(JobStatus.PENDING);
    expect(created.body.job.input).toEqual({ publicationId: publication.id });
    expect(created.body.job.videoId).toBe(publication.videoId);
    expect(queue.enqueued.slice(queuedBefore)).toEqual([{ jobId: created.body.job.id }]);
    expect(mockMetrics.getCallCount(publication.id)).toBe(callsBefore);
    expect(
      await prisma.publicationMetricSnapshot.count({
        where: { publicationId: publication.id, tenantId: user.tenantId },
      }),
    ).toBe(0);

    const processed = await processor.process(created.body.job.id);
    expect(processed).toEqual({ status: 'completed' });
    const job = await prisma.job.findFirstOrThrow({ where: { id: created.body.job.id, tenantId: user.tenantId } });
    expect(job.status).toBe(JobStatus.COMPLETED);
    expect(job.attempt).toBe(1);
    expect(job.lockedAt).toBeNull();
    expect(job.lastHeartbeatAt).toBeTruthy();
    expect(mockMetrics.getCallCount(publication.id)).toBe(callsBefore + 1);
    const call = mockMetrics.getCalls().find((row) => row.publicationId === publication.id);
    expect(call?.externalPostId).toBe(publication.externalPostId);
    expect(JSON.stringify(call)).not.toMatch(/accessToken|refreshToken|token/i);

    const snapshot = await prisma.publicationMetricSnapshot.findFirstOrThrow({
      where: { publicationId: publication.id, tenantId: user.tenantId, source: MetricSource.API },
    });
    expect(snapshot.provider).toBe('MOCK');
    expect(snapshot.platform).toBe(Platform.MOCK);
    expect(snapshot.sourceJobId).toBe(job.id);
    expect(snapshot.collectionKey).toBe(apiCollectionKey(job.id));
    expect(snapshot.views).toBeGreaterThan(0);
    expect((job.output as { metricsSync?: { snapshotId?: string } }).metricsSync?.snapshotId).toBe(snapshot.id);
    expect(JSON.stringify(job.output)).not.toMatch(/accessToken|rawResponse|credentialRef/i);
    expect(JSON.stringify(snapshot.providerMetadata)).not.toMatch(/accessToken|credentialRef/i);
  });

  it('replays the same idempotency key without a second job or enqueue', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const key = `same-sync-${suffix()}${suffix()}`;
    const queuedBefore = queue.enqueued.length;
    const first = await postSync(app, user.token, publication.id, key).expect(201);
    const retry = await postSync(app, user.token, publication.id, key).expect(201);
    expect(retry.body.job.id).toBe(first.body.job.id);
    expect(queue.enqueued.length).toBe(queuedBefore + 1);
    expect(
      await prisma.job.count({
        where: { tenantId: user.tenantId, kind: JobKind.PUBLICATION_METRICS_SYNC, requestId: key },
      }),
    ).toBe(1);
  });

  it('conflicts when the same key is reused for a different publication', async () => {
    const user = await registerUser(app);
    const a = await seedPublication(prisma, user);
    const b = await seedPublication(prisma, user);
    const key = `conflict-sync-${suffix()}${suffix()}`;
    await postSync(app, user.token, a.publication.id, key).expect(201);
    await postSync(app, user.token, b.publication.id, key).expect(409).expect({
      code: ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
      message: 'Idempotency key was reused with a different request',
    });
  });

  it('rejects MEMBER/VIEWER writes, allows read, and 404s across tenants', async () => {
    const owner = await registerUser(app, 'SyncTenA');
    const other = await registerUser(app, 'SyncTenB');
    const { publication } = await seedPublication(prisma, owner);
    await postSync(app, other.token, publication.id).expect(404);

    await prisma.membership.updateMany({
      where: { userId: owner.userId, tenantId: owner.tenantId },
      data: { role: MembershipRole.MEMBER },
    });
    const memberToken = await login(app, owner.email);
    await postSync(app, memberToken, publication.id).expect(403);
    await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    await prisma.membership.updateMany({
      where: { userId: owner.userId, tenantId: owner.tenantId },
      data: { role: MembershipRole.VIEWER },
    });
    const viewerToken = await login(app, owner.email);
    await postSync(app, viewerToken, publication.id).expect(403);
  });

  it('enforces PUBLISHED, publishedAt, externalPostId and MOCK-only provider support', async () => {
    const user = await registerUser(app);
    const pending = await seedPublication(prisma, user, { status: PublicationStatus.PENDING });
    await postSync(app, user.token, pending.publication.id).expect(409);
    const noPublishedAt = await seedPublication(prisma, user, {
      status: PublicationStatus.PUBLISHED,
      publishedAt: null,
    });
    await postSync(app, user.token, noPublishedAt.publication.id).expect(409);
    const urlOnly = await seedPublication(prisma, user, {
      externalPostId: null,
      externalUrl: 'https://example.com/post',
    });
    await postSync(app, user.token, urlOnly.publication.id).expect(400).expect({
      code: ErrorCode.PUBLICATION_METRICS_EXTERNAL_ID_REQUIRED,
      message: 'API metrics sync requires externalPostId',
    });
    const douyin = await seedPublication(prisma, user, { platform: Platform.DOUYIN });
    await postSync(app, user.token, douyin.publication.id).expect(501);
    const tiktok = await seedPublication(prisma, user, { platform: Platform.TIKTOK });
    await postSync(app, user.token, tiktok.publication.id).expect(501);
    const registry = app.get(PlatformMetricsProviderRegistry);
    expect(registry.resolve(Platform.MOCK).platform).toBe(Platform.MOCK);
    expect(() => registry.resolve(Platform.YOUTUBE)).toThrow(AppError);
    expect(() => registry.resolve(Platform.XIAOHONGSHU)).toThrow(AppError);
  });

  it('rejects extra client fields on sync', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    await request(app.getHttpServer())
      .post(`/publications/${publication.id}/metrics/sync`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `extra-${suffix()}${suffix()}`)
      .send({ views: 1, accessToken: 'nope', platform: 'MOCK' })
      .expect(400);
  });

  it('keeps PARTIAL nulls and ZERO zeros, and fail-closes invalid/temporary/permanent without snapshots', async () => {
    const user = await registerUser(app);
    const partialPub = await seedPublication(prisma, user);
    mockMetrics.configureScenario(partialPub.publication.id, 'PARTIAL');
    const partialJob = await postSync(app, user.token, partialPub.publication.id).expect(201);
    await processor.process(partialJob.body.job.id);
    const partial = await prisma.publicationMetricSnapshot.findFirstOrThrow({
      where: { publicationId: partialPub.publication.id, tenantId: user.tenantId },
    });
    expect(partial.views).toBe(1000);
    expect(partial.likes).toBe(50);
    expect(partial.comments).toBeNull();
    expect(partial.completionRate).toBeNull();

    const zeroPub = await seedPublication(prisma, user);
    mockMetrics.configureScenario(zeroPub.publication.id, 'ZERO');
    const zeroJob = await postSync(app, user.token, zeroPub.publication.id).expect(201);
    await processor.process(zeroJob.body.job.id);
    const zero = await prisma.publicationMetricSnapshot.findFirstOrThrow({
      where: { publicationId: zeroPub.publication.id, tenantId: user.tenantId },
    });
    expect(zero.views).toBe(0);
    expect(zero.likes).toBe(0);
    expect(zero.completionRate?.toNumber()).toBe(0);

    for (const [scenario, code] of [
      ['INVALID_RESPONSE', ErrorCode.METRICS_PROVIDER_INVALID_RESPONSE],
      ['TEMPORARY_FAILURE', ErrorCode.METRICS_PROVIDER_TEMPORARY_FAILURE],
      ['PERMANENT_FAILURE', ErrorCode.METRICS_PROVIDER_PERMANENT_FAILURE],
    ] as const) {
      const seeded = await seedPublication(prisma, user);
      mockMetrics.configureScenario(seeded.publication.id, scenario);
      const created = await postSync(app, user.token, seeded.publication.id).expect(201);
      const result = await processor.process(created.body.job.id);
      expect(result.status).toBe('failed');
      const job = await prisma.job.findFirstOrThrow({ where: { id: created.body.job.id } });
      expect(job.status).toBe(JobStatus.FAILED);
      expect((job.error as { code?: string }).code).toBe(code);
      expect(JSON.stringify(job.error)).not.toMatch(/accessToken|raw body|stack/i);
      expect(
        await prisma.publicationMetricSnapshot.count({
          where: { publicationId: seeded.publication.id, tenantId: user.tenantId },
        }),
      ).toBe(0);
    }
  });

  it('skips a second provider call when the Job snapshot already exists', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const created = await postSync(app, user.token, publication.id).expect(201);
    await processor.process(created.body.job.id);
    const calls = mockMetrics.getCallCount(publication.id);
    await prisma.job.update({
      where: { id: created.body.job.id },
      data: { status: JobStatus.PENDING, lockedAt: null, lastHeartbeatAt: null, completedAt: null, progress: 0 },
    });
    const again = await processor.process(created.body.job.id);
    expect(again).toEqual({ status: 'completed' });
    expect(mockMetrics.getCallCount(publication.id)).toBe(calls);
    expect(
      await prisma.publicationMetricSnapshot.count({
        where: { publicationId: publication.id, tenantId: user.tenantId, source: MetricSource.API },
      }),
    ).toBe(1);
  });

  it('fails enqueue without calling the provider or writing a snapshot', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const callsBefore = mockMetrics.getCallCount(publication.id);
    const spy = vi.spyOn(queue, 'enqueue').mockRejectedValueOnce(new AppError(ErrorCode.JOB_ENQUEUE_FAILED));
    const res = await postSync(app, user.token, publication.id).expect(503);
    expect(res.body.code).toBe(ErrorCode.JOB_ENQUEUE_FAILED);
    spy.mockRestore();
    const job = await prisma.job.findFirst({
      where: { tenantId: user.tenantId, kind: JobKind.PUBLICATION_METRICS_SYNC, videoId: publication.videoId },
      orderBy: { createdAt: 'desc' },
    });
    expect(job?.status).toBe(JobStatus.FAILED);
    expect((job?.error as { code?: string }).code).toBe(ErrorCode.JOB_ENQUEUE_FAILED);
    expect(mockMetrics.getCallCount(publication.id)).toBe(callsBefore);
    expect(
      await prisma.publicationMetricSnapshot.count({
        where: { publicationId: publication.id, tenantId: user.tenantId },
      }),
    ).toBe(0);
  });

  it('returns MANUAL and API snapshots together and picks latest by observedAt', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    await request(app.getHttpServer())
      .post(`/publications/${publication.id}/metrics/manual`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `manual-${suffix()}${suffix()}`)
      .send({ views: 9, observedAt: '2026-08-03T10:00:00.000Z' })
      .expect(201);
    mockMetrics.configureScenario(publication.id, 'PARTIAL');
    const sync = await postSync(app, user.token, publication.id).expect(201);
    await processor.process(sync.body.job.id);
    const list = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const sources = list.body.items.map((row: { source: string }) => row.source);
    expect(sources).toEqual(expect.arrayContaining(['MANUAL', 'API']));
    const latest = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/latest`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(['MANUAL', 'API']).toContain(latest.body.snapshot.source);
    const newest = list.body.items[0];
    expect(latest.body.snapshot.id).toBe(newest.id);
  });

  it('does not fall back generation or publish routing for metrics jobs', async () => {
    const user = await registerUser(app);
    const { project, video } = await seedPublication(prisma, user);
    const unsupported = await prisma.job.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        projectId: project.id,
        kind: JobKind.MOVIE_EDITING,
        status: JobStatus.PENDING,
        requestId: `unsup-${suffix()}`,
        videoId: video.id,
      },
    });
    const result = await processor.process(unsupported.id);
    expect(result).toEqual({ status: 'failed', reason: 'unsupported' });
  });
});
