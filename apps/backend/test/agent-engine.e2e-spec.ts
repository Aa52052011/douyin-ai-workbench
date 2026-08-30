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

describe('Agent Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tokens: TokenService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
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
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('discovers the registered system.echo agent', async () => {
    const user = await registerUser(app, 'Discover');
    const res = await request(app.getHttpServer())
      .get('/agents')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('system.echo');
    expect(res.body[0].version).toBe('v1');
  });

  it('executes system.echo and persists a completed AgentRun', async () => {
    const user = await registerUser(app, 'EchoOk');
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Echo 项目' })
      .expect(201);
    const requestId = `req-${suffix()}`;

    const executed = await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-request-id', requestId)
      .send({
        agentId: 'system.echo',
        agentVersion: 'v1',
        projectId: project.body.id,
        input: { message: 'hello' },
      })
      .expect(201);

    expect(executed.headers['x-request-id']).toBe(requestId);
    expect(executed.body.requestId).toBe(requestId);
    expect(executed.body.agentId).toBe('system.echo');
    expect(executed.body.agentVersion).toBe('v1');
    expect(executed.body.status).toBe('COMPLETED');
    expect(executed.body.tenantId).toBe(user.tenantId);
    expect(executed.body.workspaceId).toBe(user.workspaceId);
    expect(executed.body.projectId).toBe(project.body.id);
    expect(executed.body.output).toEqual({
      message: 'hello',
      agent: 'system.echo',
      version: 'v1',
    });
    expect(executed.body.usage.totalTokens).toBeGreaterThan(0);
    expect(executed.body.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(executed.body)).not.toContain(user.token);
    expect(JSON.stringify(executed.body)).not.toContain('password1');

    const stored = await prisma.agentRun.findFirst({
      where: { id: executed.body.id, tenantId: user.tenantId },
    });
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.requestId).toBe(requestId);

    const fetched = await request(app.getHttpServer())
      .get(`/agents/runs/${executed.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(fetched.body.status).toBe('COMPLETED');
    expect(fetched.body.requestId).toBe(requestId);
  });

  it('rejects unauthenticated execution', async () => {
    await request(app.getHttpServer())
      .post('/agents/runs')
      .send({
        agentId: 'system.echo',
        projectId: randomUUID(),
        input: { message: 'hello' },
      })
      .expect(401)
      .expect((res) => {
        expect(res.body.code).toBe('AUTH_UNAUTHORIZED');
      });
  });

  it('rejects MEMBER execution via permission policy', async () => {
    const user = await registerUser(app, 'AgentRole');
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: '权限项目' })
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
        agentId: 'system.echo',
        projectId: project.body.id,
        input: { message: 'hello' },
      })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe('AGENT_FORBIDDEN');
      });
  });

  it('fails unknown agents and invalid input without leaking secrets', async () => {
    const user = await registerUser(app, 'BadInput');
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: '校验项目' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        agentId: 'account-positioning',
        projectId: project.body.id,
        input: { message: 'hello' },
      })
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('AGENT_NOT_FOUND');
        expect(JSON.stringify(res.body)).not.toContain(user.token);
      });

    await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        agentId: 'system.echo',
        projectId: project.body.id,
        input: { text: 'hello' },
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('AGENT_INVALID_INPUT');
      });
  });

  it('isolates AgentRun by tenant, workspace and project', async () => {
    const a = await registerUser(app, 'IsoA');
    const b = await registerUser(app, 'IsoB');
    const bProject = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ name: 'B项目' })
      .expect(201);
    const bRun = await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${b.token}`)
      .send({
        agentId: 'system.echo',
        projectId: bProject.body.id,
        input: { message: 'secret-from-b' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/agents/runs/${bRun.body.id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('AGENT_RUN_NOT_FOUND');
        expect(JSON.stringify(res.body)).not.toContain('secret-from-b');
      });

    await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        agentId: 'system.echo',
        projectId: bProject.body.id,
        input: { message: 'hello' },
      })
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('PROJECT_NOT_FOUND');
      });

    await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        agentId: 'system.echo',
        tenantId: b.tenantId,
        workspaceId: b.workspaceId,
        projectId: bProject.body.id,
        input: { message: 'hello' },
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

    const extraWs = await prisma.workspace.create({
      data: {
        tenantId: a.tenantId,
        name: '其他空间',
        slug: `other-${suffix()}`,
      },
    });
    const extraProject = await prisma.project.create({
      data: {
        tenantId: a.tenantId,
        workspaceId: extraWs.id,
        name: '其他项目',
      },
    });
    await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        agentId: 'system.echo',
        projectId: extraProject.id,
        input: { message: 'hello' },
      })
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('PROJECT_NOT_FOUND');
      });
  });
});
