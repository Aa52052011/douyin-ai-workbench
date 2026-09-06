import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JobKind, JobStatus, Platform, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  migrateDeploy,
  startTestDatabase,
  stopTestDatabase,
} from '../../../database/test/harness.ts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AppError, ErrorCode } from '../src/common/errors/app-error.js';
import { JobProcessor } from '../src/jobs/job.processor.js';
import { PlatformMetricsProviderRegistry } from '../src/metrics/metrics-provider.registry.js';
import { PublishingProviderRegistry } from '../src/publishing/providers/publishing-provider.registry.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function registerUser(app: INestApplication) {
  const email = `metrics-${suffix()}@example.com`;
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'password1', name: 'Metrics' })
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
    .send({ name: 'Metrics foundation' })
    .expect(201);
  return res.body as { id: string };
}

describe('Publication metrics foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-metrics-${process.pid}`);
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    process.env.MEDIA_COMPOSE_PROVIDER = 'mock';
    process.env.MEDIA_IMAGE_PROVIDER = 'color-background';
    delete process.env.AI_ENGINE_URL;
    delete process.env.MODEL_API_KEY;
    delete process.env.RUN_REDIS_TESTS;
    delete process.env.RUN_REAL_TTS_TESTS;
    delete process.env.RUN_REAL_VISUAL_TESTS;
    const databaseUrl = await startTestDatabase();
    process.env.DATABASE_URL = databaseUrl;
    migrateDeploy(databaseUrl);
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('does not expose public metrics APIs in this step', async () => {
    const user = await registerUser(app);
    await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(404);
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
  });

  it('fail-closes a metrics sync Job without a publicationId without generation or publish handlers', async () => {
    const user = await registerUser(app);
    const project = await createProject(app, user.token);
    const video = await prisma.video.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        projectId: project.id,
        status: 'COMPLETED',
      },
    });
    const job = await prisma.job.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        projectId: project.id,
        kind: JobKind.PUBLICATION_METRICS_SYNC,
        status: JobStatus.PENDING,
        requestId: `metrics-${suffix()}`,
        videoId: video.id,
      },
    });
    const result = await app.get(JobProcessor).process(job.id);
    expect(result.status).toBe('failed');
    const stored = await prisma.job.findFirst({ where: { id: job.id, tenantId: user.tenantId } });
    expect(stored?.status).toBe('FAILED');
    expect((stored?.error as { code?: string } | null)?.code).toBe(ErrorCode.PUBLICATION_NOT_FOUND);
  });

  it('keeps metrics and publishing registries independent', () => {
    const metrics = app.get(PlatformMetricsProviderRegistry);
    const publishing = app.get(PublishingProviderRegistry);
    expect(metrics.resolve(Platform.MOCK).platform).toBe(Platform.MOCK);
    expect(() => metrics.resolve(Platform.DOUYIN)).toThrow(AppError);
    try {
      metrics.resolve(Platform.DOUYIN);
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.PLATFORM_METRICS_PROVIDER_NOT_IMPLEMENTED });
    }
    expect(publishing.resolve(Platform.MOCK).platform).toBe(Platform.MOCK);
    expect(() => publishing.resolve(Platform.DOUYIN)).toThrow(AppError);
  });
});
