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
import { createPrismaClient } from '../src/prisma/prisma.module.js';

describe('Prisma e2e Nest boot', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let databaseUrl: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MEDIA_COMPOSE_PROVIDER = 'ffmpeg';
    databaseUrl = await startTestDatabase();
    process.env.DATABASE_URL = databaseUrl;
    migrateDeploy(databaseUrl);
    prisma = createPrismaClient(databaseUrl);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  it('serves GET /health', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ service: 'backend', status: 'ok' });
  });

  it('runs a Prisma query through the Nest PrismaClient', async () => {
    const nested = app.get(PrismaClient);
    const rows = await nested.$queryRaw<Array<{ ok: number }>>`SELECT 1::int AS ok`;
    expect(rows[0]?.ok).toBe(1);
    const direct = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1::int AS ok`;
    expect(direct[0]?.ok).toBe(1);
  });
});
