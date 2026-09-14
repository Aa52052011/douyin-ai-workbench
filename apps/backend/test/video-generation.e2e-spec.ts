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
import { JobProcessor } from '../src/jobs/job.processor.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
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

async function createProject(app: INestApplication, token: string, name = '成片项目') {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name })
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
  return script.body as { id: string; title: string; status: string };
}

async function settle(app: INestApplication, jobId: string) {
  return app.get(JobProcessor).process(jobId);
}

describe('Video generation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-videos-${process.pid}`);
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    process.env.MEDIA_COMPOSE_PROVIDER = 'mock';
    process.env.MEDIA_IMAGE_PROVIDER = 'color-background';
    delete process.env.AI_ENGINE_URL;
    delete process.env.MODEL_API_KEY;
    delete process.env.RUN_REDIS_TESTS;
    delete process.env.RUN_REAL_TTS_TESTS;
    delete process.env.RUN_REAL_VISUAL_TESTS;
    delete process.env.RUN_FFMPEG_TESTS;
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

  it('enqueues a video job and completes after the worker processor runs', async () => {
    const user = await registerUser(app, 'VdOk');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    const idem = `idem-${suffix()}-key`;
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', idem)
      .send({ scriptId: script.id, targetDuration: 15, tenantId: user.tenantId })
      .expect(400);
    expect(created.body.code).toBe('VALIDATION_ERROR');

    const first = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', idem)
      .send({ scriptId: script.id, targetDuration: 15 })
      .expect(201);
    expect(first.body.status).toBe('PENDING');
    expect(first.body.sourceJobId).toBeTruthy();
    expect(first.body.job.status).toBe('PENDING');
    expect(first.body.outputAssetId).toBeNull();
    expect(JSON.stringify(first.body)).not.toContain(process.env.MEDIA_STORAGE_ROOT);
    expect(JSON.stringify(first.body)).not.toContain('password1');

    await settle(app, first.body.sourceJobId);
    const done = await request(app.getHttpServer())
      .get(`/videos/${first.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(done.body.status).toBe('COMPLETED');
    expect(done.body.outputAssetId).toBeTruthy();
    expect(done.body.job.status).toBe('COMPLETED');
    expect(done.body.outputAsset.status).toBe('READY');

    const storedJob = await prisma.job.findFirst({
      where: { id: first.body.sourceJobId, tenantId: user.tenantId },
    });
    expect(storedJob?.kind).toBe('VIDEO_GENERATION');
    expect(storedJob?.progress).toBe(100);
    expect(storedJob?.attempt).toBeGreaterThanOrEqual(1);
    const plan = (storedJob?.input as { productionPlan?: { voice?: { text?: string }; scenes?: unknown[] } })
      .productionPlan;
    expect(plan?.scenes?.length).toBeGreaterThan(0);
    expect(plan?.voice?.text).toBeTruthy();
    const stages = (storedJob?.output as { stages?: Record<string, { assetIds?: string[] }> }).stages;
    expect(stages?.visual?.assetIds?.length).toBeGreaterThan(0);
    expect((storedJob?.output as { stages?: { visual?: { scenes?: unknown[] } } }).stages?.visual?.scenes?.length).toBe(
      stages?.visual?.assetIds?.length,
    );
    expect(stages?.voice?.assetIds?.length).toBe(1);
    expect(stages?.subtitle?.assetIds?.length).toBe(1);
    expect(stages?.compose?.assetIds?.[0]).toBe(done.body.outputAssetId);
    expect(done.body.duration).toBeGreaterThan(0);
    const timeline = (storedJob?.output as { timeline?: { voiceDuration?: number; composeDuration?: number } })
      .timeline;
    expect(done.body.duration).toBe(timeline?.composeDuration);
    expect(timeline?.composeDuration).toBe(timeline?.voiceDuration);
    expect(JSON.stringify(done.body)).not.toContain('storageKey');
    const links = await prisma.assetLink.findMany({
      where: { videoId: first.body.id, tenantId: user.tenantId, role: 'VIDEO_OUTPUT' },
    });
    expect(links).toHaveLength(1);
    expect(links[0].assetId).toBe(done.body.outputAssetId);
    const finalized = storedJob?.output as { final?: { assetId?: string }; stages?: unknown };
    expect(finalized.final?.assetId).toBe(done.body.outputAssetId);
    expect(finalized.stages).toBeTruthy();
    const audio = await prisma.assetLink.findFirst({
      where: { videoId: first.body.id, tenantId: user.tenantId, role: 'VIDEO_AUDIO' },
    });
    expect(audio).toBeTruthy();

    await expect(settle(app, first.body.sourceJobId)).resolves.toMatchObject({
      status: 'skipped',
      reason: 'terminal',
    });

    const replay = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', idem)
      .send({ scriptId: script.id, targetDuration: 15 })
      .expect(201);
    expect(replay.body.id).toBe(first.body.id);

    const listed = await request(app.getHttpServer())
      .get('/videos')
      .query({ projectId: project.id })
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(listed.body.some((item: { id: string }) => item.id === first.body.id)).toBe(true);
  });

  it('rejects draft scripts and fails the mock provider on the worker without completing', async () => {
    const user = await registerUser(app, 'VdFail');
    const project = await createProject(app, user.token);
    const plan = await request(app.getHttpServer())
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
    await request(app.getHttpServer())
      .post(`/content-plans/${plan.body.id}/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const draft = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: plan.body.id,
        topicId: plan.body.payload.topics[0].id,
        targetDuration: 15,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: draft.body.id })
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe('VIDEO_SCRIPT_NOT_CONFIRMED');
      });

    const script = await createConfirmedScript(app, user.token, project.id);
    const pending = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id, requirements: '__mock_fail__' })
      .expect(201);
    expect(pending.body.status).toBe('PENDING');
    expect(pending.body.job.status).toBe('PENDING');

    await settle(app, pending.body.sourceJobId);
    const failed = await request(app.getHttpServer())
      .get(`/videos/${pending.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(failed.body.status).toBe('FAILED');
    expect(failed.body.outputAssetId).toBeNull();
    expect(failed.body.job.status).toBe('FAILED');
    const oldJobId = failed.body.sourceJobId as string;

    const retried = await request(app.getHttpServer())
      .post(`/videos/${pending.body.id}/retry`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(retried.body.status).toBe('PENDING');
    expect(retried.body.sourceJobId).not.toBe(oldJobId);
    expect(retried.body.job.id).not.toBe(oldJobId);
    const oldJob = await prisma.job.findFirst({ where: { id: oldJobId, tenantId: user.tenantId } });
    expect(oldJob?.status).toBe('FAILED');

    await settle(app, retried.body.sourceJobId);
    const recovered = await request(app.getHttpServer())
      .get(`/videos/${pending.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(recovered.body.status).toBe('COMPLETED');
    expect(recovered.body.sourceJobId).not.toBe(oldJobId);

    await request(app.getHttpServer())
      .post(`/videos/${pending.body.id}/retry`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409);

    const regenerated = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id })
      .expect(201);
    expect(regenerated.body.id).not.toBe(pending.body.id);
    const original = await request(app.getHttpServer())
      .get(`/videos/${pending.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(original.body.status).toBe('COMPLETED');
    expect(original.body.outputAssetId).toBe(recovered.body.outputAssetId);
    const firstJob = await prisma.job.findFirst({ where: { id: recovered.body.sourceJobId, tenantId: user.tenantId } });
    const secondJob = await prisma.job.findFirst({ where: { id: regenerated.body.sourceJobId, tenantId: user.tenantId } });
    const firstGen = (firstJob?.input as { generationVersion?: string } | null)?.generationVersion;
    const secondGen = (secondJob?.input as { generationVersion?: string } | null)?.generationVersion;
    expect(firstGen).toBeTruthy();
    expect(secondGen).toBeTruthy();
    expect(secondGen).not.toBe(firstGen);
  });

  it('returns 404 across tenants and workspaces', async () => {
    const a = await registerUser(app, 'VdIsoA');
    const b = await registerUser(app, 'VdIsoB');
    const project = await createProject(app, a.token);
    const script = await createConfirmedScript(app, a.token, project.id);
    const video = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ scriptId: script.id })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/videos/${video.body.id}`)
      .set('Authorization', `Bearer ${b.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/videos')
      .query({ projectId: project.id })
      .set('Authorization', `Bearer ${b.token}`)
      .expect(404);
  });
});
