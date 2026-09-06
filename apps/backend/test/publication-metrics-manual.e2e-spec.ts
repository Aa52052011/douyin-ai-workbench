import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MembershipRole,
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
import { ErrorCode } from '../src/common/errors/app-error.js';
import { JOB_QUEUE } from '../src/jobs/queue/queue.constants.js';
import { InMemoryJobQueue } from '../src/jobs/queue/in-memory-job.queue.js';
import { PlatformMetricsProviderRegistry } from '../src/metrics/metrics-provider.registry.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function registerUser(app: INestApplication, name = 'MetricsOwner') {
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
    mode?: PublicationMode;
    platform?: Platform;
    status?: PublicationStatus;
    publishedAt?: Date | null;
  } = {},
) {
  const tag = suffix();
  const project = await prisma.project.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      name: `Metrics ${tag}`,
    },
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
      platform: opts.platform ?? Platform.DOUYIN,
      mode: opts.mode ?? PublicationMode.MANUAL,
      status,
      title: `Pub ${tag}`,
      visibility: 'PUBLIC',
      publishedAt,
      idempotencyKey: `idem-metrics-${tag}`,
      createdByUserId: user.userId,
    },
  });
  return { project, video, publication };
}

function postManual(
  app: INestApplication,
  token: string,
  publicationId: string,
  body: Record<string, unknown>,
  key = `metrics-${suffix()}${suffix()}`,
) {
  return request(app.getHttpServer())
    .post(`/publications/${publicationId}/metrics/manual`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-idempotency-key', key)
    .send(body);
}

describe('Manual publication metrics API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let queue: InMemoryJobQueue;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-manual-metrics-${process.pid}`);
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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('creates MANUAL metrics for a MANUAL Publication without account, OAuth or externalPostId', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user, { mode: PublicationMode.MANUAL });
    const jobsBefore = await prisma.job.count();
    const queuedBefore = queue.enqueued.length;
    const analyticsBefore = await prisma.analytics.count();
    const registry = app.get(PlatformMetricsProviderRegistry);
    const resolveSpy = vi.spyOn(registry, 'resolve');

    const res = await postManual(app, user.token, publication.id, {
      views: 100,
      likes: 0,
      completionRate: 0.63,
      averageWatchTimeSeconds: 12.345,
    }).expect(201);

    expect(res.body).toMatchObject({
      publicationId: publication.id,
      platform: Platform.DOUYIN,
      source: 'MANUAL',
      provider: 'MANUAL',
      views: 100,
      likes: 0,
      comments: null,
      shares: null,
      favorites: null,
      newFollowers: null,
      completionRate: 0.63,
      averageWatchTimeSeconds: 12.345,
      providerCollectedAt: null,
    });
    expect(typeof res.body.completionRate).toBe('number');
    expect(typeof res.body.averageWatchTimeSeconds).toBe('number');
    expect(res.body).not.toHaveProperty('collectionKey');
    expect(res.body).not.toHaveProperty('sourceJobId');
    expect(res.body).not.toHaveProperty('providerMetadata');
    expect(res.body).not.toHaveProperty('tenantId');
    expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken|credentialRef|secret/i);

    const stored = await prisma.publicationMetricSnapshot.findFirstOrThrow({
      where: { id: res.body.id, tenantId: user.tenantId },
    });
    expect(stored.source).toBe('MANUAL');
    expect(stored.provider).toBe('MANUAL');
    expect(stored.sourceJobId).toBeNull();
    expect(stored.providerMetadata).toEqual({});
    expect(stored.collectionKey).toMatch(/^manual:/);
    expect(stored.platform).toBe(Platform.DOUYIN);
    expect(stored.likes).toBe(0);
    expect(stored.comments).toBeNull();

    expect(await prisma.job.count()).toBe(jobsBefore);
    expect(queue.enqueued.length).toBe(queuedBefore);
    expect(await prisma.analytics.count()).toBe(analyticsBefore);
    expect(resolveSpy).not.toHaveBeenCalled();
    resolveSpy.mockRestore();
  });

  it('creates MANUAL metrics for an API Publication', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user, {
      mode: PublicationMode.API,
      platform: Platform.MOCK,
    });
    const res = await postManual(app, user.token, publication.id, { views: 7 }).expect(201);
    expect(res.body.platform).toBe(Platform.MOCK);
    expect(res.body.source).toBe('MANUAL');
    expect(res.body.views).toBe(7);
  });

  it('rejects empty, all-null, invalid counts, completionRate bounds and extra client fields', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const id = publication.id;
    await postManual(app, user.token, id, {}).expect(400).expect({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'At least one metric is required',
    });
    await postManual(app, user.token, id, {
      views: null,
      likes: null,
      comments: null,
      shares: null,
      favorites: null,
      averageWatchTimeSeconds: null,
      completionRate: null,
      newFollowers: null,
    }).expect(400);
    await postManual(app, user.token, id, { views: 1.5 }).expect(400);
    await postManual(app, user.token, id, { likes: -1 }).expect(400);
    await postManual(app, user.token, id, { comments: 2147483648 }).expect(400);
    await postManual(app, user.token, id, { completionRate: -0.01 }).expect(400);
    await postManual(app, user.token, id, { completionRate: 1.01 }).expect(400);
    await postManual(app, user.token, id, { completionRate: 63 }).expect(400);
    await postManual(app, user.token, id, { averageWatchTimeSeconds: -1 }).expect(400);
    await postManual(app, user.token, id, { views: 1, platform: 'DOUYIN' }).expect(400);
    await postManual(app, user.token, id, { views: 1, source: 'MANUAL' }).expect(400);
    await postManual(app, user.token, id, { views: 1, collectionKey: 'x' }).expect(400);
    await postManual(app, user.token, id, { views: 1, accessToken: 'nope' }).expect(400);
    await postManual(app, user.token, id, { views: 0, likes: 0, completionRate: 0 }).expect(201);
  });

  it('validates observedAt against publishedAt and clock skew', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user, {
      publishedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    const omitted = await postManual(app, user.token, publication.id, { views: 1 }).expect(201);
    expect(new Date(omitted.body.observedAt).getTime()).toBeGreaterThan(
      new Date(publication.publishedAt!).getTime(),
    );
    await postManual(app, user.token, publication.id, {
      views: 2,
      observedAt: '2026-07-31T23:59:59.000Z',
    }).expect(400);
    await postManual(app, user.token, publication.id, {
      views: 3,
      observedAt: '2035-01-01T00:00:00.000Z',
    }).expect(400);
    const historical = await postManual(app, user.token, publication.id, {
      views: 4,
      observedAt: '2026-08-02T08:00:00.000Z',
    }).expect(201);
    expect(historical.body.observedAt).toBe('2026-08-02T08:00:00.000Z');
  });

  it('replays the same idempotency key without creating a second snapshot', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const key = `same-body-${suffix()}${suffix()}`;
    const first = await postManual(app, user.token, publication.id, { views: 11, likes: 2 }, key).expect(201);
    const retry = await postManual(app, user.token, publication.id, { views: 11, likes: 2 }, key).expect(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(retry.body.observedAt).toBe(first.body.observedAt);
    expect(
      await prisma.publicationMetricSnapshot.count({
        where: { publicationId: publication.id, tenantId: user.tenantId },
      }),
    ).toBe(1);
  });

  it('keeps omitted observedAt stable across retries', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const key = `omit-now-${suffix()}${suffix()}`;
    const first = await postManual(app, user.token, publication.id, { views: 5 }, key).expect(201);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const retry = await postManual(app, user.token, publication.id, { views: 5 }, key).expect(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(retry.body.observedAt).toBe(first.body.observedAt);
  });

  it('conflicts when the same key is reused with different metrics', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const key = `conflict-${suffix()}${suffix()}`;
    await postManual(app, user.token, publication.id, { views: 10 }, key).expect(201);
    await postManual(app, user.token, publication.id, { views: 999 }, key)
      .expect(409)
      .expect({
        code: ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
        message: 'Idempotency key was reused with a different request',
      });
    expect(
      await prisma.publicationMetricSnapshot.count({
        where: { publicationId: publication.id, tenantId: user.tenantId },
      }),
    ).toBe(1);
  });

  it('allows the same idempotency key on a different publication', async () => {
    const user = await registerUser(app);
    const a = await seedPublication(prisma, user);
    const b = await seedPublication(prisma, user);
    const key = `shared-${suffix()}${suffix()}`;
    const first = await postManual(app, user.token, a.publication.id, { views: 1 }, key).expect(201);
    const second = await postManual(app, user.token, b.publication.id, { views: 1 }, key).expect(201);
    expect(first.body.id).not.toBe(second.body.id);
  });

  it('collapses concurrent identical requests to one snapshot', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const key = `concurrent-${suffix()}${suffix()}`;
    const [a, b] = await Promise.all([
      postManual(app, user.token, publication.id, { views: 42 }, key),
      postManual(app, user.token, publication.id, { views: 42 }, key),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(
      await prisma.publicationMetricSnapshot.count({
        where: { publicationId: publication.id, tenantId: user.tenantId },
      }),
    ).toBe(1);
  });

  it('rejects manual metrics unless the publication is PUBLISHED with publishedAt', async () => {
    const user = await registerUser(app);
    for (const status of [
      PublicationStatus.PENDING,
      PublicationStatus.FAILED,
      PublicationStatus.CANCELLED,
      PublicationStatus.PROCESSING,
      PublicationStatus.UPLOADING,
      PublicationStatus.SUBMITTING,
      PublicationStatus.UNKNOWN_EXTERNAL_STATE,
    ]) {
      const { publication } = await seedPublication(prisma, user, { status });
      await postManual(app, user.token, publication.id, { views: 1 })
        .expect(409)
        .expect({
          code: ErrorCode.PUBLICATION_METRICS_NOT_AVAILABLE,
          message: 'Metrics snapshots are only available for published publications',
        });
    }
    const missingPublishedAt = await seedPublication(prisma, user, {
      status: PublicationStatus.PUBLISHED,
      publishedAt: null,
    });
    await postManual(app, user.token, missingPublishedAt.publication.id, { views: 1 }).expect(409);
  });

  it('returns 404 across tenants and requires PUBLICATION_CREATE to write', async () => {
    const owner = await registerUser(app, 'MetricsTenA');
    const other = await registerUser(app, 'MetricsTenB');
    const { publication } = await seedPublication(prisma, owner);
    await postManual(app, other.token, publication.id, { views: 1 }).expect(404);
    await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/latest`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);

    await prisma.membership.updateMany({
      where: { userId: owner.userId, tenantId: owner.tenantId },
      data: { role: MembershipRole.EDITOR },
    });
    const editorToken = await login(app, owner.email);
    await postManual(app, editorToken, publication.id, { views: 8 }).expect(201);

    await prisma.membership.updateMany({
      where: { userId: owner.userId, tenantId: owner.tenantId },
      data: { role: MembershipRole.MEMBER },
    });
    const memberToken = await login(app, owner.email);
    await postManual(app, memberToken, publication.id, { views: 9 }).expect(403);
    await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    await prisma.membership.updateMany({
      where: { userId: owner.userId, tenantId: owner.tenantId },
      data: { role: MembershipRole.VIEWER },
    });
    const viewerToken = await login(app, owner.email);
    await postManual(app, viewerToken, publication.id, { views: 9 }).expect(403);
    await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/latest`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
  });

  it('lists timeline newest-first with limit/before and deterministic latest', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const older = await postManual(app, user.token, publication.id, {
      views: 1,
      observedAt: '2026-08-02T00:00:00.000Z',
    }).expect(201);
    const middle = await postManual(app, user.token, publication.id, {
      views: 2,
      observedAt: '2026-08-03T00:00:00.000Z',
    }).expect(201);
    const newest = await postManual(app, user.token, publication.id, {
      views: 3,
      observedAt: '2026-08-04T00:00:00.000Z',
    }).expect(201);

    const emptyLatestUser = await registerUser(app, 'EmptyLatest');
    const emptyPub = await seedPublication(prisma, emptyLatestUser);
    await request(app.getHttpServer())
      .get(`/publications/${emptyPub.publication.id}/metrics/latest`)
      .set('Authorization', `Bearer ${emptyLatestUser.token}`)
      .expect(200)
      .expect({ snapshot: null });

    const latest = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/latest`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(latest.body.snapshot.id).toBe(newest.body.id);
    expect(latest.body.snapshot.views).toBe(3);

    const all = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(all.body.limit).toBe(50);
    expect(all.body.items.map((row: { id: string }) => row.id)).toEqual([
      newest.body.id,
      middle.body.id,
      older.body.id,
    ]);

    const paged = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics`)
      .query({ limit: 1, before: newest.body.observedAt })
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(paged.body.limit).toBe(1);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.items[0].id).toBe(middle.body.id);

    await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics`)
      .query({ limit: 201 })
      .set('Authorization', `Bearer ${user.token}`)
      .expect(400);

    const sameObserved = await seedPublication(prisma, user);
    const t = new Date('2026-08-05T00:00:00.000Z');
    const firstSame = await prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        projectId: sameObserved.project.id,
        publicationId: sameObserved.publication.id,
        platform: Platform.DOUYIN,
        source: 'MANUAL',
        collectionKey: `manual:order-a-${suffix()}`,
        observedAt: t,
        views: 1,
        provider: 'MANUAL',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
    const secondSame = await prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        projectId: sameObserved.project.id,
        publicationId: sameObserved.publication.id,
        platform: Platform.DOUYIN,
        source: 'MANUAL',
        collectionKey: `manual:order-b-${suffix()}`,
        observedAt: t,
        views: 2,
        provider: 'MANUAL',
      },
    });
    const latestSame = await request(app.getHttpServer())
      .get(`/publications/${sameObserved.publication.id}/metrics/latest`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(latestSame.body.snapshot.id).toBe(secondSame.id);
    expect(latestSame.body.snapshot.id).not.toBe(firstSame.id);
  });

  it('does not expose unscoped metrics APIs or PATCH/DELETE snapshots', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    await request(app.getHttpServer()).get('/metrics').set('Authorization', `Bearer ${user.token}`).expect(404);
    await request(app.getHttpServer())
      .post('/metrics/manual')
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post('/metrics/sync')
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/publications/${publication.id}/metrics`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ views: 1 })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/publications/${publication.id}/metrics`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(404);
  });

  it('requires x-idempotency-key', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    await request(app.getHttpServer())
      .post(`/publications/${publication.id}/metrics/manual`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ views: 1 })
      .expect(400)
      .expect({
        code: ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        message: 'Idempotency key is required',
      });
  });
});
