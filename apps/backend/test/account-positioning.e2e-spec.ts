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
import { TokenService } from '../src/auth/token.service.js';
import { configureApp } from '../src/configure-app.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

const validInput = {
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

describe('Account Positioning Agent (e2e)', () => {
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

  it('discovers account.positioning:v1', async () => {
    const user = await registerUser(app, 'ApDiscover');
    const res = await request(app.getHttpServer())
      .get('/agents')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const found = res.body.find((item: { id: string; version: string }) => item.id === 'account.positioning');
    expect(found.version).toBe('v1');
  });

  it('executes with mock model, stores COMPLETED run and history', async () => {
    const user = await registerUser(app, 'ApOk');
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: '定位项目' })
      .expect(201);
    const requestId = `req-${suffix()}`;

    const executed = await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-request-id', requestId)
      .send({
        agentId: 'account.positioning',
        agentVersion: 'v1',
        projectId: project.body.id,
        input: validInput,
      })
      .expect(201);

    expect(executed.body.status).toBe('COMPLETED');
    expect(executed.body.requestId).toBe(requestId);
    expect(executed.body.agentVersion).toBe('v1');
    expect(executed.body.output.accountPositioning).toBeTruthy();
    expect(executed.body.output.persona.identity).toBeTruthy();
    expect(executed.body.usage.totalTokens).toBeGreaterThan(0);
    expect(JSON.stringify(executed.body)).not.toContain(user.token);
    expect(JSON.stringify(executed.body)).not.toContain('password1');
    expect(JSON.stringify(executed.body)).not.toContain('MODEL_API_KEY');

    const stored = await prisma.agentRun.findFirst({
      where: { id: executed.body.id, tenantId: user.tenantId },
    });
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.totalTokens).toBeGreaterThan(0);

    const history = await request(app.getHttpServer())
      .get('/agents/runs')
      .query({ projectId: project.body.id, agentId: 'account.positioning' })
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(history.body[0].id).toBe(executed.body.id);
  });

  it.each(['industry', 'platform', 'accountType', 'goal'] as const)(
    'rejects missing %s',
    async (field) => {
      const user = await registerUser(app, `Miss${field}`);
      const project = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: '校验' })
        .expect(201);
      const input = { ...validInput };
      delete input[field];
      await request(app.getHttpServer())
        .post('/agents/runs')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          agentId: 'account.positioning',
          projectId: project.body.id,
          input,
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.code).toBe('AGENT_INVALID_INPUT');
        });
    },
  );

  it('rejects oversized input', async () => {
    const user = await registerUser(app, 'ApLong');
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: '超长' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        agentId: 'account.positioning',
        projectId: project.body.id,
        input: { ...validInput, goal: 'x'.repeat(501) },
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('AGENT_INVALID_INPUT');
      });
  });

  it('isolates tenant, workspace and project', async () => {
    const a = await registerUser(app, 'ApIsoA');
    const b = await registerUser(app, 'ApIsoB');
    const bProject = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ name: 'B定位' })
      .expect(201);
    const bRun = await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${b.token}`)
      .send({
        agentId: 'account.positioning',
        projectId: bProject.body.id,
        input: validInput,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/agents/runs/${bRun.body.id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/agents/runs')
      .query({ projectId: bProject.body.id, agentId: 'account.positioning' })
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        agentId: 'account.positioning',
        projectId: bProject.body.id,
        input: validInput,
      })
      .expect(404);

    const extraWs = await prisma.workspace.create({
      data: { tenantId: a.tenantId, name: '其他', slug: `other-${suffix()}` },
    });
    const extraProject = await prisma.project.create({
      data: { tenantId: a.tenantId, workspaceId: extraWs.id, name: '其他项目' },
    });
    await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        agentId: 'account.positioning',
        projectId: extraProject.id,
        input: validInput,
      })
      .expect(404);
  });

  it('rejects MEMBER execution', async () => {
    const user = await registerUser(app, 'ApRole');
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: '权限' })
      .expect(201);
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
      .post('/agents/runs')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        agentId: 'account.positioning',
        projectId: project.body.id,
        input: validInput,
      })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe('AGENT_FORBIDDEN');
        expect(JSON.stringify(res.body)).not.toContain(memberToken);
      });
  });
});
