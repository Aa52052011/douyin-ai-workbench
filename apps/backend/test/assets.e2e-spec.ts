import { randomUUID } from 'node:crypto';
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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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
    .send({ name: '素材项目' })
    .expect(201);
  return res.body as { id: string };
}

describe('Assets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-assets-${process.pid}`);
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

  it('creates, lists, fetches, completes and deletes an asset', async () => {
    const user = await registerUser(app, 'AsOk');
    const project = await createProject(app, user.token);
    const inited = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId: project.id,
        type: 'IMAGE',
        originalFilename: '../../etc/passwd.png',
        mimeType: 'image/png',
      })
      .expect(201);
    expect(inited.body.status).toBe('PENDING');
    expect(inited.body.originalFilename).toBe('passwd.png');
    expect(JSON.stringify(inited.body)).not.toContain('MEDIA_STORAGE_ROOT');
    expect(JSON.stringify(inited.body)).not.toContain(process.env.MEDIA_STORAGE_ROOT);
    expect(inited.body.storageKey).toBeUndefined();

    await request(app.getHttpServer())
      .put(`/assets/${inited.body.id}/content`)
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', PNG, { filename: 'passwd.png', contentType: 'image/png' })
      .expect(200);

    const completed = await request(app.getHttpServer())
      .post(`/assets/${inited.body.id}/complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(completed.body.status).toBe('READY');

    const listed = await request(app.getHttpServer())
      .get('/assets')
      .query({ projectId: project.id })
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(listed.body.some((item: { id: string }) => item.id === inited.body.id)).toBe(true);

    const fetched = await request(app.getHttpServer())
      .get(`/assets/${inited.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(fetched.body.contentPath).toBe(`/assets/${inited.body.id}/content`);

    await request(app.getHttpServer())
      .delete(`/assets/${inited.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/assets/${inited.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(404);
  });

  it('rejects oversized init, bad mime and missing projectId', async () => {
    const user = await registerUser(app, 'AsBad');
    const project = await createProject(app, user.token);
    await request(app.getHttpServer())
      .get('/assets')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(400);
    await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ projectId: project.id, type: 'IMAGE', size: 33 * 1024 * 1024 })
      .expect(400);
    const inited = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ projectId: project.id, type: 'IMAGE' })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/assets/${inited.body.id}/content`)
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', Buffer.from('<script>'), { filename: 'x.html', contentType: 'text/html' })
      .expect(400);
  });

  it('isolates tenant and workspace', async () => {
    const a = await registerUser(app, 'AsIsoA');
    const b = await registerUser(app, 'AsIsoB');
    const aProject = await createProject(app, a.token);
    const created = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ projectId: aProject.id, type: 'DOCUMENT', originalFilename: 'a.json' })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/assets/${created.body.id}`)
      .set('Authorization', `Bearer ${b.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/assets')
      .query({ projectId: aProject.id })
      .set('Authorization', `Bearer ${b.token}`)
      .expect(404);

    const extraWs = await prisma.workspace.create({
      data: { tenantId: a.tenantId, name: '隔离', slug: `iso-${suffix()}` },
    });
    const extraProject = await prisma.project.create({
      data: { tenantId: a.tenantId, workspaceId: extraWs.id, name: '隔离项目' },
    });
    const hidden = await prisma.asset.create({
      data: {
        tenantId: a.tenantId,
        workspaceId: extraWs.id,
        projectId: extraProject.id,
        type: 'IMAGE',
        status: 'READY',
        storageProvider: 'local',
        storageKey: `v1/${a.tenantId}/${extraWs.id}/${extraProject.id}/${randomUUID()}/${randomUUID()}`,
      },
    });
    await request(app.getHttpServer())
      .get(`/assets/${hidden.id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404);
  });
});
