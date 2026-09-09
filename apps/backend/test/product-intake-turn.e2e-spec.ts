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

describe('Product Intake turn (e2e)', () => {
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
      .post(`/projects/${randomUUID()}/intake/product/turn`)
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
    const projectA = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ name: 'A 项目' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${projectA.body.id}/intake/product/turn`)
      .set('Authorization', `Bearer ${b.token}`)
      .send({
        clientTurnId: randomUUID(),
        userMessage: '我做一个工具',
        draft: {},
        messages: [],
      })
      .expect(404);
  });

  it('runs mock turn, returns safe patch, does not write ProductBrief', async () => {
    const user = await registerUser(app, 'Turn');
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Intake 项目' })
      .expect(201);

    const mock = app.get(MockModelProvider);
    const beforeCalls = mock.generateCalls;

    const res = await request(app.getHttpServer())
      .post(`/projects/${project.body.id}/intake/product/turn`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-request-id', `req-${suffix()}1234`)
      .send({
        clientTurnId: randomUUID(),
        userMessage: '我做一个帮助美容院自动生成抖音短视频的工具。',
        draft: {},
        messages: [{ role: 'assistant', content: '你准备推广的是什么产品或服务？' }],
      })
      .expect(201);

    expect(res.body.message).toBeTruthy();
    expect(res.body.draftPatch.productName).toBeUndefined();
    expect(res.body.draftPatch.description).toBeTruthy();
    expect(res.body.draftPatch.targetAudience).toBe('美容院');
    expect(res.body).not.toHaveProperty('provider');
    expect(res.body).not.toHaveProperty('tokens');
    expect(JSON.stringify(res.body)).not.toContain(user.token);
    expect(mock.generateCalls).toBeGreaterThan(beforeCalls);

    const briefs = await prisma.productBrief.count({
      where: { projectId: project.body.id },
    });
    expect(briefs).toBe(0);
  });

  it('handles malformed model output without writing ProductBrief', async () => {
    const user = await registerUser(app, 'BadOut');
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Bad 项目' })
      .expect(201);

    const mock = app.get(MockModelProvider);
    const original = mock.generate.bind(mock);
    mock.generate = async (req) => {
      if (req.agentId === 'product.intake') {
        return {
          text: 'not-json',
          provider: 'mock',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: null },
        };
      }
      return original(req);
    };

    await request(app.getHttpServer())
      .post(`/projects/${project.body.id}/intake/product/turn`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        clientTurnId: randomUUID(),
        userMessage: '测试坏输出',
        draft: { productName: '保留' },
        messages: [],
      })
      .expect((response) => {
        expect([400, 502, 500]).toContain(response.status);
      });

    const briefs = await prisma.productBrief.count({
      where: { projectId: project.body.id },
    });
    expect(briefs).toBe(0);

    mock.generate = original;
  });
});
