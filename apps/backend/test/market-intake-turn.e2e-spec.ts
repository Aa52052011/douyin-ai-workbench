import { randomUUID } from 'node:crypto';
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
import { MockModelProvider } from '../src/agents/models/mock.provider.js';

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

async function createProjectWithBrief(app: INestApplication, token: string) {
  const project = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Market Intake 项目' })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/projects/${project.body.id}/product-briefs`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      productName: '美拍助手',
      industry: '本地服务',
      businessGoal: '到店咨询',
      targetAudience: '美甲店老板',
      description: '帮助美甲店生成抖音短视频',
      sellingPoints: ['自动剪辑'],
    })
    .expect(201);
  return project.body.id as string;
}

describe('Market Intake turn (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MODEL_PROVIDER = 'mock';
    delete process.env.AI_ENGINE_URL;
    const databaseUrl = await startTestDatabase();
    process.env.DATABASE_URL = databaseUrl;
    migrateDeploy(databaseUrl);
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('requires auth', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${randomUUID()}/intake/market/turn`)
      .send({
        clientTurnId: randomUUID(),
        userMessage: 'hello',
        draft: {},
        messages: [],
      })
      .expect(401);
  });

  it('isolates cross-project access with 404', async () => {
    const a = await registerUser(app, 'A');
    const b = await registerUser(app, 'B');
    const projectId = await createProjectWithBrief(app, a.token);
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/intake/market/turn`)
      .set('Authorization', `Bearer ${b.token}`)
      .send({
        clientTurnId: randomUUID(),
        userMessage: '我想研究美甲店获客',
        draft: {},
        messages: [],
      })
      .expect(404);
  });

  it('blocks when ProductBrief is missing', async () => {
    const user = await registerUser(app, 'NoBrief');
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: '无 Brief' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(`/projects/${project.body.id}/intake/market/turn`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        clientTurnId: randomUUID(),
        userMessage: '我想研究关键词',
        draft: {},
        messages: [],
      })
      .expect(400);
    expect(res.body.code).toBe('PRODUCT_BRIEF_REQUIRED');
  });

  it('runs mock turn, extracts keywords, does not write MarketResearch', async () => {
    const user = await registerUser(app, 'Turn');
    const projectId = await createProjectWithBrief(app, user.token);
    const mock = app.get(MockModelProvider);
    const beforeCalls = mock.generateCalls;

    const res = await request(app.getHttpServer())
      .post(`/projects/${projectId}/intake/market/turn`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-request-id', `req-${suffix()}1234`)
      .send({
        clientTurnId: randomUUID(),
        userMessage: '我想先看看美甲店获客和美甲店短视频这两个方向。',
        draft: {},
        messages: [{ role: 'assistant', content: '你目前最想了解哪类市场信息？' }],
      })
      .expect(201);

    expect(res.body.message).toBeTruthy();
    expect(res.body.draftPatch.keywords).toEqual(
      expect.arrayContaining(['美甲店获客', '美甲店短视频']),
    );
    expect(res.body).not.toHaveProperty('provider');
    expect(res.body).not.toHaveProperty('tokens');
    expect(JSON.stringify(res.body)).not.toContain(user.token);
    expect(mock.generateCalls).toBeGreaterThan(beforeCalls);

    const researchCount = await prisma.marketResearch.count({ where: { projectId } });
    expect(researchCount).toBe(0);
  });

  it('handles malformed model output without writing MarketResearch', async () => {
    const user = await registerUser(app, 'BadOut');
    const projectId = await createProjectWithBrief(app, user.token);
    const mock = app.get(MockModelProvider);
    const original = mock.generate.bind(mock);
    mock.generate = async (req) => {
      if (req.agentId === 'market.intake') {
        return {
          text: 'not-json',
          provider: 'mock',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: null },
        };
      }
      return original(req);
    };

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/intake/market/turn`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        clientTurnId: randomUUID(),
        userMessage: '我想研究美甲店获客',
        draft: {},
        messages: [],
      })
      .expect((res) => {
        expect([400, 422, 500, 502]).toContain(res.status);
      });

    mock.generate = original;
    const researchCount = await prisma.marketResearch.count({ where: { projectId } });
    expect(researchCount).toBe(0);
  });
});
