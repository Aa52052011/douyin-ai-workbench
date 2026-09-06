import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MetricSource, Platform, PrismaClient, PublicationMode, PublicationStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  migrateDeploy,
  startTestDatabase,
  stopTestDatabase,
} from '../../../database/test/harness.ts';
import { AppModule } from '../src/app.module.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from '../src/agents/definitions/account-positioning.fixture.js';
import { MockModelProvider } from '../src/agents/models/mock.provider.js';
import { configureApp } from '../src/configure-app.js';
import { JOB_QUEUE } from '../src/jobs/queue/queue.constants.js';
import { InMemoryJobQueue } from '../src/jobs/queue/in-memory-job.queue.js';
import { PlatformMetricsProviderRegistry } from '../src/metrics/metrics-provider.registry.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function registerUser(app: INestApplication, name = 'FbOwner') {
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
  };
}

async function createProject(app: INestApplication, token: string, name = '反馈项目') {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name })
    .expect(201);
  return res.body as { id: string };
}

async function seedPublished(
  prisma: PrismaClient,
  user: { tenantId: string; workspaceId: string; userId: string },
  projectId: string,
  publishedAt: Date,
) {
  const tag = suffix();
  const video = await prisma.video.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId,
      status: 'COMPLETED',
    },
  });
  return prisma.publication.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId,
      videoId: video.id,
      platform: Platform.MOCK,
      mode: PublicationMode.MANUAL,
      status: PublicationStatus.PUBLISHED,
      title: `Hist ${tag}`,
      visibility: 'PUBLIC',
      publishedAt,
      idempotencyKey: `idem-fb-${tag}`,
      createdByUserId: user.userId,
    },
  });
}

async function addSnapshot(
  prisma: PrismaClient,
  user: { tenantId: string; workspaceId: string },
  publication: { id: string; projectId: string },
  data: { observedAt: Date; views: number; likes: number; comments?: number; shares?: number; favorites?: number; completionRate?: number; source?: MetricSource },
) {
  return prisma.publicationMetricSnapshot.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: publication.projectId,
      publicationId: publication.id,
      platform: Platform.MOCK,
      source: data.source ?? MetricSource.MANUAL,
      collectionKey: `fb-${suffix()}`,
      observedAt: data.observedAt,
      views: data.views,
      likes: data.likes,
      comments: data.comments ?? 0,
      shares: data.shares ?? 0,
      favorites: data.favorites ?? 0,
      completionRate: data.completionRate ?? null,
      provider: 'MANUAL',
    },
  });
}

async function seedSufficientPublication(
  prisma: PrismaClient,
  user: { tenantId: string; workspaceId: string; userId: string },
  projectId: string,
  publishedAt: Date,
  likes: number,
) {
  const publication = await seedPublished(prisma, user, projectId, publishedAt);
  await addSnapshot(prisma, user, publication, {
    observedAt: new Date(publishedAt.getTime() + 12 * 3600 * 1000),
    views: 120,
    likes: Math.max(1, Math.floor(likes / 2)),
  });
  await addSnapshot(prisma, user, publication, {
    observedAt: new Date(publishedAt.getTime() + 24 * 3600 * 1000),
    views: 200,
    likes,
    comments: 0,
    shares: 0,
    favorites: 0,
    completionRate: 0.7,
  });
  return publication;
}

describe('Content planning performance feedback (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let queue: InMemoryJobQueue;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-plan-fb-${process.pid}`);
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

  it('injects compact USABLE feedback into AgentRun.input without side effects', async () => {
    const user = await registerUser(app);
    const project = await createProject(app, user.token);
    const jobsBefore = await prisma.job.count();
    const snapsBefore = await prisma.publicationMetricSnapshot.count();
    const plansBefore = await prisma.contentPlan.count({ where: { projectId: project.id } });
    const registry = app.get(PlatformMetricsProviderRegistry);
    const spy = vi.spyOn(registry, 'resolve');
    const mock = app.get(MockModelProvider);

    const first = await seedSufficientPublication(
      prisma,
      user,
      project.id,
      new Date('2026-08-01T00:00:00.000Z'),
      20,
    );
    await seedSufficientPublication(prisma, user, project.id, new Date('2026-08-03T00:00:00.000Z'), 22);

    const created = await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId: project.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
      })
      .expect(201);

    expect(created.body.payload.topics).toHaveLength(7);
    expect(created.body.payload).not.toHaveProperty('performanceFeedback');
    expect(created.body.version).toBe(1);
    const run = await prisma.agentRun.findFirst({
      where: { id: created.body.sourceAgentRunId, tenantId: user.tenantId },
    });
    const input = run?.input as {
      positioning?: unknown;
      planningDays?: number;
      performanceFeedback?: {
        dataState: string;
        version: string;
        positiveSignals: Array<{ code: string; supportCount: number }>;
      };
    };
    expect(input.planningDays).toBe(7);
    expect(input.positioning).toBeTruthy();
    expect(input.performanceFeedback?.version).toBe('v1');
    expect(input.performanceFeedback?.dataState).toBe('USABLE');
    expect(input.performanceFeedback?.positiveSignals.some((row) => row.code === 'HIGH_LIKE_RATE' && row.supportCount === 2)).toBe(
      true,
    );
    expect(JSON.stringify(input.performanceFeedback)).not.toContain('collectionKey');
    expect(JSON.stringify(input.performanceFeedback)).not.toContain('providerMetadata');
    expect(mock.lastRequest?.prompt).toContain('HIGH_LIKE_RATE');
    expect(mock.lastRequest?.prompt).toContain('历史表现反馈 JSON');
    expect(mock.lastRequest?.systemPrompt).toContain('账号定位');

    expect(await prisma.job.count()).toBe(jobsBefore);
    expect(await prisma.publicationMetricSnapshot.count()).toBe(snapsBefore + 4);
    expect(await prisma.contentPlan.count({ where: { projectId: project.id } })).toBe(plansBefore + 1);
    expect(await prisma.publication.findFirst({ where: { id: first.id } })).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    expect(queue.enqueued.length).toBe(0);
    spy.mockRestore();
  });

  it('ignores cross-project publications and keeps output contract', async () => {
    const user = await registerUser(app, 'FbIso');
    const projectA = await createProject(app, user.token, '规划A');
    const projectB = await createProject(app, user.token, '规划B');
    await seedSufficientPublication(prisma, user, projectB.id, new Date('2026-08-01T00:00:00.000Z'), 40);
    await seedSufficientPublication(prisma, user, projectB.id, new Date('2026-08-02T00:00:00.000Z'), 40);

    const created = await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId: projectA.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
      })
      .expect(201);

    const run = await prisma.agentRun.findFirst({
      where: { id: created.body.sourceAgentRunId, tenantId: user.tenantId },
    });
    const feedback = (run?.input as { performanceFeedback?: { dataState?: string; sampleSize?: number } })
      .performanceFeedback;
    expect(feedback?.dataState).toBe('NONE');
    expect(feedback?.sampleSize).toBe(0);
    expect(created.body.payload.topics).toHaveLength(7);
  });
});
