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

async function registerUser(app: INestApplication, name = 'EvidenceOwner') {
  const email = `${name.toLowerCase()}-${suffix()}@example.com`;
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'password1', name })
    .expect(201);
  return {
    token: res.body.accessToken as string,
    tenantId: res.body.tenant.id as string,
  };
}

async function createProject(app: INestApplication, token: string, name = '证据项目') {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name })
    .expect(201);
  return res.body as { id: string };
}

describe('Market Evidence foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-market-evidence-${process.pid}`);
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

  it('reads deterministic evidence without writing or calling providers', async () => {
    const user = await registerUser(app);
    const project = await createProject(app, user.token);
    await request(app.getHttpServer())
      .post(`/projects/${project.id}/product-briefs`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        productName: '防脱精华',
        industry: '个护',
        businessGoal: '获客',
        seedKeywords: ['防脱'],
        sellingPoints: ['植物防脱'],
      })
      .expect(201);

    const confirmed = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectedAt: '2026-09-01T00:00:00.000Z',
        items: [
          { kind: 'KEYWORD', platform: 'douyin', keyword: '防脱', volumeSignal: 'high', competitionSignal: 'low' },
          {
            kind: 'CONTENT',
            platform: 'douyin',
            title: '样本A',
            views: 100,
            likes: 10,
            comments: 2,
            shares: 1,
            favorites: 1,
          },
        ],
      })
      .expect(201);

    const researchCount = await prisma.marketResearch.count({ where: { tenantId: user.tenantId } });
    const snapshotCount = await prisma.marketResearchSnapshot.count({ where: { tenantId: user.tenantId } });
    const agentCount = await prisma.agentRun.count({ where: { tenantId: user.tenantId } });
    const jobCount = await prisma.job.count({ where: { tenantId: user.tenantId } });

    const first = await request(app.getHttpServer())
      .get(`/market-research/${confirmed.body.id}/evidence`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(`/market-research/${confirmed.body.id}/evidence`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(first.body.version).toBe('v1');
    expect(first.body.marketResearchId).toBe(confirmed.body.id);
    expect(first.body.dataSufficiency).toBe('LIMITED');
    expect(first.body.dataQualityFlags).toContain('MANUAL_ONLY');
    expect(first.body.keywordEvidence.some((item: { code: string }) => item.code === 'KEYWORD_SAMPLE_SIZE')).toBe(true);
    expect(first.body.opportunityEvidence.every((item: { evidenceKind: string }) => item.evidenceKind === 'INFERRED')).toBe(true);
    const { generatedAt: _a, ...left } = first.body;
    const { generatedAt: _b, ...right } = second.body;
    expect(left).toEqual(right);

    expect(await prisma.marketResearch.count({ where: { tenantId: user.tenantId } })).toBe(researchCount);
    expect(await prisma.marketResearchSnapshot.count({ where: { tenantId: user.tenantId } })).toBe(snapshotCount);
    expect(await prisma.agentRun.count({ where: { tenantId: user.tenantId } })).toBe(agentCount);
    expect(await prisma.job.count({ where: { tenantId: user.tenantId } })).toBe(jobCount);

    const other = await registerUser(app, 'EvidenceOther');
    await request(app.getHttpServer())
      .get(`/market-research/${confirmed.body.id}/evidence`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe(ErrorCode.MARKET_RESEARCH_NOT_FOUND);
      });
  });
});
