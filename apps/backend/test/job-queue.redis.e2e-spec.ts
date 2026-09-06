import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
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
import { JobWorker } from '../src/jobs/job.worker.js';
import { WorkerAppModule } from '../src/jobs/worker.module.js';

const enabled = process.env.RUN_REDIS_TESTS === 'true' && Boolean(process.env.REDIS_URL?.trim());

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function registerUser(app: INestApplication, name = 'Owner') {
  const email = `${name.toLowerCase()}-${suffix()}@example.com`;
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'password1', name })
    .expect(201);
  return { token: res.body.accessToken as string };
}

async function createProject(app: INestApplication, token: string) {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Redis成片' })
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

async function waitForStatus(
  app: INestApplication,
  token: string,
  videoId: string,
  status: string,
): Promise<Record<string, unknown>> {
  for (let i = 0; i < 40; i += 1) {
    const res = await request(app.getHttpServer())
      .get(`/videos/${videoId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    if (res.body.status === status && res.body.job?.status === status) {
      return res.body as Record<string, unknown>;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${status}`);
}

describe.skipIf(!enabled)('Redis + BullMQ + Worker (integration)', () => {
  let app: INestApplication;
  let workerApp: INestApplication;
  let prisma: PrismaClient;
  let worker: JobWorker;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-redis-${process.pid}`);
    delete process.env.AI_ENGINE_URL;
    delete process.env.MODEL_API_KEY;
    const databaseUrl = await startTestDatabase();
    process.env.DATABASE_URL = databaseUrl;
    migrateDeploy(databaseUrl);
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const workerRef = await Test.createTestingModule({ imports: [WorkerAppModule] }).compile();
    workerApp = workerRef.createNestApplication();
    await workerApp.init();
    worker = workerApp.get(JobWorker);
    await worker.start();
  });

  afterAll(async () => {
    await worker?.close();
    await workerApp?.close();
    await app?.close();
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  it('completes a video through Redis and fails mock sentinel through the worker', async () => {
    const user = await registerUser(app, 'RdOk');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id })
      .expect(201);
    expect(created.body.status).toBe('PENDING');
    const done = await waitForStatus(app, user.token, created.body.id, 'COMPLETED');
    expect(done.outputAssetId).toBeTruthy();

    const failScript = await createConfirmedScript(app, user.token, project.id);
    const failedCreate = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: failScript.id, requirements: '__mock_fail__' })
      .expect(201);
    const failed = await waitForStatus(app, user.token, failedCreate.body.id, 'FAILED');
    expect(failed.outputAssetId).toBeNull();
  });
});
