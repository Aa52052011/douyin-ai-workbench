import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
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
import { ErrorCode } from '../src/common/errors/app-error.js';
import { JOB_QUEUE } from '../src/jobs/queue/queue.constants.js';
import { InMemoryJobQueue } from '../src/jobs/queue/in-memory-job.queue.js';
import { PlatformMetricsProviderRegistry } from '../src/metrics/metrics-provider.registry.js';
import { PublicationMatchKind, PublicationMetricsMatcher } from '../src/metrics/publication-metrics-matcher.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function registerUser(app: INestApplication, name = 'ImportOwner') {
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
    projectId?: string;
    title?: string;
    externalPostId?: string | null;
    externalUrl?: string | null;
    providerItemId?: string | null;
  } = {},
) {
  const tag = suffix();
  const projectId =
    opts.projectId ??
    (
      await prisma.project.create({
        data: {
          tenantId: user.tenantId,
          workspaceId: user.workspaceId,
          name: `Import ${tag}`,
        },
      })
    ).id;
  const video = await prisma.video.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId,
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
      projectId,
      videoId: video.id,
      platform: opts.platform ?? Platform.DOUYIN,
      mode: opts.mode ?? PublicationMode.MANUAL,
      status,
      title: opts.title ?? `Pub ${tag}`,
      visibility: 'PUBLIC',
      publishedAt,
      externalPostId: opts.externalPostId ?? undefined,
      externalUrl: opts.externalUrl ?? undefined,
      providerItemId: opts.providerItemId ?? undefined,
      idempotencyKey: `idem-import-${tag}`,
      createdByUserId: user.userId,
    },
  });
  return { projectId, video, publication };
}

