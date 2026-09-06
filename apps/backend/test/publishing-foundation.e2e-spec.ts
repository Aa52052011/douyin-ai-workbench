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
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from '../src/agents/definitions/account-positioning.fixture.js';
import { configureApp } from '../src/configure-app.js';
import { JobProcessor } from '../src/jobs/job.processor.js';
import { EncryptedDbSecretStore } from '../src/publishing/secrets/encrypted-db.secret-store.js';
import { PublishingProviderRegistry } from '../src/publishing/providers/publishing-provider.registry.js';
import { AppError, ErrorCode } from '../src/common/errors/app-error.js';

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
    .send({ name: '发布基础' })
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

describe('Publishing foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const masterKey = randomBytes(32);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = masterKey.toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-pub-${process.pid}`);
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    process.env.MEDIA_COMPOSE_PROVIDER = 'mock';
    process.env.MEDIA_IMAGE_PROVIDER = 'color-background';
    delete process.env.AI_ENGINE_URL;
    delete process.env.MODEL_API_KEY;
    delete process.env.RUN_REDIS_TESTS;
    delete process.env.RUN_REAL_TTS_TESTS;
    delete process.env.RUN_REAL_VISUAL_TESTS;
    delete process.env.WANX_API_KEY;
    delete process.env.MINIMAX_TTS_API_KEY;
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

  it('returns the generation job even when a newer VIDEO_PUBLISH job exists', async () => {
    const user = await registerUser(app, 'PubJob');
    const project = await createProject(app, user.token);
    const script = await createConfirmedScript(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ scriptId: script.id, targetDuration: 15 })
      .expect(201);
    await app.get(JobProcessor).process(created.body.sourceJobId);
    const completed = await request(app.getHttpServer())
      .get(`/videos/${created.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(completed.body.status).toBe('COMPLETED');
    const generationJobId = completed.body.sourceJobId as string;

    await prisma.job.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        projectId: project.id,
        kind: JobKind.VIDEO_PUBLISH,
        status: JobStatus.PENDING,
        requestId: `pub-${suffix()}`,
        videoId: created.body.id,
        input: { publicationId: randomUUID() },
      },
    });

    const detail = await request(app.getHttpServer())
      .get(`/videos/${created.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(detail.body.job.id).toBe(generationJobId);
    expect(detail.body.job.kind).toBe('VIDEO_GENERATION');
    expect(detail.body.job.status).toBe('COMPLETED');
  });

  it('fail-closes VIDEO_PUBLISH without running generation or calling platforms', async () => {
    const user = await registerUser(app, 'PubFail');
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
        kind: JobKind.VIDEO_PUBLISH,
        status: JobStatus.PENDING,
        requestId: `pub-fail-${suffix()}`,
        videoId: video.id,
      },
    });
    const result = await app.get(JobProcessor).process(job.id);
    expect(result.status).toBe('failed');
    const stored = await prisma.job.findFirst({ where: { id: job.id, tenantId: user.tenantId } });
    expect(stored?.status).toBe('FAILED');
    expect((stored?.error as { code?: string } | null)?.code).toBe('PUBLICATION_NOT_FOUND');
    const still = await prisma.video.findFirst({ where: { id: video.id, tenantId: user.tenantId } });
    expect(still?.status).toBe('COMPLETED');
  });

  it('encrypts dummy secrets to DB and enforces scope plus revoke', async () => {
    const user = await registerUser(app, 'PubSec');
    const store = new EncryptedDbSecretStore(prisma, () => masterKey);
    const dummy = {
      accessToken: 'dummy-access-not-a-real-token',
      refreshToken: 'dummy-refresh-not-a-real-token',
    };
    const ref = await store.put({
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      kind: 'PLATFORM_OAUTH',
      payload: dummy,
    });
    const row = await prisma.platformSecret.findFirst({
      where: { id: ref.id, tenantId: user.tenantId },
    });
    expect(row).toBeTruthy();
    expect(Buffer.from(row!.cipher).toString('utf8')).not.toContain(dummy.accessToken);
    expect(Buffer.from(row!.cipher).toString('utf8')).not.toContain(dummy.refreshToken);

    const loaded = await store.get(ref, { tenantId: user.tenantId, workspaceId: user.workspaceId });
    expect(loaded).toEqual(dummy);

    const other = await registerUser(app, 'PubSecB');
    await expect(store.get(ref, { tenantId: other.tenantId, workspaceId: other.workspaceId })).rejects.toMatchObject({
      code: 'SECRET_NOT_FOUND',
    });
    await expect(store.get(ref, { tenantId: user.tenantId, workspaceId: other.workspaceId })).rejects.toMatchObject({
      code: 'SECRET_NOT_FOUND',
    });

    await store.revoke(ref, { tenantId: user.tenantId, workspaceId: user.workspaceId });
    await expect(store.get(ref, { tenantId: user.tenantId, workspaceId: user.workspaceId })).rejects.toMatchObject({
      code: 'SECRET_REVOKED',
    });

    const wrongKeyStore = new EncryptedDbSecretStore(prisma, () => randomBytes(32));
    const otherRef = await store.put({
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      kind: 'PLATFORM_OAUTH',
      payload: dummy,
    });
    await expect(
      wrongKeyStore.get(otherRef, { tenantId: user.tenantId, workspaceId: user.workspaceId }),
    ).rejects.toMatchObject({ code: 'SECRET_DECRYPT_FAILED' });
  });

  it('wires MOCK publisher and fail-closes Douyin without HTTP APIs', async () => {
    const registry = app.get(PublishingProviderRegistry);
    expect(registry.resolve(Platform.MOCK).platform).toBe(Platform.MOCK);
    expect(() => registry.resolve(Platform.DOUYIN)).toThrowError(AppError);
    try {
      registry.resolve(Platform.DOUYIN);
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.PUBLISHING_PROVIDER_NOT_IMPLEMENTED });
    }
  });
});
