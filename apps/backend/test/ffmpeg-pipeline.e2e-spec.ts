import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
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
import { isFfmpegAvailable } from '../src/media/ffmpeg/ffmpeg-available.js';
import { ffprobeBin } from '../src/media/ffmpeg/ffmpeg-config.js';
import { buildFfprobeArgs, parseFfprobeJson } from '../src/media/ffmpeg/ffprobe.js';
import { runChildProcess } from '../src/media/ffmpeg/run-process.js';
import { StorageService } from '../src/media/storage/storage.service.js';
import { JobProcessor } from '../src/jobs/job.processor.js';

const enabled = process.env.RUN_FFMPEG_TESTS === 'true' && isFfmpegAvailable();

function suffix(): string {
  return randomUUID().slice(0, 8);
}

describe.skipIf(!enabled)('FFmpeg pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let previousCompose: string | undefined;

  beforeAll(async () => {
    previousCompose = process.env.MEDIA_COMPOSE_PROVIDER;
    process.env.NODE_ENV = 'test';
    process.env.RUN_FFMPEG_TESTS = 'true';
    process.env.MEDIA_COMPOSE_PROVIDER = 'ffmpeg';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-ff-e2e-${process.pid}`);
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
    if (previousCompose === undefined) {
      delete process.env.MEDIA_COMPOSE_PROVIDER;
    } else {
      process.env.MEDIA_COMPOSE_PROVIDER = previousCompose;
    }
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('completes a real mp4 through finalize', async () => {
    const email = `ff-${suffix()}@example.com`;
    const user = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password1', name: 'FfUser' })
      .expect(201);
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${user.body.accessToken}`)
      .send({ name: 'FFmpeg成片' })
      .expect(201);
    const plan = await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${user.body.accessToken}`)
      .send({
        projectId: project.body.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/content-plans/${plan.body.id}/confirm`)
      .set('Authorization', `Bearer ${user.body.accessToken}`)
      .expect(200);
    const script = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.body.accessToken}`)
      .send({
        contentPlanId: plan.body.id,
        topicId: plan.body.payload.topics[0].id,
        targetDuration: 15,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/scripts/${script.body.id}/confirm`)
      .set('Authorization', `Bearer ${user.body.accessToken}`)
      .expect(200);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.body.accessToken}`)
      .send({ scriptId: script.body.id })
      .expect(201);
    await app.get(JobProcessor).process(created.body.sourceJobId);
    const done = await request(app.getHttpServer())
      .get(`/videos/${created.body.id}`)
      .set('Authorization', `Bearer ${user.body.accessToken}`)
      .expect(200);
    expect(done.body.status).toBe('COMPLETED');
    expect(done.body.job.status).toBe('COMPLETED');
    expect(done.body.duration).toBeGreaterThan(0);
    const links = await prisma.assetLink.findMany({
      where: { videoId: created.body.id, tenantId: user.body.tenant.id, role: 'VIDEO_OUTPUT' },
    });
    expect(links).toHaveLength(1);
    expect(done.body.outputAssetId).toBeTruthy();
    expect(JSON.stringify(done.body)).not.toContain('storageKey');
    expect(JSON.stringify(done.body)).not.toContain('FFMPEG_PATH');

    const outputAsset = await prisma.asset.findFirstOrThrow({
      where: { id: done.body.outputAssetId, tenantId: user.body.tenant.id },
    });
    expect(outputAsset.mimeType).toBe('video/mp4');
    expect(outputAsset.size).toBeGreaterThan(0);
    const body = await app.get(StorageService).get(outputAsset.storageKey);
    expect(body.byteLength).toBeGreaterThan(0);
    const mp4Path = path.join(process.env.MEDIA_STORAGE_ROOT!, 'e2e-probe.mp4');
    await writeFile(mp4Path, body);
    const probed = await runChildProcess(ffprobeBin(), buildFfprobeArgs(mp4Path), {
      timeoutMs: 15_000,
    });
    const summary = parseFfprobeJson(probed.stdout);
    expect(summary?.hasVideo).toBe(true);
    expect(summary?.hasAudio).toBe(true);
    expect(summary?.duration).toBeGreaterThan(0);
    expect(summary?.videoCodec).toBe('h264');
    expect(summary?.audioCodec).toBe('aac');
    console.log(
      'FFMPEG_E2E_PROBE',
      JSON.stringify({
        videoStatus: done.body.status,
        jobStatus: done.body.job.status,
        videoDuration: done.body.duration,
        width: done.body.width,
        height: done.body.height,
        assetSize: outputAsset.size,
        probe: {
          duration: summary?.duration,
          videoCodec: summary?.videoCodec,
          audioCodec: summary?.audioCodec,
          width: summary?.width,
          height: summary?.height,
          fps: summary?.fps,
        },
        videoOutputCount: links.length,
      }),
    );

    await request(app.getHttpServer())
      .get(`/assets/${done.body.outputAssetId}/content`)
      .set('Authorization', `Bearer ${user.body.accessToken}`)
      .expect(200)
      .expect('Content-Type', /video\/mp4/);
  }, 120_000);
});