function postImport(
  app: INestApplication,
  token: string,
  publicationId: string,
  body: Record<string, unknown>,
  key = `import-${suffix()}${suffix()}`,
) {
  return request(app.getHttpServer())
    .post(`/publications/${publicationId}/metrics/import`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-idempotency-key', key)
    .send(body);
}

function importBody(overrides: Record<string, unknown> = {}) {
  return {
    observedAt: '2026-08-02T12:00:00.000Z',
    provider: 'STRUCTURED_IMPORT',
    metrics: { views: 100 },
    ...overrides,
  };
}

describe('Structured IMPORT metrics ingestion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let queue: InMemoryJobQueue;
  let matcher: PublicationMetricsMatcher;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-import-metrics-${process.pid}`);
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
    matcher = app.get(PublicationMetricsMatcher);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('creates a valid IMPORT snapshot without jobs, providers or secrets', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const jobsBefore = await prisma.job.count();
    const queuedBefore = queue.enqueued.length;
    const analyticsBefore = await prisma.analytics.count();
    const registry = app.get(PlatformMetricsProviderRegistry);
    const resolveSpy = vi.spyOn(registry, 'resolve');

    const res = await postImport(app, user.token, publication.id, {
      observedAt: '2026-08-02T12:00:00.000Z',
      providerCollectedAt: '2026-08-02T11:50:00.000Z',
      provider: 'STRUCTURED_IMPORT',
      metrics: {
        views: 0,
        likes: 12,
        completionRate: 0.63,
        averageWatchTimeSeconds: 8.5,
      },
      providerMetadata: { mappingVersion: 'structured-v1', rawResponse: { views: 0 } },
    }).expect(201);

    expect(res.body).toMatchObject({
      publicationId: publication.id,
      platform: Platform.DOUYIN,
      source: 'IMPORT',
      provider: 'STRUCTURED_IMPORT',
      views: 0,
      likes: 12,
      comments: null,
      shares: null,
      favorites: null,
      newFollowers: null,
      completionRate: 0.63,
      averageWatchTimeSeconds: 8.5,
      observedAt: '2026-08-02T12:00:00.000Z',
      providerCollectedAt: '2026-08-02T11:50:00.000Z',
    });
    expect(res.body).not.toHaveProperty('collectionKey');
    expect(res.body).not.toHaveProperty('sourceJobId');
    expect(res.body).not.toHaveProperty('providerMetadata');
    expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken|credentialRef|password|secret/i);

    const stored = await prisma.publicationMetricSnapshot.findFirstOrThrow({
      where: { id: res.body.id, tenantId: user.tenantId },
    });
    expect(stored.source).toBe(MetricSource.IMPORT);
    expect(stored.provider).toBe('STRUCTURED_IMPORT');
    expect(stored.sourceJobId).toBeNull();
    expect(stored.collectionKey).toMatch(/^import:/);
    expect(stored.views).toBe(0);
    expect(stored.comments).toBeNull();
    expect(stored.providerMetadata).toEqual({ mappingVersion: 'structured-v1' });

    expect(await prisma.job.count()).toBe(jobsBefore);
    expect(queue.enqueued.length).toBe(queuedBefore);
    expect(await prisma.analytics.count()).toBe(analyticsBefore);
    expect(resolveSpy).not.toHaveBeenCalled();
    resolveSpy.mockRestore();
  });

  it('rejects invalid metrics, observedAt, unpublished publications and extra fields', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const id = publication.id;

    await postImport(app, user.token, id, importBody({ metrics: {} })).expect(400);
    await postImport(app, user.token, id, importBody({ metrics: { views: -1 } })).expect(400);
    await postImport(app, user.token, id, importBody({ metrics: { completionRate: 1.01 } })).expect(400);
    await postImport(app, user.token, id, importBody({ observedAt: '2026-07-31T23:59:59.000Z' })).expect(400);
    await postImport(app, user.token, id, importBody({ collectionKey: 'import:client' })).expect(400);
    await postImport(app, user.token, id, importBody({ source: 'IMPORT' })).expect(400);

    for (const status of [PublicationStatus.PENDING, PublicationStatus.FAILED, PublicationStatus.PROCESSING]) {
      const unpublished = await seedPublication(prisma, user, { status });
      await postImport(app, user.token, unpublished.publication.id, importBody())
        .expect(409)
        .expect({
          code: ErrorCode.PUBLICATION_METRICS_NOT_AVAILABLE,
          message: 'Metrics snapshots are only available for published publications',
        });
    }
  });

  it('returns 404 across tenants and workspaces and isolates projects for matching', async () => {
    const owner = await registerUser(app, 'ImportTenA');
    const other = await registerUser(app, 'ImportTenB');
    const { publication, projectId } = await seedPublication(prisma, owner, {
      externalPostId: '7471111111111111111',
    });
    await postImport(app, other.token, publication.id, importBody()).expect(404);

    const extraWs = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'import-other-ws' })
      .expect(201);
    const hidden = await seedPublication(prisma, { ...owner, workspaceId: extraWs.body.id as string });
    await postImport(app, owner.token, hidden.publication.id, importBody()).expect(404);

    const otherProject = await seedPublication(prisma, owner);
    const crossProject = await matcher.match({
      tenantId: owner.tenantId,
      workspaceId: owner.workspaceId,
      projectId: otherProject.projectId,
      externalPostId: '7471111111111111111',
    });
    expect(crossProject.kind).toBe(PublicationMatchKind.UNMATCHED);

    const sameProject = await matcher.match({
      tenantId: owner.tenantId,
      workspaceId: owner.workspaceId,
      projectId,
      externalPostId: '7471111111111111111',
    });
    expect(sameProject).toMatchObject({
      kind: PublicationMatchKind.EXACT,
      publicationIds: [publication.id],
      matchedBy: 'externalPostId',
    });
  });

  it('enforces idempotency, concurrency and does not overwrite snapshots', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const key = `same-import-${suffix()}${suffix()}`;
    const payload = importBody({ metrics: { views: 11, likes: 2 } });
    const first = await postImport(app, user.token, publication.id, payload, key).expect(201);
    const retry = await postImport(app, user.token, publication.id, payload, key).expect(201);
    expect(retry.body.id).toBe(first.body.id);
    await postImport(app, user.token, publication.id, importBody({ metrics: { views: 999 } }), key)
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

    const concurrentKey = `concurrent-import-${suffix()}${suffix()}`;
    const concurrentBody = importBody({ metrics: { views: 42 } });
    const [a, b] = await Promise.all([
      postImport(app, user.token, publication.id, concurrentBody, concurrentKey),
      postImport(app, user.token, publication.id, concurrentBody, concurrentKey),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(
      await prisma.publicationMetricSnapshot.count({
        where: { publicationId: publication.id, tenantId: user.tenantId, source: MetricSource.IMPORT },
      }),
    ).toBe(2);
  });

  it('rejects secret metadata and API provider spoofing', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    await postImport(
      app,
      user.token,
      publication.id,
      importBody({
        providerMetadata: { mappingVersion: 'v1', token: 'dummy', password: 'x', credentialRef: 'uuid' },
      }),
    ).expect(400);
    await postImport(app, user.token, publication.id, importBody({ provider: 'DOUYIN' })).expect(400);
    await postImport(app, user.token, publication.id, importBody({ provider: 'MOCK' })).expect(400);
    await postImport(app, user.token, publication.id, importBody({ provider: 'API' })).expect(400);
    await postImport(app, user.token, publication.id, importBody({ provider: 'MANUAL' })).expect(400);
  });

  it('lets aggregator and insight read IMPORT snapshots including mixed MANUAL+IMPORT', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    await request(app.getHttpServer())
      .post(`/publications/${publication.id}/metrics/manual`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `manual-mix-${suffix()}${suffix()}`)
      .send({ views: 80, likes: 8, comments: 0, shares: 0, favorites: 0, observedAt: '2026-08-01T12:00:00.000Z' })
      .expect(201);
    await postImport(
      app,
      user.token,
      publication.id,
      importBody({
        observedAt: '2026-08-03T00:00:00.000Z',
        provider: 'CSV_IMPORT',
        metrics: { views: 200, likes: 20, comments: 0, shares: 0, favorites: 0, completionRate: 0.63 },
      }),
    ).expect(201);

    const summary = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/summary`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(summary.body.sourcesUsed).toEqual(['IMPORT', 'MANUAL']);
    expect(summary.body.mixedSources).toBe(true);
    expect(summary.body.dataQualityFlags).toEqual(expect.arrayContaining(['MIXED_SOURCES']));
    expect(summary.body.latest.views).toBe(200);
    expect(summary.body.windows.H24.views).toBe(80);

    const insights = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(insights.body.publicationId).toBe(publication.id);
    expect(insights.body.insights.map((row: { code: string }) => row.code)).toEqual(
      expect.arrayContaining(['MIXED_SOURCE_DATA']),
    );
  });

  it('requires PUBLICATION_CREATE, idempotency key, and stays publication-scoped', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    await request(app.getHttpServer())
      .post(`/publications/${publication.id}/metrics/import`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(importBody())
      .expect(400)
      .expect({
        code: ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        message: 'Idempotency key is required',
      });

    await prisma.membership.updateMany({
      where: { userId: user.userId, tenantId: user.tenantId },
      data: { role: MembershipRole.MEMBER },
    });
    const memberToken = await login(app, user.email);
    await postImport(app, memberToken, publication.id, importBody()).expect(403);

    await request(app.getHttpServer())
      .post('/metrics/import')
      .set('Authorization', `Bearer ${user.token}`)
      .send(importBody())
      .expect(404);
  });

  it('matches publications by id, item id, conservative URL, and weak title+date', async () => {
    const user = await registerUser(app);
    const itemId = '7472222222222222222';
    const { publication, projectId } = await seedPublication(prisma, user, {
      title: 'Weak Title Match',
      externalPostId: itemId,
      externalUrl: `https://www.douyin.com/video/${itemId}`,
      publishedAt: new Date('2026-08-01T08:00:00.000Z'),
    });
    const scope = { tenantId: user.tenantId, workspaceId: user.workspaceId, projectId };

    expect(await matcher.match({ ...scope, publicationId: publication.id })).toMatchObject({
      kind: PublicationMatchKind.EXACT,
      publicationIds: [publication.id],
      matchedBy: 'publicationId',
    });
    expect(
      await matcher.match({ ...scope, externalUrl: `https://www.douyin.com/video/${itemId}` }),
    ).toMatchObject({
      kind: PublicationMatchKind.EXACT,
      matchedBy: 'externalPostId',
    });
    expect(await matcher.match({ ...scope, title: 'Weak Title Match', publishedAt: '2026-08-01T00:00:00.000Z' })).toMatchObject({
      kind: PublicationMatchKind.WEAK,
      publicationIds: [publication.id],
      matchedBy: 'titlePublishedAt',
    });
    expect(await matcher.match({ ...scope, title: 'Weak Title Match' })).toMatchObject({
      kind: PublicationMatchKind.UNMATCHED,
    });
    expect(await matcher.match({ ...scope, externalUrl: 'https://v.douyin.com/short/' })).toMatchObject({
      kind: PublicationMatchKind.UNMATCHED,
    });

    await seedPublication(prisma, user, {
      projectId,
      title: 'Weak Title Match',
      publishedAt: new Date('2026-08-01T18:00:00.000Z'),
    });
    const ambiguous = await matcher.match({
      ...scope,
      title: 'Weak Title Match',
      publishedAt: '2026-08-01T12:00:00.000Z',
    });
    expect(ambiguous.kind).toBe(PublicationMatchKind.AMBIGUOUS);
    expect(ambiguous.matchedBy).toBe('titlePublishedAt');
    expect(ambiguous.publicationIds).toHaveLength(2);

    const missing = await matcher.match({
      ...scope,
      publicationId: randomUUID(),
    });
    expect(missing.kind).toBe(PublicationMatchKind.UNMATCHED);
  });
});
