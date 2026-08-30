import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  migrateDeploy,
  startTestDatabase,
  stopTestDatabase,
} from '../../../database/test/harness.ts';
import { AppModule } from '../src/app.module.js';
import { tenantSlugFromEmail } from '../src/auth/auth.service.js';
import { TokenService } from '../src/auth/token.service.js';
import { configureApp } from '../src/configure-app.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

function refreshCookie(res: Response): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = list.find((item) => item.startsWith('acf_rt='));
  expect(match).toBeTruthy();
  return match!.split(';')[0]!;
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let databaseUrl: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    databaseUrl = await startTestDatabase();
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

  it('registers a user with tenant, workspace and OWNER membership', async () => {
    const email = `reg-${suffix()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password1', name: 'Ada' })
      .expect(201);

    expect(res.body.user.email).toBe(email);
    expect(res.body.user.name).toBe('Ada');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.refreshRaw).toBeUndefined();
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.tenant.id).toEqual(expect.any(String));
    expect(res.body.workspace.name).toBe('默认工作空间');
    expect(res.body.role).toBe('OWNER');

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe('password1');
    expect(user!.passwordHash.startsWith('$argon2id$')).toBe(true);

    const membership = await prisma.membership.findFirst({ where: { userId: user!.id } });
    expect(membership?.role).toBe('OWNER');
    expect(membership?.tenantId).toBe(res.body.tenant.id);

    const workspace = await prisma.workspace.findFirst({
      where: { tenantId: res.body.tenant.id },
    });
    expect(workspace?.slug).toBe('default');
    expect(workspace?.id).toBe(res.body.workspace.id);
  });

  it('rolls back the register transaction when a later step fails', async () => {
    const email = `rb-${suffix()}@example.com`;
    await prisma.tenant.create({
      data: { name: 'taken', slug: tenantSlugFromEmail(email) },
    });

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password1', name: 'Rollback' })
      .expect((res) => {
        expect(res.status).toBeGreaterThanOrEqual(400);
      });

    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    expect(await prisma.membership.count({ where: { user: { email } } })).toBe(0);
  });

  it('rejects duplicate emails', async () => {
    const email = `dup-${suffix()}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: email.toUpperCase(), password: 'password1', name: 'One' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password1', name: 'Two' })
      .expect(409);

    expect(res.body.code).toBe('AUTH_EMAIL_EXISTS');
  });

  it('logs in with valid credentials and hides user existence on failure', async () => {
    const email = `login-${suffix()}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password1', name: 'Lin' })
      .expect(201);

    const ok = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password1' })
      .expect(201);
    expect(ok.body.accessToken).toEqual(expect.any(String));
    expect(ok.body.user.passwordHash).toBeUndefined();

    const badPassword = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrongpass' })
      .expect(401);
    const missingUser = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `nouser-${suffix()}@example.com`, password: 'wrongpass' })
      .expect(401);

    expect(badPassword.body).toEqual({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
    expect(missingUser.body).toEqual(badPassword.body);
  });

  it('accepts a valid access token and rejects expired or missing tokens', async () => {
    const email = `jwt-${suffix()}@example.com`;
    const created = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password1', name: 'Jwt' })
      .expect(201);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${created.body.accessToken}`)
      .expect(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(me.body)).not.toContain(created.body.user?.passwordHash ?? 'password_hash');

    await request(app.getHttpServer()).get('/auth/me').expect(401).expect({
      code: 'AUTH_UNAUTHORIZED',
      message: 'Authentication required',
    });

    const tokens = app.get(TokenService);
    const expired = tokens.signAccess(
      {
        userId: created.body.user.id,
        tenantId: created.body.tenant.id,
        workspaceId: created.body.workspace.id,
        role: created.body.role,
      },
      1,
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const expiredRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
    expect(expiredRes.body.code).toBe('AUTH_TOKEN_EXPIRED');
  });

  it('rotates refresh tokens and rejects reuse of the old token', async () => {
    const email = `rt-${suffix()}@example.com`;
    const created = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password1', name: 'Refresh' })
      .expect(201);
    const firstCookie = refreshCookie(created);

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(201);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.accessToken).not.toBe(created.body.accessToken);
    const secondCookie = refreshCookie(refreshed);
    expect(secondCookie).not.toBe(firstCookie);

    const reused = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(401);
    expect(reused.body.code).toBe('AUTH_REFRESH_REVOKED');
  });

  it('revokes the current refresh token on logout and all tokens on logout-all', async () => {
    const email = `out-${suffix()}@example.com`;
    const first = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password1', name: 'Out' })
      .expect(201);
    const firstCookie = refreshCookie(first);

    await request(app.getHttpServer()).post('/auth/logout').set('Cookie', firstCookie).expect(201);
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', firstCookie).expect(401);

    const loginA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password1' })
      .expect(201);
    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password1' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/logout-all')
      .set('Authorization', `Bearer ${loginA.body.accessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshCookie(loginA))
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshCookie(loginB))
      .expect(401);
  });

  it('does not let the client choose tenantId during register', async () => {
    const email = `tid-${suffix()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'password1',
        name: 'No Tenant',
        tenantId: randomUUID(),
      })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
