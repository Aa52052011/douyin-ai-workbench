import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MembershipRole, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  migrateDeploy,
  startTestDatabase,
  stopTestDatabase,
} from '../../../database/test/harness.ts';
import { AppModule } from '../src/app.module.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from '../src/agents/definitions/account-positioning.fixture.js';
import { TokenService } from '../src/auth/token.service.js';
import { configureApp } from '../src/configure-app.js';

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
    userId: res.body.user.id as string,
    tenantId: res.body.tenant.id as string,
    workspaceId: res.body.workspace.id as string,
  };
}

async function createProject(app: INestApplication, token: string, name = '脚本项目') {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name })
    .expect(201);
  return res.body as { id: string };
}

async function createConfirmedPlan(
  app: INestApplication,
  token: string,
  projectId: string,
  options: { status?: 'CONFIRMED' | 'ARCHIVED'; postsPerDay?: number } = {},
) {
  const status = options.status ?? 'CONFIRMED';
  const created = await request(app.getHttpServer())
    .post('/content-plans')
    .set('Authorization', `Bearer ${token}`)
    .send({
      projectId,
      planningDays: 7,
      postsPerDay: options.postsPerDay ?? 1,
      platform: 'douyin',
      positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
    })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/content-plans/${created.body.id}/confirm`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  if (status === 'ARCHIVED') {
    await request(app.getHttpServer())
      .post(`/content-plans/${created.body.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }
  const latest = await request(app.getHttpServer())
    .get(`/content-plans/${created.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return latest.body as {
    id: string;
    projectId: string;
    status: string;
    payload: { topics: Array<{ id: string }> };
  };
}

describe('Script Generation + Script (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tokens: TokenService;

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
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('discovers script.generation:v1', async () => {
    const user = await registerUser(app, 'SgDiscover');
    const res = await request(app.getHttpServer())
      .get('/agents')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const found = res.body.find((item: { id: string; version: string }) => item.id === 'script.generation');
    expect(found.version).toBe('v1');
  });

  it('creates DRAFT v1 then v2, confirms and archives', async () => {
    const user = await registerUser(app, 'SgCreate');
    const project = await createProject(app, user.token);
    const plan = await createConfirmedPlan(app, user.token, project.id);
    const topicId = plan.payload.topics[0].id;
    const requestId = `req-${suffix()}`;

    await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: plan.id,
        topicId,
        tenantId: user.tenantId,
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

    const v1 = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-request-id', requestId)
      .send({
        contentPlanId: plan.id,
        topicId,
        targetDuration: 30,
        requirements: '口播清楚',
      })
      .expect(201);

    expect(v1.body.status).toBe('DRAFT');
    expect(v1.body.version).toBe(1);
    expect(v1.body.topicId).toBe(topicId);
    expect(v1.body.contentPlanId).toBe(plan.id);
    expect(v1.body.sourceAgentRunId).toBeTruthy();
    expect(v1.body.payload.hook).toBeTruthy();
    expect(v1.body.topicSnapshot.id).toBe(topicId);
    expect(JSON.stringify(v1.body)).not.toContain(user.token);
    expect(JSON.stringify(v1.body)).not.toContain('password1');
    expect(JSON.stringify(v1.body)).not.toContain('MODEL_API_KEY');
    expect(JSON.stringify(v1.body)).not.toContain('你是短视频脚本编剧');

    const storedRun = await prisma.agentRun.findFirst({
      where: { id: v1.body.sourceAgentRunId, tenantId: user.tenantId },
    });
    expect(storedRun?.agentId).toBe('script.generation');
    expect(storedRun?.agentVersion).toBe('v1');
    expect(storedRun?.status).toBe('COMPLETED');
    expect(storedRun?.requestId).toBe(requestId);

    const patched = await request(app.getHttpServer())
      .patch(`/scripts/${v1.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: '手工标题' })
      .expect(200);
    expect(patched.body.title).toBe('手工标题');

    const confirmed = await request(app.getHttpServer())
      .post(`/scripts/${v1.body.id}/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(confirmed.body.status).toBe('CONFIRMED');

    await request(app.getHttpServer())
      .patch(`/scripts/${v1.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: '不能改' })
      .expect(409);

    const archived = await request(app.getHttpServer())
      .post(`/scripts/${v1.body.id}/archive`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(archived.body.status).toBe('ARCHIVED');

    await request(app.getHttpServer())
      .post(`/scripts/${v1.body.id}/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409);

    const v2 = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentPlanId: plan.id, topicId, targetDuration: 15 })
      .expect(201);
    expect(v2.body.version).toBe(2);
    expect(v2.body.id).not.toBe(v1.body.id);

    const listed = await request(app.getHttpServer())
      .get('/scripts')
      .query({ projectId: project.id, contentPlanId: plan.id, topicId, status: 'ARCHIVED' })
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(listed.body.some((item: { version: number }) => item.version === 1)).toBe(true);
    expect(listed.body.some((item: { version: number }) => item.version === 2)).toBe(false);

    await request(app.getHttpServer())
      .get('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(400);
  });

  it('rejects draft plans, missing topics and invalid duration', async () => {
    const user = await registerUser(app, 'SgReject');
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
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: draft.body.id,
        topicId: draft.body.payload.topics[0].id,
        targetDuration: 30,
      })
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe('CONTENT_PLAN_CONFLICT');
      });

    const plan = await createConfirmedPlan(app, user.token, project.id);
    await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: plan.id,
        topicId: randomUUID(),
        targetDuration: 30,
      })
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('SCRIPT_TOPIC_NOT_FOUND');
      });

    await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: plan.id,
        topicId: plan.payload.topics[0].id,
        targetDuration: 90,
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('SCRIPT_DURATION_NOT_AVAILABLE');
      });

    await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: randomUUID(),
        topicId: plan.payload.topics[0].id,
        targetDuration: 30,
      })
      .expect(404);

    const archivedPlan = await createConfirmedPlan(app, user.token, project.id, { status: 'ARCHIVED' });
    const fromArchived = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: archivedPlan.id,
        topicId: archivedPlan.payload.topics[0].id,
        targetDuration: 30,
      })
      .expect(201);
    expect(fromArchived.body.status).toBe('DRAFT');
  });

  it('rejects draft archive and client-forged ids', async () => {
    const user = await registerUser(app, 'SgState');
    const project = await createProject(app, user.token);
    const plan = await createConfirmedPlan(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: plan.id,
        topicId: plan.payload.topics[0].id,
        targetDuration: 30,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/scripts/${created.body.id}/archive`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409);
    await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: plan.id,
        topicId: plan.payload.topics[0].id,
        targetDuration: 30,
        workspaceId: randomUUID(),
        userId: randomUUID(),
        projectId: project.id,
      })
      .expect(400);
  });

  it('isolates tenant, workspace and project', async () => {
    const a = await registerUser(app, 'SgIsoA');
    const b = await registerUser(app, 'SgIsoB');
    const bProject = await createProject(app, b.token, 'B脚本');
    const bPlan = await createConfirmedPlan(app, b.token, bProject.id);
    const bScript = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${b.token}`)
      .send({
        contentPlanId: bPlan.id,
        topicId: bPlan.payload.topics[0].id,
        targetDuration: 30,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/scripts/${bScript.body.id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/scripts/${bScript.body.id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ title: '偷改' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/scripts/${bScript.body.id}/confirm`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/scripts/${bScript.body.id}/archive`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/scripts')
      .query({ projectId: bProject.id })
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        contentPlanId: bPlan.id,
        topicId: bPlan.payload.topics[0].id,
        targetDuration: 30,
      })
      .expect(404);

    const extraWs = await prisma.workspace.create({
      data: { tenantId: a.tenantId, name: '隔离', slug: `iso-${suffix()}` },
    });
    const extraProject = await prisma.project.create({
      data: { tenantId: a.tenantId, workspaceId: extraWs.id, name: '隔离项目' },
    });
    const extraPlan = await prisma.contentPlan.create({
      data: {
        tenantId: a.tenantId,
        workspaceId: extraWs.id,
        projectId: extraProject.id,
        title: '隔离规划',
        status: 'CONFIRMED',
        payload: bPlan.payload,
        positioningSnapshot: MOCK_ACCOUNT_POSITIONING_OUTPUT,
      },
    });
    await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        contentPlanId: extraPlan.id,
        topicId: bPlan.payload.topics[0].id,
        targetDuration: 30,
      })
      .expect(404);

    const extraScript = await prisma.script.create({
      data: {
        tenantId: a.tenantId,
        workspaceId: extraWs.id,
        projectId: extraProject.id,
        contentPlanId: extraPlan.id,
        topicId: bPlan.payload.topics[0].id,
        title: '隔离脚本',
        version: 1,
        status: 'DRAFT',
      },
    });
    await request(app.getHttpServer())
      .get(`/scripts/${extraScript.id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404);
  });

  it('rejects missing ids, oversized requirements and MEMBER permission', async () => {
    const user = await registerUser(app, 'SgValid');
    const project = await createProject(app, user.token);
    const plan = await createConfirmedPlan(app, user.token, project.id);
    const topicId = plan.payload.topics[0].id;

    await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ topicId, targetDuration: 30 })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });
    await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentPlanId: plan.id, targetDuration: 30 })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });
    await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: plan.id,
        topicId,
        targetDuration: 30,
        requirements: 'x'.repeat(2001),
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

    await prisma.membership.update({
      where: { userId_tenantId: { userId: user.userId, tenantId: user.tenantId } },
      data: { role: MembershipRole.MEMBER },
    });
    const memberToken = tokens.signAccess({
      userId: user.userId,
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      role: 'MEMBER',
    });
    await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ contentPlanId: plan.id, topicId, targetDuration: 30 })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe('AGENT_FORBIDDEN');
        expect(JSON.stringify(res.body)).not.toContain(memberToken);
      });
  });

  it('starts version from 1 for another topic and another project', async () => {
    const user = await registerUser(app, 'SgVer');
    const projectA = await createProject(app, user.token, '脚本A');
    const projectB = await createProject(app, user.token, '脚本B');
    const planA = await createConfirmedPlan(app, user.token, projectA.id, { postsPerDay: 2 });
    const planB = await createConfirmedPlan(app, user.token, projectB.id);
    expect(planA.payload.topics.length).toBeGreaterThanOrEqual(2);

    const first = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: planA.id,
        topicId: planA.payload.topics[0].id,
        targetDuration: 30,
      })
      .expect(201);
    expect(first.body.version).toBe(1);

    const otherTopic = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: planA.id,
        topicId: planA.payload.topics[1].id,
        targetDuration: 15,
      })
      .expect(201);
    expect(otherTopic.body.version).toBe(1);
    expect(otherTopic.body.topicId).toBe(planA.payload.topics[1].id);

    const otherProject = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: planB.id,
        topicId: planB.payload.topics[0].id,
        targetDuration: 30,
      })
      .expect(201);
    expect(otherProject.body.version).toBe(1);
    expect(otherProject.body.projectId).toBe(projectB.id);
  });

  it('rejects illegal status transitions', async () => {
    const user = await registerUser(app, 'SgTrans');
    const project = await createProject(app, user.token);
    const plan = await createConfirmedPlan(app, user.token, project.id);
    const created = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: plan.id,
        topicId: plan.payload.topics[0].id,
        targetDuration: 30,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/scripts/${created.body.id}/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/scripts/${created.body.id}/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe('SCRIPT_CONFLICT');
      });

    await request(app.getHttpServer())
      .post(`/scripts/${created.body.id}/archive`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/scripts/${created.body.id}/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe('SCRIPT_CONFLICT');
      });
    await request(app.getHttpServer())
      .post(`/scripts/${created.body.id}/archive`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe('SCRIPT_CONFLICT');
      });
  });
});
