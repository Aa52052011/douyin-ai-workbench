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

async function registerUser(app: INestApplication, name = 'InsightOwner') {
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
    data: { tenantId: user.tenantId, workspaceId: user.workspaceId, name: `Insight ${tag}` },
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
      title: `Insight ${tag}`,
      visibility: 'PUBLIC',
      publishedAt,
      idempotencyKey: `idem-ins-${tag}`,
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
    shares?: number | null;
    favorites?: number | null;
    source?: MetricSource;
    completionRate?: number;
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
      collectionKey: `ins-${suffix()}`,
      observedAt: data.observedAt,
      views: data.views ?? null,
      likes: data.likes ?? null,
      comments: data.comments ?? null,
      shares: data.shares ?? null,
      favorites: data.favorites ?? null,
      completionRate: data.completionRate ?? null,
      provider: data.source === MetricSource.API ? 'MOCK' : 'MANUAL',
    },
  });
}

describe('Publication performance insights (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let queue: InMemoryJobQueue;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-metrics-ins-${process.pid}`);
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

  it('returns insights from the same summary without writes or providers', async () => {
    const user = await registerUser(app);
    const { publication } = await seedPublication(prisma, user);
    const jobsBefore = await prisma.job.count();
    const runsBefore = await prisma.agentRun.count();
    const queuedBefore = queue.enqueued.length;
    const snapsBefore = await prisma.publicationMetricSnapshot.count({
      where: { publicationId: publication.id },
    });
    const registry = app.get(PlatformMetricsProviderRegistry);
    const spy = vi.spyOn(registry, 'resolve');

    await addSnapshot(prisma, user, publication, {
      observedAt: new Date('2026-08-01T12:00:00.000Z'),
      views: 80,
      likes: 8,
      comments: 0,
      shares: 0,
      favorites: 0,
      source: MetricSource.MANUAL,
    });
    await addSnapshot(prisma, user, publication, {
      observedAt: new Date('2026-08-02T00:00:00.000Z'),
      views: 200,
      likes: 20,
      comments: 0,
      shares: 0,
      favorites: 0,
      source: MetricSource.MANUAL,
      completionRate: 0.63,
    });
    await addSnapshot(prisma, user, publication, {
      observedAt: new Date('2026-08-06T00:00:00.000Z'),
      views: 500,
      likes: 40,
      comments: null,
      source: MetricSource.API,
    });
    await addSnapshot(prisma, user, publication, {
      observedAt: new Date('2026-08-09T00:00:00.000Z'),
      views: 900,
      likes: 80,
      comments: 0,
      shares: 4,
      favorites: 4,
      source: MetricSource.MANUAL,
    });

    const summary = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/summary`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const insights = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(insights.body.publicationId).toBe(publication.id);
    expect(insights.body.rulesVersion).toBe('v1');
    expect(insights.body.dataSufficiency).toBe('SUFFICIENT');
    expect(insights.body.summaryGeneratedAt).toBeTruthy();
    const codes = insights.body.insights.map((row: { code: string }) => row.code);
    expect(codes).toEqual(expect.arrayContaining(['MIXED_SOURCE_DATA', 'HIGH_LIKE_RATE', 'STRONG_COMPLETION_RATE']));
    expect(codes).not.toContain('HIGH_COMMENT_RATE');
    const like = insights.body.insights.find((row: { code: string }) => row.code === 'HIGH_LIKE_RATE');
    expect(like.window).toBe('H24');
    expect(like.evidence[0].value).toBe(summary.body.windows.H24.likeRate);
    expect(like.evidence[0].views).toBe(summary.body.windows.H24.views);
    expect(like.evidence[0].threshold).toBe(0.05);
    expect(JSON.stringify(insights.body)).not.toMatch(/应该|建议强化开头|accessToken|collectionKey|tenantId/i);

    expect(await prisma.job.count()).toBe(jobsBefore);
    expect(await prisma.agentRun.count()).toBe(runsBefore);
    expect(queue.enqueued.length).toBe(queuedBefore);
    expect(
      await prisma.publicationMetricSnapshot.count({ where: { publicationId: publication.id } }),
    ).toBe(snapsBefore + 4);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('returns INSUFFICIENT_DATA when there are no snapshots', async () => {
    const user = await registerUser(app, 'InsightEmpty');
    const { publication } = await seedPublication(prisma, user);
    const res = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(res.body.dataSufficiency).toBe('INSUFFICIENT');
    expect(res.body.insights.map((row: { code: string }) => row.code)).toEqual(['INSUFFICIENT_DATA']);
  });

  it('allows MEMBER and VIEWER to read and 404s across tenant/workspace', async () => {
    const owner = await registerUser(app, 'InsTenA');
    const other = await registerUser(app, 'InsTenB');
    const { publication } = await seedPublication(prisma, owner);
    await addSnapshot(prisma, owner, publication, {
      observedAt: new Date('2026-08-01T03:00:00.000Z'),
      views: 12,
      likes: 0,
    });
    await prisma.membership.updateMany({
      where: { userId: owner.userId, tenantId: owner.tenantId },
      data: { role: MembershipRole.MEMBER },
    });
    const memberToken = await login(app, owner.email);
    await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/insights`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    await prisma.membership.updateMany({
      where: { userId: owner.userId, tenantId: owner.tenantId },
      data: { role: MembershipRole.VIEWER },
    });
    const viewerToken = await login(app, owner.email);
    await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/insights`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/insights`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404)
      .expect({ code: ErrorCode.PUBLICATION_NOT_FOUND, message: 'Publication not found' });

    const extraWs = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'ins-other-ws' })
      .expect(201);
    const hidden = await seedPublication(prisma, { ...owner, workspaceId: extraWs.body.id as string });
    await addSnapshot(prisma, { tenantId: owner.tenantId, workspaceId: extraWs.body.id as string }, hidden.publication, {
      observedAt: new Date('2026-08-01T04:00:00.000Z'),
      views: 3,
    });
    await request(app.getHttpServer())
      .get(`/publications/${hidden.publication.id}/metrics/insights`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404)
      .expect({ code: ErrorCode.PUBLICATION_NOT_FOUND, message: 'Publication not found' });
  });
});
