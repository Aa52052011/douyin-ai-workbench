import { randomBytes, randomUUID } from 'node:crypto';
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
import { configureApp } from '../src/configure-app.js';
import { ErrorCode } from '../src/common/errors/app-error.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function registerUser(app: INestApplication, name = 'MarketOwner') {
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

async function createProject(app: INestApplication, token: string, name = '市场项目') {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name })
    .expect(201);
  return res.body as { id: string };
}

const briefV1 = {
  productName: '职场表达课',
  industry: '教育',
  businessGoal: '获客',
  seedKeywords: ['职场沟通'],
};

describe('ProductBrief + Market Research foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-market-${process.pid}`);
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    process.env.MEDIA_COMPOSE_PROVIDER = 'mock';
    process.env.MEDIA_IMAGE_PROVIDER = 'color-background';
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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('versions ProductBrief and keeps old rows immutable', async () => {
    const user = await registerUser(app);
    const project = await createProject(app, user.token);
    const v1 = await request(app.getHttpServer())
      .post(`/projects/${project.id}/product-briefs`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(briefV1)
      .expect(201);
    expect(v1.body.version).toBe(1);
    expect(v1.body.payload.productName).toBe('职场表达课');

    const v2 = await request(app.getHttpServer())
      .post(`/projects/${project.id}/product-briefs`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ ...briefV1, productName: '职场表达课 v2', businessGoal: '转化' })
      .expect(201);
    expect(v2.body.version).toBe(2);

    const current = await request(app.getHttpServer())
      .get(`/projects/${project.id}/product-briefs/current`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(current.body.id).toBe(v2.body.id);
    expect(current.body.payload.productName).toBe('职场表达课 v2');

    const storedV1 = await request(app.getHttpServer())
      .get(`/product-briefs/${v1.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(storedV1.body.payload.productName).toBe('职场表达课');
    expect(storedV1.body.payload.businessGoal).toBe('获客');

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/product-briefs`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productName: '', industry: '教育', businessGoal: '获客' })
      .expect(400);

    const other = await registerUser(app, 'MarketOther');
    await request(app.getHttpServer())
      .get(`/product-briefs/${v1.body.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe(ErrorCode.PRODUCT_BRIEF_NOT_FOUND);
      });

    const concurrentProject = await createProject(app, user.token, '并发项目');
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/projects/${concurrentProject.id}/product-briefs`)
        .set('Authorization', `Bearer ${user.token}`)
        .send(briefV1),
      request(app.getHttpServer())
        .post(`/projects/${concurrentProject.id}/product-briefs`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ ...briefV1, productName: '并发B' }),
    ]);
    expect([a.status, b.status].every((status) => status === 201)).toBe(true);
    const versions = [a.body.version, b.body.version].sort((left: number, right: number) => left - right);
    expect(versions).toEqual([1, 2]);
  });

  it('previews without writing and confirms an immutable MANUAL snapshot', async () => {
    const user = await registerUser(app, 'ResearchOwner');
    const project = await createProject(app, user.token, '研究项目');
    await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/preview`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectedAt: '2026-09-01T00:00:00.000Z',
        items: [{ kind: 'KEYWORD', platform: 'douyin', keyword: '职场沟通' }],
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe(ErrorCode.PRODUCT_BRIEF_REQUIRED);
      });

    const brief = await request(app.getHttpServer())
      .post(`/projects/${project.id}/product-briefs`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(briefV1)
      .expect(201);
    const before = await prisma.marketResearch.count({ where: { tenantId: user.tenantId } });

    const payload = {
      collectedAt: '2026-09-01T00:00:00.000Z',
      items: [
        { kind: 'KEYWORD', platform: 'douyin', keyword: '职场沟通' },
        { kind: 'KEYWORD', platform: 'douyin', keyword: ' 职场沟通 ' },
        {
          kind: 'CONTENT',
          platform: 'douyin',
          title: 'manual sample A',
          views: 100,
          likes: 10,
          comments: 2,
          shares: 1,
          favorites: 1,
        },
        { kind: 'CONTENT', platform: 'douyin', title: 'manual sample B', views: 200 },
        { kind: 'COMPETITOR', platform: 'douyin', displayName: 'manual sample account' },
      ],
    };
    const preview = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/preview`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(payload)
      .expect(201);
    expect(preview.body.items).toHaveLength(4);
    expect(preview.body.duplicateCount).toBe(1);
    expect(preview.body.dataQuality.dataSufficiency).toBe('LIMITED');
    expect(preview.body.dataQuality.manualOnly).toBe(true);
    expect(preview.body.sampleStats.note).toBe('snapshot_sample_only');
    expect(preview.body.sampleStats.medianViews).toBe(150);
    expect(await prisma.marketResearch.count({ where: { tenantId: user.tenantId } })).toBe(before);
    expect(await prisma.marketResearchSnapshot.count({ where: { tenantId: user.tenantId } })).toBe(0);

    const confirmed = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(payload)
      .expect(201);
    expect(confirmed.body.status).toBe('READY');
    expect(confirmed.body.version).toBe(1);
    expect(confirmed.body.sourceAgentRunId).toBeNull();
    expect(confirmed.body.sourceJobId).toBeNull();
    expect(confirmed.body.productBriefId).toBe(brief.body.id);
    expect(confirmed.body.productBriefSnapshot.productName).toBe('职场表达课');
    expect(confirmed.body.snapshot.sources).toEqual(['MANUAL']);
    expect(confirmed.body.snapshot.keywords[0].source).toBe('MANUAL');
    expect(confirmed.body.snapshot.sampleStats.keywordCount).toBe(1);
    expect(confirmed.body.snapshot.sampleStats.contentCount).toBe(2);
    expect(confirmed.body.snapshot.sampleStats.competitorCount).toBe(1);
    expect(confirmed.body.snapshot.dataQuality.dataSufficiency).toBe('LIMITED');

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/product-briefs`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ ...briefV1, productName: '新名字' })
      .expect(201);
    const stored = await request(app.getHttpServer())
      .get(`/market-research/${confirmed.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(stored.body.productBriefSnapshot.productName).toBe('职场表达课');
    expect(await prisma.marketResearchSnapshot.count({ where: { marketResearchId: confirmed.body.id } })).toBe(1);

    const otherProject = await createProject(app, user.token, '隔离项目');
    await request(app.getHttpServer())
      .post(`/projects/${otherProject.id}/product-briefs`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(briefV1)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/projects/${otherProject.id}/market-research/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        productBriefId: brief.body.id,
        collectedAt: '2026-09-01T00:00:00.000Z',
        items: [{ kind: 'KEYWORD', platform: 'douyin', keyword: '跨项目' }],
      })
      .expect(404);
  });
});
