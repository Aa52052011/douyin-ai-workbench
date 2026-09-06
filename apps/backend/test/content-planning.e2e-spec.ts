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
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from '../src/agents/definitions/account-positioning.fixture.js';
import { configureApp } from '../src/configure-app.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

const positioningInput = {
  industry: '教育',
  platform: 'douyin',
  accountType: '个人IP',
  goal: '帮助职场新人建立可执行方法论',
};

async function registerUser(app: INestApplication, name = 'Owner') {
  const email = `${name.toLowerCase()}-${suffix()}@example.com`;
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'password1', name })
    .expect(201);
  return {
    email,
    token: res.body.accessToken as string,
    userId: res.body.user.id as string,
    tenantId: res.body.tenant.id as string,
    workspaceId: res.body.workspace.id as string,
  };
}

async function createProject(app: INestApplication, token: string, name = '规划项目') {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name })
    .expect(201);
  return res.body as { id: string };
}

describe('Content Planning + ContentPlan (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    delete process.env.AI_ENGINE_URL;
    delete process.env.MODEL_API_KEY;
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

  it('discovers content.planning:v1', async () => {
    const user = await registerUser(app, 'CpDiscover');
    const res = await request(app.getHttpServer())
      .get('/agents')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const found = res.body.find((item: { id: string; version: string }) => item.id === 'content.planning');
    expect(found.version).toBe('v1');
  });

  it('creates DRAFT v1 then increments version, snapshots positioning, and rejects illegal edits', async () => {
    const user = await registerUser(app, 'CpCreate');
    const project = await createProject(app, user.token);
    const requestId = `req-${suffix()}`;

    const created = await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-request-id', requestId)
      .send({
        projectId: project.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        contentStyle: '冷静',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
        tenantId: user.tenantId,
      })
      .expect(400);
    expect(created.body.code).toBe('VALIDATION_ERROR');

    const v1 = await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-request-id', requestId)
      .send({
        projectId: project.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        contentStyle: '冷静',
        additionalRequirements: '每天一条',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
      })
      .expect(201);

    expect(v1.body.status).toBe('DRAFT');
    expect(v1.body.version).toBe(1);
    expect(v1.body.sourceAgentRunId).toBeTruthy();
    expect(v1.body.payload.topics).toHaveLength(7);
    expect(v1.body.payload.usedTrendData).toBe(false);
    expect(v1.body.payload.trendNote).toBe('未使用实时趋势数据');
    expect(v1.body.positioningSnapshot.accountPositioning).toBeTruthy();
    expect(v1.body.payload.topics.every((topic: { id: string }) => topic.id.includes('-'))).toBe(true);
    expect(JSON.stringify(v1.body)).not.toContain(user.token);
    expect(JSON.stringify(v1.body)).not.toContain('password1');
    expect(JSON.stringify(v1.body)).not.toContain('MODEL_API_KEY');
    expect(JSON.stringify(v1.body)).not.toContain('你是内容规划师');

    const storedRun = await prisma.agentRun.findFirst({
      where: { id: v1.body.sourceAgentRunId, tenantId: user.tenantId },
    });
    expect(storedRun?.agentId).toBe('content.planning');
    expect(storedRun?.status).toBe('COMPLETED');
    expect(storedRun?.requestId).toBe(requestId);
    expect((storedRun?.input as { performanceFeedback?: { dataState?: string } }).performanceFeedback?.dataState).toBe(
      'NONE',
    );
    expect(v1.body.payload).not.toHaveProperty('performanceFeedback');

    const patched = await request(app.getHttpServer())
      .patch(`/content-plans/${v1.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: '手工改过的标题' })
      .expect(200);
    expect(patched.body.title).toBe('手工改过的标题');

    const confirmed = await request(app.getHttpServer())
      .post(`/content-plans/${v1.body.id}/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(confirmed.body.status).toBe('CONFIRMED');

    await request(app.getHttpServer())
      .patch(`/content-plans/${v1.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: '不能改' })
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe('CONTENT_PLAN_CONFLICT');
      });

    const archived = await request(app.getHttpServer())
      .post(`/content-plans/${v1.body.id}/archive`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(archived.body.status).toBe('ARCHIVED');

    await request(app.getHttpServer())
      .patch(`/content-plans/${v1.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: '归档后' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/content-plans/${v1.body.id}/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409);
    await request(app.getHttpServer())
      .post(`/content-plans/${v1.body.id}/archive`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409);

    const v2 = await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId: project.id,
        planningDays: 7,
        postsPerDay: 2,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
      })
      .expect(201);
    expect(v2.body.version).toBe(2);
    expect(v2.body.status).toBe('DRAFT');
    expect(v2.body.id).not.toBe(v1.body.id);
    expect(v2.body.payload.topics).toHaveLength(14);

    const kept = await request(app.getHttpServer())
      .get(`/content-plans/${v1.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(kept.body.status).toBe('ARCHIVED');
    expect(kept.body.version).toBe(1);

    const otherProject = await createProject(app, user.token, '另一个项目');
    const otherV1 = await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId: otherProject.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
      })
      .expect(201);
    expect(otherV1.body.version).toBe(1);
  });

  it('rejects invalid planning parameters on agent execute', async () => {
    const user = await registerUser(app, 'CpDays');
    const project = await createProject(app, user.token);
    await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        agentId: 'content.planning',
        projectId: project.id,
        input: {
          positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
          planningDays: 30,
          postsPerDay: 1,
          platform: 'douyin',
        },
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('CONTENT_PLAN_DAYS_NOT_AVAILABLE');
      });
    await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId: project.id,
        planningDays: 7,
        postsPerDay: 0,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId: project.id,
        planningDays: 7,
        postsPerDay: 6,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
      })
      .expect(400);
  });

  it('uses positioningRunId and rejects foreign or incomplete runs', async () => {
    const a = await registerUser(app, 'CpPosA');
    const b = await registerUser(app, 'CpPosB');
    const aProject = await createProject(app, a.token, 'A规划');
    const bProject = await createProject(app, b.token, 'B规划');

    const aRun = await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        agentId: 'account.positioning',
        projectId: aProject.id,
        input: positioningInput,
      })
      .expect(201);

    const fromRun = await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        projectId: aProject.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioningRunId: aRun.body.id,
      })
      .expect(201);
    expect(fromRun.body.positioningSnapshot.persona).toBeTruthy();

    await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${b.token}`)
      .send({
        projectId: bProject.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioningRunId: aRun.body.id,
      })
      .expect(404);

    const echo = await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        agentId: 'system.echo',
        projectId: aProject.id,
        input: { message: 'hi' },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        projectId: aProject.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioningRunId: echo.body.id,
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('AGENT_INVALID_INPUT');
      });

    const failedId = randomUUID();
    await prisma.agentRun.create({
      data: {
        id: failedId,
        tenantId: a.tenantId,
        workspaceId: a.workspaceId,
        projectId: aProject.id,
        agentId: 'account.positioning',
        agentVersion: 'v1',
        status: 'FAILED',
        input: positioningInput,
        requestId: `fail-${suffix()}`,
      },
    });
    await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        projectId: aProject.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioningRunId: failedId,
      })
      .expect(400);

    const extraWs = await prisma.workspace.create({
      data: { tenantId: a.tenantId, name: '其他', slug: `other-${suffix()}` },
    });
    const extraProject = await prisma.project.create({
      data: { tenantId: a.tenantId, workspaceId: extraWs.id, name: '其他项目' },
    });
    const extraRun = await prisma.agentRun.create({
      data: {
        tenantId: a.tenantId,
        workspaceId: extraWs.id,
        projectId: extraProject.id,
        agentId: 'account.positioning',
        agentVersion: 'v1',
        status: 'COMPLETED',
        input: positioningInput,
        output: MOCK_ACCOUNT_POSITIONING_OUTPUT,
        requestId: `ws-${suffix()}`,
      },
    });
    await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        projectId: aProject.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioningRunId: extraRun.id,
      })
      .expect(404);

    const otherProject = await createProject(app, a.token, '同租户另一项目');
    await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        projectId: otherProject.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioningRunId: aRun.body.id,
      })
      .expect(404);
  });

  it('isolates tenant, workspace and project on GET/PATCH/confirm', async () => {
    const a = await registerUser(app, 'CpIsoA');
    const b = await registerUser(app, 'CpIsoB');
    const bProject = await createProject(app, b.token, 'B隔离');
    const bPlan = await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${b.token}`)
      .send({
        projectId: bProject.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/content-plans/${bPlan.body.id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/content-plans/${bPlan.body.id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ title: '偷改' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/content-plans/${bPlan.body.id}/confirm`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/content-plans')
      .query({ projectId: bProject.id })
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404);

    const extraWs = await prisma.workspace.create({
      data: { tenantId: a.tenantId, name: '隔离空间', slug: `iso-${suffix()}` },
    });
    const extraProject = await prisma.project.create({
      data: { tenantId: a.tenantId, workspaceId: extraWs.id, name: '隔离项目' },
    });
    await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        projectId: extraProject.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
      })
      .expect(404);
  });

  it('rejects forged workspaceId and userId on create', async () => {
    const user = await registerUser(app, 'CpForge');
    const project = await createProject(app, user.token);
    await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId: project.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
        workspaceId: randomUUID(),
        userId: randomUUID(),
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });
  });

  it('does not archive a draft and does not recover archived plans', async () => {
    const user = await registerUser(app, 'CpArchive');
    const project = await createProject(app, user.token);
    const draft = await request(app.getHttpServer())
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
      .post(`/content-plans/${draft.body.id}/archive`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409);
  });
});
