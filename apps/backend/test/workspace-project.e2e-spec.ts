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
    workspaceSlug: res.body.workspace.slug as string,
  };
}

describe('Workspace and Project (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tokens: TokenService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
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

  it('lists and creates workspaces for the current tenant', async () => {
    const user = await registerUser(app, 'WsList');
    const list = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(user.workspaceId);
    expect(list.body[0].slug).toBe('default');

    const created = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: '第二空间' })
      .expect(201);
    expect(created.body.name).toBe('第二空间');
    expect(created.body.tenantId).toBe(user.tenantId);
    expect(created.body.slug).not.toBe('default');
  });

  it('updates a workspace name', async () => {
    const user = await registerUser(app, 'WsPatch');
    const extra = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: '旧名' })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/workspaces/${extra.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: '新名' })
      .expect(200);
    expect(updated.body.name).toBe('新名');
    expect(updated.body.tenantId).toBe(user.tenantId);
  });

  it('soft-deletes a non-default empty workspace and blocks default or non-empty ones', async () => {
    const user = await registerUser(app, 'WsDel');
    await request(app.getHttpServer())
      .delete(`/workspaces/${user.workspaceId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe('WORKSPACE_DEFAULT_CANNOT_DELETE');
      });

    const extra = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: '可删' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/workspaces/${extra.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const row = await prisma.workspace.findFirst({
      where: { id: extra.body.id, tenantId: user.tenantId },
    });
    expect(row?.deletedAt).not.toBeNull();

    const list = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(list.body.find((item: { id: string }) => item.id === extra.body.id)).toBeUndefined();
  });

  it('rejects OWNER-only workspace actions for MEMBER', async () => {
    const user = await registerUser(app, 'WsRole');
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
      .post('/workspaces')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: '禁止' })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe('WORKSPACE_FORBIDDEN');
      });
  });

  it('creates, lists, reads, updates and soft-deletes projects in the current workspace', async () => {
    const user = await registerUser(app, 'Prj');
    const created = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: '账号定位',
        industry: '教育',
        platform: 'douyin',
        description: '第一期',
      })
      .expect(201);

    expect(created.body.tenantId).toBe(user.tenantId);
    expect(created.body.workspaceId).toBe(user.workspaceId);
    expect(created.body.name).toBe('账号定位');

    const list = await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    const detail = await request(app.getHttpServer())
      .get(`/projects/${created.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(detail.body.id).toBe(created.body.id);

    const updated = await request(app.getHttpServer())
      .patch(`/projects/${created.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: '改名', industry: '财经' })
      .expect(200);
    expect(updated.body.name).toBe('改名');
    expect(updated.body.workspaceId).toBe(user.workspaceId);

    await request(app.getHttpServer())
      .delete(`/projects/${created.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/projects/${created.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(404);

    const after = await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(after.body).toHaveLength(0);

    const persisted = await prisma.project.findFirst({
      where: { id: created.body.id, tenantId: user.tenantId },
    });
    expect(persisted?.deletedAt).not.toBeNull();
    expect(persisted?.name).toBe('改名');
  });

  it('isolates workspaces and projects across tenants and rejects forged ids', async () => {
    const a = await registerUser(app, 'IsoA');
    const b = await registerUser(app, 'IsoB');
    const bProject = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ name: 'B的项目' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/workspaces/${b.workspaceId}`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('WORKSPACE_NOT_FOUND');
      });

    await request(app.getHttpServer())
      .get(`/projects/${bProject.body.id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('PROJECT_NOT_FOUND');
      });

    await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ name: '伪造', tenantId: b.tenantId })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

    await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ name: '伪造', workspaceId: b.workspaceId })
      .expect(400);

    await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ name: '伪造租户', tenantId: b.tenantId })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ name: 'A项目' })
      .expect(201);
    expect(created.body.tenantId).toBe(a.tenantId);
    expect(created.body.workspaceId).toBe(a.workspaceId);
    expect(created.body.tenantId).not.toBe(b.tenantId);
  });

  it('does not delete a workspace that still has active projects', async () => {
    const user = await registerUser(app, 'WsFull');
    const extra = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: '有项目的空间' })
      .expect(201);

    await prisma.project.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: extra.body.id,
        name: '占位项目',
      },
    });

    await request(app.getHttpServer())
      .delete(`/workspaces/${extra.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe('WORKSPACE_NOT_EMPTY');
      });
  });

  it('rejects MEMBER project writes via permission policy', async () => {
    const user = await registerUser(app, 'PrjRole');
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
      .post('/projects')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: '禁止' })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe('PROJECT_FORBIDDEN');
      });
  });
});
