import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AssetType, PrismaClient } from '@prisma/client';
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
import { ErrorCode } from '../src/common/errors/app-error.js';
import { JobProcessor } from '../src/jobs/job.processor.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { finalizeJob } from '../src/videos/finalize-video-job.js';

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
    .send({ name: 'Finalize项目' })
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

async function seedPendingVideo(
  app: INestApplication,
  prisma: PrismaClient,
  user: { token: string; tenantId: string; workspaceId: string },
) {
  const project = await createProject(app, user.token);
  const script = await createConfirmedScript(app, user.token, project.id);
  const created = await request(app.getHttpServer())
    .post('/videos')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ scriptId: script.id })
    .expect(201);
  await prisma.job.update({
    where: { id: created.body.sourceJobId },
    data: {
      status: 'RUNNING',
      output: {
        currentStage: 'compose',
        stages: {
          visual: { status: 'completed', assetIds: [randomUUID()] },
          voice: { status: 'completed', assetIds: [randomUUID()] },
          subtitle: { status: 'completed', assetIds: [randomUUID()] },
          compose: { status: 'completed', assetIds: [] },
        },
        usage: { imageCount: 2, audioCharacters: 40, audioSeconds: 8, videoSeconds: 8, estimatedCost: 0 },
        timeline: { targetDuration: 15, voiceDuration: 8, composeDuration: 8 },
      },
    },
  });
  return { project, videoId: created.body.id as string, jobId: created.body.sourceJobId as string };
}

async function createReadyVideoAsset(
  prisma: PrismaClient,
  ids: { tenantId: string; workspaceId: string; projectId: string; jobId: string; videoId: string },
) {
  const assetId = randomUUID();
  await prisma.asset.create({
    data: {
      id: assetId,
      tenantId: ids.tenantId,
      workspaceId: ids.workspaceId,
      projectId: ids.projectId,
      type: AssetType.VIDEO,
      status: 'READY',
      storageProvider: 'local',
      storageKey: `v1/${ids.tenantId}/${ids.workspaceId}/${ids.projectId}/${assetId}/${assetId}`,
      mimeType: 'video/mp4',
      size: 32,
      duration: 8,
      width: 1080,
      height: 1920,
      metadata: { jobId: ids.jobId, videoId: ids.videoId, stage: 'compose' },
    },
  });
  return assetId;
}

