import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MembershipRole, MetricSource, Platform, PrismaClient, PublicationMode, PublicationStatus } from '@prisma/client';
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

async function registerUser(app: INestApplication, name = 'AggOwner') {
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
  publishedAt = new Date('2026-08-01T00:00:00.000Z'),
) {
  const tag = suffix();
  const project = await prisma.project.create({
    data: { tenantId: user.tenantId, workspaceId: user.workspaceId, name: `Agg ${tag}` },
  });
  const video = await prisma.video.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: project.id,
      status: 'COMPLETED',
    },
  });
  const publication = await prisma.publication.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: project.id,
      videoId: video.id,
      platform: Platform.MOCK,
      mode: PublicationMode.MANUAL,
      status: PublicationStatus.PUBLISHED,
      title: `Agg ${tag}`,
      visibility: 'PUBLIC',
      publishedAt,
      idempotencyKey: `idem-agg-${tag}`,
      createdByUserId: user.userId,
    },
  });
  return { project, video, publication };
}

async function addSnapshot(
  prisma: PrismaClient,
  user: { tenantId: string; workspaceId: string },
  publication: { id: string; projectId: string },
  data: {
    observedAt: Date;
    views?: number | null;
    likes?: number | null;
    comments?: number | null;
    source?: MetricSource;
    completionRate?: number;
    averageWatchTimeSeconds?: number;
  },
) {
  return prisma.publicationMetricSnapshot.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: publication.projectId,
      publicationId: publication.id,
      platform: Platform.MOCK,
      source: data.source ?? MetricSource.MANUAL,
      collectionKey: `agg-${suffix()}`,
      observedAt: data.observedAt,
      views: data.views ?? null,
      likes: data.likes ?? null,
      comments: data.comments ?? null,
      completionRate: data.completionRate ?? null,
      averageWatchTimeSeconds: data.averageWatchTimeSeconds ?? null,
      provider: data.source === MetricSource.API ? 'MOCK' : 'MANUAL',
    },
  });
}

describe('Publication metrics aggregator (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let queue: InMemoryJobQueue;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-metrics-agg-${process.pid}`);
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

  it('returns a deterministic summary matching GET latest and window cutoffs', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const jobsBefore = await prisma.job.count();
    const queuedBefore = queue.enqueued.length;
    const snapsBefore = await prisma.publicationMetricSnapshot.count({
      where: { publicationId: publication.id },
    });
    const registry = app.get(PlatformMetricsProviderRegistry);
    const spy = vi.spyOn(registry, 'resolve');

    await addSnapshot(prisma, user, publication, {
      observedAt: new Date('2026-08-01T20:00:00.000Z'),
      views: 100,
      likes: 10,
      comments: 0,
      source: MetricSource.MANUAL,
      completionRate: 0.63,
      averageWatchTimeSeconds: 12.345,
    });
    await addSnapshot(prisma, user, publication, {
      observedAt: new Date('2026-08-02T06:00:00.000Z'),
      views: 500,
      likes: 40,
      comments: null,
      source: MetricSource.API,
    });
    await addSnapshot(prisma, user, publication, {
      observedAt: new Date('2026-08-06T00:00:00.000Z'),
      views: 900,
      likes: 80,
      comments: 4,
      source: MetricSource.MANUAL,
    });
    await addSnapshot(prisma, user, publication, {
      observedAt: new Date('2026-08-09T00:00:00.000Z'),
      views: 2000,
      likes: 120,
      comments: 8,
      source: MetricSource.API,
    });

    const latest = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/latest`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const summary = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/summary`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(summary.body.publicationId).toBe(publication.id);
    expect(summary.body.videoId).toBe(publication.videoId);
    expect(summary.body.latest.snapshotId).toBe(latest.body.snapshot.id);
    expect(summary.body.latest.views).toBe(2000);
    expect(summary.body.windows.H24.views).toBe(100);
    expect(summary.body.windows.D7.views).toBe(900);
    expect(summary.body.windows.LIFETIME.views).toBe(2000);
    expect(summary.body.windows.LIFETIME.views).not.toBe(3500);
    expect(summary.body.latest.completionRate).toBeNull();
    expect(summary.body.windows.H24.shares).toBeNull();
    expect(summary.body.windows.H24.comments).toBe(0);
    expect(typeof summary.body.windows.H24.completionRate).toBe('number');
    expect(summary.body.windows.H24.completionRate).toBe(0.63);
    expect(typeof summary.body.windows.H24.averageWatchTimeSeconds).toBe('number');
    expect(summary.body.windows.H24.averageWatchTimeSeconds).toBe(12.345);
    expect(summary.body.windows.H24.likeRate).toBe(0.1);
    expect(summary.body.sourcesUsed).toEqual(['API', 'MANUAL']);
    expect(summary.body.mixedSources).toBe(true);
    expect(summary.body.dataQualityFlags).toEqual(expect.arrayContaining(['MIXED_SOURCES']));
    expect(summary.body).not.toHaveProperty('collectionKey');
    expect(summary.body).not.toHaveProperty('providerMetadata');
    expect(JSON.stringify(summary.body)).not.toMatch(/accessToken|credentialRef|tenantId/i);

    expect(await prisma.job.count()).toBe(jobsBefore);
    expect(queue.enqueued.length).toBe(queuedBefore);
    expect(
      await prisma.publicationMetricSnapshot.count({ where: { publicationId: publication.id } }),
    ).toBe(snapsBefore + 4);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('allows MEMBER and VIEWER to read and 404s across tenants', async () => {
    const owner = await registerUser(app, 'AggTenA');
    const other = await registerUser(app, 'AggTenB');
    const { publication } = await seedPublication(prisma, owner);
    await addSnapshot(prisma, owner, publication, {
      observedAt: new Date('2026-08-01T03:00:00.000Z'),
      views: 12,
    });
    await prisma.membership.updateMany({
      where: { userId: owner.userId, tenantId: owner.tenantId },
      data: { role: MembershipRole.MEMBER },
    });
    const memberToken = await login(app, owner.email);
    await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/summary`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    await prisma.membership.updateMany({
      where: { userId: owner.userId, tenantId: owner.tenantId },
      data: { role: MembershipRole.VIEWER },
    });
    const viewerToken = await login(app, owner.email);
    await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/summary`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/summary`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404)
      .expect({ code: ErrorCode.PUBLICATION_NOT_FOUND, message: 'Publication not found' });

    const extraWs = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'agg-other-ws' })
      .expect(201);
    const hidden = await seedPublication(prisma, { ...owner, workspaceId: extraWs.body.id as string });
    await addSnapshot(prisma, { tenantId: owner.tenantId, workspaceId: extraWs.body.id as string }, hidden.publication, {
      observedAt: new Date('2026-08-01T04:00:00.000Z'),
      views: 3,
    });
    await request(app.getHttpServer())
      .get(`/publications/${hidden.publication.id}/metrics/summary`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404)
      .expect({ code: ErrorCode.PUBLICATION_NOT_FOUND, message: 'Publication not found' });
  });
});
