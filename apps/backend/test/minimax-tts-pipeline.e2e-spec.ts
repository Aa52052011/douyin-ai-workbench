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
import { isMiniMaxTtsConfigured } from '../src/media/tts/minimax-tts-config.js';
import { StorageService } from '../src/media/storage/storage.service.js';
import { JobProcessor } from '../src/jobs/job.processor.js';

const enabled =
  process.env.RUN_REAL_TTS_TESTS === 'true' &&
  process.env.RUN_FFMPEG_TESTS === 'true' &&
  process.env.MEDIA_TTS_PROVIDER === 'minimax-tts' &&
  isMiniMaxTtsConfigured() &&
  isFfmpegAvailable();

function suffix(): string {
  return randomUUID().slice(0, 8);
}

describe.skipIf(!enabled)('MiniMax TTS + FFmpeg pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let previousCompose: string | undefined;
  let previousTts: string | undefined;

  beforeAll(async () => {
    previousCompose = process.env.MEDIA_COMPOSE_PROVIDER;
    previousTts = process.env.MEDIA_TTS_PROVIDER;
    process.env.NODE_ENV = 'test';
    process.env.RUN_FFMPEG_TESTS = 'true';
    process.env.RUN_REAL_TTS_TESTS = 'true';
    process.env.MEDIA_COMPOSE_PROVIDER = 'ffmpeg';
    process.env.MEDIA_TTS_PROVIDER = 'minimax-tts';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-minimax-tts-e2e-${process.pid}`);
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
    if (previousTts === undefined) {
      delete process.env.MEDIA_TTS_PROVIDER;
    } else {
      process.env.MEDIA_TTS_PROVIDER = previousTts;
    }
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('completes a real mp4 from MiniMax TTS through finalize', async () => {
    const email = `minimax-${suffix()}@example.com`;
    const user = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password1', name: 'MiniMaxUser' })
      .expect(201);
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${user.body.accessToken}`)
      .send({ name: 'MiniMax成片' })
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
    expect(JSON.stringify(done.body)).not.toContain('MINIMAX_TTS_API_KEY');
    expect(JSON.stringify(done.body)).not.toContain('storageKey');
    const outputAsset = await prisma.asset.findFirstOrThrow({
      where: { id: done.body.outputAssetId, tenantId: user.body.tenant.id },
    });
    const body = await app.get(StorageService).get(outputAsset.storageKey);
    const mp4Path = path.join(process.env.MEDIA_STORAGE_ROOT!, 'minimax-tts-probe.mp4');
    await writeFile(mp4Path, body);
    const probed = await runChildProcess(ffprobeBin(), buildFfprobeArgs(mp4Path), { timeoutMs: 15_000 });
    const summary = parseFfprobeJson(probed.stdout);
    expect(summary?.hasVideo).toBe(true);
    expect(summary?.hasAudio).toBe(true);
    expect(summary?.duration).toBeGreaterThan(0);
  }, 180_000);
});