describe('Video finalize (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-finalize-${process.pid}`);
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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('finalizes once, is idempotent, and refuses a different asset', async () => {
    const user = await registerUser(app, 'FzOk');
    const seeded = await seedPendingVideo(app, prisma, user);
    const assetA = await createReadyVideoAsset(prisma, {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: seeded.project.id,
      jobId: seeded.jobId,
      videoId: seeded.videoId,
    });
    await prisma.job.update({
      where: { id: seeded.jobId },
      data: {
        output: {
          currentStage: 'compose',
          stages: {
            visual: { status: 'completed', assetIds: ['vis'] },
            voice: { status: 'completed', assetIds: ['voi'] },
            subtitle: { status: 'completed', assetIds: ['sub'] },
            compose: { status: 'completed', assetIds: [assetA], duration: 8 },
          },
          usage: { imageCount: 2, audioCharacters: 40, audioSeconds: 8, videoSeconds: 8, estimatedCost: 0 },
          timeline: { targetDuration: 15, voiceDuration: 8, composeDuration: 8 },
        },
      },
    });
    const first = await finalizeJob(prisma, {
      tenantId: user.tenantId,
      jobId: seeded.jobId,
      outputAssetId: assetA,
      duration: 8,
    });
    expect(first.outputAssetId).toBe(assetA);
    const second = await finalizeJob(prisma, {
      tenantId: user.tenantId,
      jobId: seeded.jobId,
      outputAssetId: assetA,
      duration: 8,
    });
    expect(second.reused).toBe(true);

    const job = await prisma.job.findFirst({ where: { id: seeded.jobId } });
    const video = await prisma.video.findFirst({ where: { id: seeded.videoId } });
    const links = await prisma.assetLink.findMany({
      where: { videoId: seeded.videoId, tenantId: user.tenantId, role: 'VIDEO_OUTPUT' },
    });
    expect(job?.status).toBe('COMPLETED');
    expect(job?.progress).toBe(100);
    expect(job?.completedAt).toBeTruthy();
    expect(video?.status).toBe('COMPLETED');
    expect(video?.outputAssetId).toBe(assetA);
    expect(video?.sourceJobId).toBe(seeded.jobId);
    expect(video?.duration).toBe(8);
    expect(links).toHaveLength(1);
    const output = job?.output as {
      stages?: Record<string, unknown>;
      usage?: { audioSeconds?: number };
      timeline?: { voiceDuration?: number };
      final?: { assetId?: string };
    };
    expect(output.stages?.visual).toBeTruthy();
    expect(output.stages?.voice).toBeTruthy();
    expect(output.stages?.subtitle).toBeTruthy();
    expect(output.stages?.compose).toBeTruthy();
    expect(output.usage?.audioSeconds).toBe(8);
    expect(output.timeline?.voiceDuration).toBe(8);
    expect(output.final?.assetId).toBe(assetA);

    const assetB = await createReadyVideoAsset(prisma, {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: seeded.project.id,
      jobId: seeded.jobId,
      videoId: seeded.videoId,
    });
    await expect(
      finalizeJob(prisma, { tenantId: user.tenantId, jobId: seeded.jobId, outputAssetId: assetB }),
    ).rejects.toMatchObject({ code: ErrorCode.VIDEO_CONFLICT });
    const afterConflict = await prisma.video.findFirst({ where: { id: seeded.videoId } });
    expect(afterConflict?.outputAssetId).toBe(assetA);
    await expect(app.get(JobsService).fail(user.tenantId, seeded.jobId, { code: 'X' })).resolves.toMatchObject({
      status: 'COMPLETED',
    });
  });

  it('recovers a VIDEO_OUTPUT link when the video pointer is missing', async () => {
    const user = await registerUser(app, 'FzLink');
    const seeded = await seedPendingVideo(app, prisma, user);
    const assetA = await createReadyVideoAsset(prisma, {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: seeded.project.id,
      jobId: seeded.jobId,
      videoId: seeded.videoId,
    });
    await prisma.assetLink.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        projectId: seeded.project.id,
        assetId: assetA,
        videoId: seeded.videoId,
        jobId: seeded.jobId,
        role: 'VIDEO_OUTPUT',
      },
    });
    await finalizeJob(prisma, { tenantId: user.tenantId, jobId: seeded.jobId, outputAssetId: assetA, duration: 8 });
    const video = await prisma.video.findFirst({ where: { id: seeded.videoId } });
    expect(video?.outputAssetId).toBe(assetA);
    expect(video?.status).toBe('COMPLETED');
    expect(
      await prisma.assetLink.count({
        where: { videoId: seeded.videoId, tenantId: user.tenantId, role: 'VIDEO_OUTPUT' },
      }),
    ).toBe(1);
  });

  it('recovers a missing VIDEO_OUTPUT when the video pointer already exists', async () => {
    const user = await registerUser(app, 'FzPtr');
    const seeded = await seedPendingVideo(app, prisma, user);
    const assetA = await createReadyVideoAsset(prisma, {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: seeded.project.id,
      jobId: seeded.jobId,
      videoId: seeded.videoId,
    });
    await prisma.video.update({
      where: { id_tenantId: { id: seeded.videoId, tenantId: user.tenantId } },
      data: { outputAssetId: assetA },
    });
    await finalizeJob(prisma, { tenantId: user.tenantId, jobId: seeded.jobId, outputAssetId: assetA, duration: 8 });
    const video = await prisma.video.findFirst({ where: { id: seeded.videoId } });
    expect(video?.status).toBe('COMPLETED');
    expect(video?.outputAssetId).toBe(assetA);
    expect(
      await prisma.assetLink.count({
        where: { videoId: seeded.videoId, tenantId: user.tenantId, role: 'VIDEO_OUTPUT' },
      }),
    ).toBe(1);
  });

  it('rejects a VIDEO_OUTPUT / outputAssetId mismatch', async () => {
    const user = await registerUser(app, 'FzBad');
    const seeded = await seedPendingVideo(app, prisma, user);
    const assetA = await createReadyVideoAsset(prisma, {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: seeded.project.id,
      jobId: seeded.jobId,
      videoId: seeded.videoId,
    });
    const assetB = await createReadyVideoAsset(prisma, {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: seeded.project.id,
      jobId: seeded.jobId,
      videoId: seeded.videoId,
    });
    await prisma.assetLink.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        projectId: seeded.project.id,
        assetId: assetA,
        videoId: seeded.videoId,
        jobId: seeded.jobId,
        role: 'VIDEO_OUTPUT',
      },
    });
    await prisma.video.update({
      where: { id_tenantId: { id: seeded.videoId, tenantId: user.tenantId } },
      data: { outputAssetId: assetB },
    });
    await expect(
      finalizeJob(prisma, { tenantId: user.tenantId, jobId: seeded.jobId, outputAssetId: assetA }),
    ).rejects.toMatchObject({ code: ErrorCode.VIDEO_CONFLICT });
    const video = await prisma.video.findFirst({ where: { id: seeded.videoId } });
    expect(video?.status).toBe('PENDING');
    expect(video?.outputAssetId).toBe(assetB);
  });

  it('completes the public pipeline through finalize with a single VIDEO_OUTPUT', async () => {
    const user = await registerUser(app, 'FzPipe');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id })
      .expect(201);
    await app.get(JobProcessor).process(created.body.sourceJobId);
    const done = await request(app.getHttpServer())
      .get(`/videos/${created.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(done.body.status).toBe('COMPLETED');
    expect(done.body.job.status).toBe('COMPLETED');
    expect(done.body.outputAssetId).toBeTruthy();
    const outputs = await prisma.assetLink.findMany({
      where: { videoId: created.body.id, tenantId: user.tenantId, role: 'VIDEO_OUTPUT' },
    });
    expect(outputs).toHaveLength(1);
  });
});
