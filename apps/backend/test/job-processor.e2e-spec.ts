import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  migrateDeploy,
  startTestDatabase,
  stopTestDatabase,
} from '../../../database/test/harness.ts';
import { AppModule } from '../src/app.module.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from '../src/agents/definitions/account-positioning.fixture.js';
import { configureApp } from '../src/configure-app.js';
import { ErrorCode } from '../src/common/errors/app-error.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { JobProcessor } from '../src/jobs/job.processor.js';
import { JOB_QUEUE } from '../src/jobs/queue/queue.constants.js';
import { MockComposeProvider } from '../src/media/providers/mock-compose.provider.js';
import { ColorBackgroundImageProvider } from '../src/media/providers/color-background-image.provider.js';
import { MockTtsProvider } from '../src/media/providers/mock-tts.provider.js';

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

async function createProject(app: INestApplication, token: string) {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '队列项目' })
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

describe('Job processor (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-jobs-${process.pid}`);
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

  it('lets only one concurrent worker claim a pending job', async () => {
    const user = await registerUser(app, 'JpRace');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id })
      .expect(201);
    const provider = app.get(MockTtsProvider);
    const spy = vi.spyOn(provider, 'synthesize');
    const processor = app.get(JobProcessor);
    const results = await Promise.all([
      processor.process(created.body.sourceJobId),
      processor.process(created.body.sourceJobId),
    ]);
    expect(results.filter((item) => item.status === 'completed')).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('fails a job whose script belongs to another tenant and does not call the provider', async () => {
    const a = await registerUser(app, 'JpIsoA');
    const b = await registerUser(app, 'JpIsoB');
    const aProject = await createProject(app, a.token);
    const bProject = await createProject(app, b.token);
    const aScript = await createConfirmedScript(app, a.token, aProject.id);
    const bScript = await createConfirmedScript(app, b.token, bProject.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ scriptId: aScript.id })
      .expect(201);
    await prisma.job.update({
      where: { id: created.body.sourceJobId },
      data: { scriptId: bScript.id },
    });
    const provider = app.get(MockTtsProvider);
    const spy = vi.spyOn(provider, 'synthesize');
    const result = await app.get(JobProcessor).process(created.body.sourceJobId);
    expect(result).toMatchObject({ status: 'failed', reason: 'isolation' });
    expect(spy).not.toHaveBeenCalled();
    const job = await prisma.job.findFirst({
      where: { id: created.body.sourceJobId, tenantId: a.tenantId },
    });
    expect(job?.status).toBe('FAILED');
    expect((job?.error as { code?: string } | null)?.code).toBe(ErrorCode.JOB_ISOLATION_VIOLATION);
    spy.mockRestore();
  });

  it('claims pending jobs, rejects a fresh lease, and reclaims a stale running job without re-running TTS', async () => {
    const user = await registerUser(app, 'JpLease');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id })
      .expect(201);
    const jobId = created.body.sourceJobId as string;
    await app.get(JobProcessor).process(jobId);
    const completed = await prisma.job.findFirst({ where: { id: jobId } });
    expect(completed?.status).toBe('COMPLETED');
    expect(completed?.attempt).toBe(1);
    await expect(app.get(JobsService).claim(user.tenantId, jobId)).rejects.toMatchObject({
      code: 'JOB_CONFLICT',
    });

    await expect(app.get(JobProcessor).process(jobId)).resolves.toMatchObject({
      status: 'skipped',
      reason: 'terminal',
    });

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'RUNNING',
        lastHeartbeatAt: new Date(),
        completedAt: null,
      },
    });
    await expect(app.get(JobProcessor).process(jobId)).resolves.toMatchObject({
      status: 'skipped',
      reason: 'running',
    });

    const tts = app.get(MockTtsProvider);
    const spy = vi.spyOn(tts, 'synthesize');
    const visualsBefore = await prisma.asset.count({
      where: {
        tenantId: user.tenantId,
        type: 'IMAGE',
        deletedAt: null,
        metadata: { path: ['jobId'], equals: jobId },
      },
    });
    expect(visualsBefore).toBeGreaterThan(0);
    await prisma.job.update({
      where: { id: jobId },
      data: { lastHeartbeatAt: new Date(Date.now() - 120_000) },
    });
    await expect(app.get(JobProcessor).process(jobId)).resolves.toMatchObject({ status: 'completed' });
    expect(spy).not.toHaveBeenCalled();
    const recovered = await prisma.job.findFirst({ where: { id: jobId } });
    expect(recovered?.attempt).toBe(2);
    expect(recovered?.id).toBe(jobId);
    const visualsAfter = await prisma.asset.count({
      where: {
        tenantId: user.tenantId,
        type: 'IMAGE',
        deletedAt: null,
        metadata: { path: ['jobId'], equals: jobId },
      },
    });
    expect(visualsAfter).toBe(visualsBefore);
    spy.mockRestore();
  });

  it('regenerates a stage when the checkpoint asset was soft-deleted', async () => {
    const user = await registerUser(app, 'JpGone');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id })
      .expect(201);
    const jobId = created.body.sourceJobId as string;
    await app.get(JobProcessor).process(jobId);
    const job = await prisma.job.findFirst({ where: { id: jobId } });
    const voiceId = (job?.output as { stages?: { voice?: { assetIds?: string[] } } }).stages?.voice?.assetIds?.[0];
    await prisma.asset.update({
      where: { id: voiceId },
      data: { deletedAt: new Date() },
    });
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'RUNNING', lastHeartbeatAt: new Date(Date.now() - 120_000), completedAt: null },
    });
    const tts = app.get(MockTtsProvider);
    const spy = vi.spyOn(tts, 'synthesize');
    await app.get(JobProcessor).process(jobId);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('keeps completed assets when voice fails and user retry creates a new job', async () => {
    const user = await registerUser(app, 'JpFail');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id, requirements: '__mock_fail_voice__' })
      .expect(201);
    const oldJobId = created.body.sourceJobId as string;
    await app.get(JobProcessor).process(oldJobId);
    const failed = await prisma.job.findFirst({ where: { id: oldJobId } });
    expect(failed?.status).toBe('FAILED');
    const visualIds = (failed?.output as { stages?: { visual?: { assetIds?: string[] } } }).stages?.visual?.assetIds;
    expect(visualIds?.length).toBeGreaterThan(0);
    const visual = await prisma.asset.findFirst({ where: { id: visualIds?.[0] } });
    expect(visual?.deletedAt).toBeNull();
    const video = await prisma.video.findFirst({ where: { id: created.body.id } });
    expect(video?.status).toBe('FAILED');

    const retried = await request(app.getHttpServer())
      .post(`/videos/${created.body.id}/retry`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(retried.body.sourceJobId).not.toBe(oldJobId);
    await app.get(JobProcessor).process(retried.body.sourceJobId);
    const newJob = await prisma.job.findFirst({ where: { id: retried.body.sourceJobId } });
    expect(newJob?.status).toBe('COMPLETED');
    expect(newJob?.id).not.toBe(oldJobId);
  });

  it('keeps earlier assets when compose fails and rejects reclaim of failed or cancelled jobs', async () => {
    const user = await registerUser(app, 'JpCompose');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id, requirements: '__mock_fail_compose__' })
      .expect(201);
    const jobId = created.body.sourceJobId as string;
    await app.get(JobProcessor).process(jobId);
    const failed = await prisma.job.findFirst({ where: { id: jobId } });
    expect(failed?.status).toBe('FAILED');
    const voiceId = (failed?.output as { stages?: { voice?: { assetIds?: string[] } } }).stages?.voice?.assetIds?.[0];
    const voice = await prisma.asset.findFirst({ where: { id: voiceId } });
    expect(voice?.deletedAt).toBeNull();
    expect(voice?.status).toBe('READY');
    const video = await prisma.video.findFirst({ where: { id: created.body.id } });
    expect(video?.status).toBe('FAILED');
    expect(video?.outputAssetId).toBeNull();

    await expect(app.get(JobProcessor).process(jobId)).resolves.toMatchObject({
      status: 'skipped',
      reason: 'terminal',
    });
    await expect(app.get(JobsService).claim(user.tenantId, jobId)).rejects.toMatchObject({
      code: 'JOB_CONFLICT',
    });

    await prisma.job.update({ where: { id: jobId }, data: { status: 'CANCELLED' } });
    await expect(app.get(JobProcessor).process(jobId)).resolves.toMatchObject({
      status: 'skipped',
      reason: 'terminal',
    });
    await expect(app.get(JobsService).claim(user.tenantId, jobId)).rejects.toMatchObject({
      code: 'JOB_CONFLICT',
    });
  });

  it('reuses visual assets on user retry after compose failure', async () => {
    const user = await registerUser(app, 'JpVisReuse');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id, requirements: '__mock_fail_compose__' })
      .expect(201);
    const oldJobId = created.body.sourceJobId as string;
    await app.get(JobProcessor).process(oldJobId);
    const failed = await prisma.job.findFirst({ where: { id: oldJobId } });
    expect(failed?.status).toBe('FAILED');
    const oldVisual = (failed?.output as { stages?: { visual?: { assetIds?: string[]; scenes?: unknown[] } } }).stages
      ?.visual;
    expect(oldVisual?.assetIds?.length).toBeGreaterThan(0);
    expect(oldVisual?.scenes?.length).toBe(oldVisual?.assetIds?.length);
    const images = app.get(ColorBackgroundImageProvider);
    const spy = vi.spyOn(images, 'generate');

    const retried = await request(app.getHttpServer())
      .post(`/videos/${created.body.id}/retry`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(retried.body.sourceJobId).not.toBe(oldJobId);
    await app.get(JobProcessor).process(retried.body.sourceJobId);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    const newJob = await prisma.job.findFirst({ where: { id: retried.body.sourceJobId } });
    expect(newJob?.status).toBe('COMPLETED');
    const newVisual = (newJob?.output as { stages?: { visual?: { assetIds?: string[] } } }).stages?.visual;
    expect(newVisual?.assetIds).toEqual(oldVisual?.assetIds);
    const links = await prisma.assetLink.findMany({
      where: { jobId: retried.body.sourceJobId, tenantId: user.tenantId, role: 'VIDEO_SOURCE' },
    });
    expect(links).toHaveLength(oldVisual?.assetIds?.length ?? 0);
  });

  it('does not regenerate checkpointed visual scenes after a mid-stage failure', async () => {
    const user = await registerUser(app, 'JpVisResume');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id, requirements: '__mock_fail_visual_after_3__' })
      .expect(201);
    const jobId = created.body.sourceJobId as string;
    await app.get(JobProcessor).process(jobId);
    const failed = await prisma.job.findFirst({ where: { id: jobId } });
    expect(failed?.status).toBe('FAILED');
    const visual = (failed?.output as { stages?: { visual?: { assetIds?: string[]; scenes?: Array<{ status?: string }> } } })
      .stages?.visual;
    expect(visual?.assetIds).toHaveLength(3);
    expect(visual?.scenes?.filter((item) => item.status === 'ready')).toHaveLength(3);

    const input = { ...(failed?.input as Record<string, unknown>) };
    delete input.requirements;
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'RUNNING',
        input,
        lastHeartbeatAt: new Date(Date.now() - 120_000),
        completedAt: null,
        error: undefined,
      },
    });
    await prisma.video.update({
      where: { id_tenantId: { id: created.body.id, tenantId: user.tenantId } },
      data: { status: 'PENDING' },
    });
    const images = app.get(ColorBackgroundImageProvider);
    const spy = vi.spyOn(images, 'generate');
    await expect(app.get(JobProcessor).process(jobId)).resolves.toMatchObject({ status: 'completed' });
    const remaining = ((failed?.input as { productionPlan?: { scenes?: unknown[] } }).productionPlan?.scenes?.length ?? 0) - 3;
    expect(spy).toHaveBeenCalledTimes(remaining);
    spy.mockRestore();
    const recovered = await prisma.job.findFirst({ where: { id: jobId } });
    expect(recovered?.status).toBe('COMPLETED');
    const recoveredVisual = (recovered?.output as { stages?: { visual?: { assetIds?: string[] } } }).stages?.visual;
    expect(recoveredVisual?.assetIds?.slice(0, 3)).toEqual(visual?.assetIds);
  });

  it('updates lastHeartbeatAt for a running job', async () => {
    const user = await registerUser(app, 'JpBeat');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id })
      .expect(201);
    const jobId = created.body.sourceJobId as string;
    await app.get(JobProcessor).process(jobId);
    const old = new Date('2026-01-01T00:00:00.000Z');
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'RUNNING', lastHeartbeatAt: old, completedAt: null },
    });
    await app.get(JobsService).heartbeat(user.tenantId, jobId);
    const beat = await prisma.job.findFirst({ where: { id: jobId } });
    expect(beat?.lastHeartbeatAt?.getTime()).toBeGreaterThan(old.getTime());
  });

  it('fails before finalize without completing the video, then reclaims the compose asset', async () => {
    const user = await registerUser(app, 'JpFin');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id, requirements: '__mock_fail_finalize__' })
      .expect(201);
    const jobId = created.body.sourceJobId as string;
    await app.get(JobProcessor).process(jobId);
    const failed = await prisma.job.findFirst({ where: { id: jobId } });
    expect(failed?.status).toBe('FAILED');
    const videoFailed = await prisma.video.findFirst({ where: { id: created.body.id } });
    expect(videoFailed?.status).not.toBe('COMPLETED');
    expect(videoFailed?.outputAssetId).toBeNull();
    const composeId = (failed?.output as { stages?: { compose?: { assetIds?: string[] } } }).stages?.compose
      ?.assetIds?.[0];
    expect(composeId).toBeTruthy();

    const input = { ...(failed?.input as Record<string, unknown>) };
    delete input.requirements;
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'RUNNING',
        input,
        lastHeartbeatAt: new Date(Date.now() - 120_000),
        completedAt: null,
        error: undefined,
      },
    });
    await prisma.video.update({
      where: { id_tenantId: { id: created.body.id, tenantId: user.tenantId } },
      data: { status: 'PENDING' },
    });
    const compose = app.get(MockComposeProvider);
    const spy = vi.spyOn(compose, 'compose');
    await expect(app.get(JobProcessor).process(jobId)).resolves.toMatchObject({ status: 'completed' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    const recovered = await prisma.job.findFirst({ where: { id: jobId } });
    expect(recovered?.status).toBe('COMPLETED');
    const video = await prisma.video.findFirst({ where: { id: created.body.id } });
    expect(video?.status).toBe('COMPLETED');
    expect(video?.outputAssetId).toBe(composeId);
    const outputs = await prisma.assetLink.findMany({
      where: { videoId: created.body.id, tenantId: user.tenantId, role: 'VIDEO_OUTPUT' },
    });
    expect(outputs).toHaveLength(1);
  });
});

describe('Job enqueue failure (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-enq-${process.pid}`);
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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('marks the job failed when enqueue fails', async () => {
    const user = await registerUser(app, 'EnqFail');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id })
      .expect(503);
    const job = await prisma.job.findFirst({
      where: { tenantId: user.tenantId, scriptId: script.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(job?.status).toBe('FAILED');
    expect((job?.error as { code?: string } | null)?.code).toBe(ErrorCode.JOB_ENQUEUE_FAILED);
    const video = await prisma.video.findFirst({
      where: { tenantId: user.tenantId, scriptId: script.id },
    });
    expect(video?.status).toBe('FAILED');
  });
});
