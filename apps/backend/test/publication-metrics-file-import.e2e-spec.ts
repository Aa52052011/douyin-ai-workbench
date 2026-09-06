import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import {
  MembershipRole,
  Platform,
  PrismaClient,
  PublicationMode,
  PublicationStatus,
} from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  migrateDeploy,
  startTestDatabase,
  stopTestDatabase,
} from '../../../database/test/harness.ts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { ErrorCode } from '../src/common/errors/app-error.js';
import { buildDouyinWorkListExportFixture } from '../src/metrics/import/fixtures/douyin-work-list-export.js';
import { DOUYIN_EXPORT_MAPPING_VERSION } from '../src/metrics/import/import-file.constants.js';
import { METRICS_IMPORT_MAX_FILE_BYTES, METRICS_IMPORT_MAX_ROWS } from '../src/metrics/import/import-file.constants.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function registerUser(app: INestApplication, name = 'FileImportOwner') {
  const email = `${name.toLowerCase()}-${suffix()}@example.com`;
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'password1', name })
    .expect(201);
  return {
    token: res.body.accessToken as string,
    tenantId: res.body.tenant.id as string,
    workspaceId: res.body.workspace.id as string,
    userId: res.body.user.id as string,
    email,
  };
}

async function seedPublication(
  prisma: PrismaClient,
  user: { tenantId: string; workspaceId: string; userId: string },
  opts: {
    title?: string;
    externalPostId?: string;
    externalUrl?: string;
    publishedAt?: Date;
    projectId?: string;
  } = {},
) {
  const tag = suffix();
  const projectId =
    opts.projectId ??
    (
      await prisma.project.create({
        data: { tenantId: user.tenantId, workspaceId: user.workspaceId, name: `File ${tag}` },
      })
    ).id;
  const video = await prisma.video.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId,
      status: 'COMPLETED',
    },
  });
  const publication = await prisma.publication.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId,
      videoId: video.id,
      platform: Platform.DOUYIN,
      mode: PublicationMode.MANUAL,
      status: PublicationStatus.PUBLISHED,
      title: opts.title ?? `File ${tag}`,
      visibility: 'PUBLIC',
      publishedAt: opts.publishedAt ?? new Date('2026-08-01T00:00:00.000Z'),
      externalPostId: opts.externalPostId,
      externalUrl: opts.externalUrl,
      idempotencyKey: `idem-file-${tag}`,
      createdByUserId: user.userId,
    },
  });
  return { projectId, publication };
}

function csvBuffer(lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf8');
}

async function xlsxBuffer(headers: string[], rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('作品');
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('CSV/XLSX metrics import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-file-import-${process.pid}`);
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    process.env.MEDIA_COMPOSE_PROVIDER = 'mock';
    process.env.MEDIA_IMAGE_PROVIDER = 'color-background';
    delete process.env.AI_ENGINE_URL;
    delete process.env.MODEL_API_KEY;
    delete process.env.RUN_REDIS_TESTS;
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

  it('previews and confirms a valid CSV with alias columns and writes IMPORT snapshots', async () => {
    const user = await registerUser(app);
    const itemId = '7473333333333333333';
    const { publication, projectId } = await seedPublication(prisma, user, {
      title: '真实作品',
      externalPostId: itemId,
      externalUrl: `https://www.douyin.com/video/${itemId}`,
    });
    const file = csvBuffer([
      '作品标题,作品链接,发布时间,播放量,点赞数,完播率,数据截止时间,未知列',
      `真实作品,https://www.douyin.com/video/${itemId},2026-08-01 00:00:00,"1,234",12,12%,2026-08-02 12:00:00,hello`,
    ]);

    const preview = await request(app.getHttpServer())
      .post('/metrics/import/preview')
      .set('Authorization', `Bearer ${user.token}`)
      .field('projectId', projectId)
      .attach('file', file, 'export.csv')
      .expect(201);

    expect(preview.body.format).toBe('CSV');
    expect(preview.body.mappingVersion).toBe(DOUYIN_EXPORT_MAPPING_VERSION);
    expect(preview.body.rows[0].matchResult.kind).toBe('EXACT');
    expect(preview.body.rows[0].suggestedPublicationId).toBe(publication.id);
    expect(preview.body.rows[0].parsed.metrics.views).toBe(1234);
    expect(preview.body.rows[0].parsed.metrics.completionRate).toBe(0.12);
    expect(preview.body.summary.exactMatches).toBe(1);
    expect(JSON.stringify(preview.body)).toContain('未知列');

    const confirm = await request(app.getHttpServer())
      .post('/metrics/import/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId,
        mappingVersion: preview.body.mappingVersion,
        fileFingerprint: preview.body.fileFingerprint,
        format: 'CSV',
        rows: [
          {
            rowNumber: 2,
            publicationId: publication.id,
            observedAt: preview.body.rows[0].parsed.observedAt,
            metrics: preview.body.rows[0].parsed.metrics,
          },
        ],
      })
      .expect(201);

    expect(confirm.body.results[0].status).toBe('imported');
    expect(confirm.body.results[0].snapshot.source).toBe('IMPORT');
    expect(confirm.body.results[0].snapshot.provider).toBe('CSV_IMPORT');
    expect(confirm.body.results[0].snapshot.views).toBe(1234);

    const replay = await request(app.getHttpServer())
      .post('/metrics/import/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId,
        mappingVersion: preview.body.mappingVersion,
        fileFingerprint: preview.body.fileFingerprint,
        format: 'CSV',
        rows: [
          {
            rowNumber: 9,
            publicationId: publication.id,
            observedAt: preview.body.rows[0].parsed.observedAt,
            metrics: preview.body.rows[0].parsed.metrics,
          },
        ],
      })
      .expect(201);
    expect(replay.body.results[0].snapshot.id).toBe(confirm.body.results[0].snapshot.id);
    expect(
      await prisma.publicationMetricSnapshot.count({
        where: { publicationId: publication.id, tenantId: user.tenantId },
      }),
    ).toBe(1);

    const summary = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/summary`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(summary.body.sourcesUsed).toEqual(['IMPORT']);
    expect(summary.body.latest.views).toBe(1234);

    const insights = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(insights.body.publicationId).toBe(publication.id);
    expect(insights.body.dataSufficiency).toBeTruthy();
  });

  it('previews a valid XLSX, 万 values, and mixed valid/invalid rows', async () => {
    const user = await registerUser(app);
    const { publication, projectId } = await seedPublication(prisma, user, { title: 'XLSX作品' });
    const file = await xlsxBuffer(
      ['标题', '播放次数', '完播率', '数据截止时间', '发布时间'],
      [
        ['XLSX作品', '1.2万', '0.42', '2026-08-02 00:00:00', '2026-08-01'],
        ['坏行', '-3', '12%', '2026-08-02 00:00:00', '2026-08-01'],
      ],
    );
    const preview = await request(app.getHttpServer())
      .post('/metrics/import/preview')
      .set('Authorization', `Bearer ${user.token}`)
      .field('projectId', projectId)
      .attach('file', file, 'export.xlsx')
      .expect(201);
    expect(preview.body.format).toBe('XLSX');
    expect(preview.body.rows[0].parsed.metrics.views).toBe(12_000);
    expect(preview.body.rows[0].matchResult.kind).toBe('WEAK');
    expect(preview.body.rows[0].suggestedPublicationId).toBeNull();
    expect(preview.body.rows[1].errors.length).toBeGreaterThan(0);
    expect(preview.body.summary.invalid).toBe(1);
    expect(preview.body.summary.weakMatches).toBe(1);

    await request(app.getHttpServer())
      .post('/metrics/import/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId,
        mappingVersion: preview.body.mappingVersion,
        fileFingerprint: preview.body.fileFingerprint,
        format: 'XLSX',
        rows: [{ rowNumber: 2, observedAt: '2026-08-02T00:00:00.000Z', metrics: { views: 12000 } }],
      })
      .expect(400);

    const confirmed = await request(app.getHttpServer())
      .post('/metrics/import/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId,
        mappingVersion: preview.body.mappingVersion,
        fileFingerprint: preview.body.fileFingerprint,
        format: 'XLSX',
        rows: [
          {
            rowNumber: 2,
            publicationId: publication.id,
            observedAt: '2026-08-02T00:00:00.000Z',
            metrics: { views: 12000 },
          },
        ],
      })
      .expect(201);
    expect(confirmed.body.results[0].snapshot.provider).toBe('XLSX_IMPORT');
  });

  it('matches exact, ambiguous and unmatched rows and blocks cross-tenant confirm', async () => {
    const owner = await registerUser(app, 'FileTenA');
    const other = await registerUser(app, 'FileTenB');
    const { projectId } = await seedPublication(prisma, owner, {
      title: '同名',
      externalPostId: '7474444444444444444',
    });
    await seedPublication(prisma, owner, {
      projectId,
      title: '同名',
      publishedAt: new Date('2026-08-01T10:00:00.000Z'),
    });
    const preview = await request(app.getHttpServer())
      .post('/metrics/import/preview')
      .set('Authorization', `Bearer ${owner.token}`)
      .field('projectId', projectId)
      .attach(
        'file',
        csvBuffer([
          '作品标题,发布时间,播放量,数据截止时间',
          '同名,2026-08-01,100,2026-08-02 00:00:00',
          '没有这首,2026-08-01,50,2026-08-02 00:00:00',
        ]),
        'match.csv',
      )
      .expect(201);
    expect(preview.body.rows[0].matchResult.kind).toBe('AMBIGUOUS');
    expect(preview.body.rows[1].matchResult.kind).toBe('UNMATCHED');

    const stolen = await request(app.getHttpServer())
      .post('/metrics/import/confirm')
      .set('Authorization', `Bearer ${other.token}`)
      .send({
        projectId,
        mappingVersion: preview.body.mappingVersion,
        fileFingerprint: preview.body.fileFingerprint,
        format: 'CSV',
        rows: [
          {
            rowNumber: 2,
            publicationId: preview.body.rows[0].matchResult.publicationIds[0],
            observedAt: '2026-08-02T00:00:00.000Z',
            metrics: { views: 100 },
          },
        ],
      });
    expect([404, 201]).toContain(stolen.status);
    if (stolen.status === 201) {
      expect(stolen.body.results[0].status).toBe('rejected');
    }
  });

  it('rejects unsupported files, macros, oversized payloads and too many rows', async () => {
    const user = await registerUser(app);
    const { projectId } = await seedPublication(prisma, user);
    await request(app.getHttpServer())
      .post('/metrics/import/preview')
      .set('Authorization', `Bearer ${user.token}`)
      .field('projectId', projectId)
      .attach('file', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]), 'old.xls')
      .expect(400);
    await request(app.getHttpServer())
      .post('/metrics/import/preview')
      .set('Authorization', `Bearer ${user.token}`)
      .field('projectId', projectId)
      .attach('file', Buffer.from('PK\x03\x04xl/vbaProject.bin'), 'macro.xlsm')
      .expect(400);

    const tooMany = csvBuffer(['播放量', ...Array.from({ length: METRICS_IMPORT_MAX_ROWS + 1 }, () => '1')]);
    await request(app.getHttpServer())
      .post('/metrics/import/preview')
      .set('Authorization', `Bearer ${user.token}`)
      .field('projectId', projectId)
      .attach('file', tooMany, 'many.csv')
      .expect(400);

    await request(app.getHttpServer())
      .post('/metrics/import/preview')
      .set('Authorization', `Bearer ${user.token}`)
      .field('projectId', projectId)
      .attach('file', Buffer.alloc(METRICS_IMPORT_MAX_FILE_BYTES + 32, 97), 'huge.csv')
      .expect(400)
      .expect({ code: ErrorCode.VALIDATION_ERROR, message: 'Import file is too large' });
  });

  it('requires PUBLICATION_CREATE and does not write snapshots on preview', async () => {
    const user = await registerUser(app);
    const { publication, projectId } = await seedPublication(prisma, user);
    const before = await prisma.publicationMetricSnapshot.count();
    await request(app.getHttpServer())
      .post('/metrics/import/preview')
      .set('Authorization', `Bearer ${user.token}`)
      .field('projectId', projectId)
      .attach('file', csvBuffer(['播放量,数据截止时间', '9,2026-08-02 00:00:00']), 'ok.csv')
      .expect(201);
    expect(await prisma.publicationMetricSnapshot.count()).toBe(before);

    await prisma.membership.updateMany({
      where: { userId: user.userId, tenantId: user.tenantId },
      data: { role: MembershipRole.MEMBER },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'password1' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/metrics/import/preview')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .field('projectId', projectId)
      .attach('file', csvBuffer(['播放量,数据截止时间', '9,2026-08-02 00:00:00']), 'ok.csv')
      .expect(403);
    expect(publication.id).toBeTruthy();
  });

  it('previews and confirms a real Douyin work-list XLSX without mis-mapping extra columns', async () => {
    const user = await registerUser(app, 'WorkListOwner');
    const { publication, projectId } = await seedPublication(prisma, user, {
      title: '示例作品A',
      publishedAt: new Date('2026-08-01T10:00:00.000Z'),
    });
    const workB = await seedPublication(prisma, user, {
      projectId,
      title: '示例作品B',
      publishedAt: new Date('2026-08-02T09:00:00.000Z'),
    });
    const before = await prisma.publicationMetricSnapshot.count({
      where: { publicationId: publication.id, tenantId: user.tenantId },
    });
    const file = await buildDouyinWorkListExportFixture();

    const preview = await request(app.getHttpServer())
      .post('/metrics/import/preview')
      .set('Authorization', `Bearer ${user.token}`)
      .field('projectId', projectId)
      .field('observedAtOverride', '2026-08-03T00:00:00.000Z')
      .attach('file', file, '作品列表导出.xlsx')
      .expect(201);

    expect(preview.body.format).toBe('XLSX');
    expect(preview.body.mappingVersion).toBe(DOUYIN_EXPORT_MAPPING_VERSION);
    expect(await prisma.publicationMetricSnapshot.count({
      where: { publicationId: publication.id, tenantId: user.tenantId },
    })).toBe(before);

    const rowA = preview.body.rows[0];
    expect(rowA.parsed.title).toBe('示例作品A');
    expect(rowA.parsed.publishedAt).toContain('2026-08-01');
    expect(rowA.parsed.metrics).toMatchObject({
      views: 961,
      likes: 34,
      comments: 10,
      shares: 9,
      favorites: 3,
    });
    expect(rowA.parsed.metrics.completionRate ?? null).toBeNull();
    expect(rowA.parsed.metrics.averageWatchTimeSeconds ?? null).toBeNull();
    expect(rowA.parsed.metrics.newFollowers ?? null).toBeNull();
    expect(rowA.matchResult.kind).toBe('WEAK');
    expect(rowA.suggestedPublicationId).toBeNull();
    expect(JSON.stringify(preview.body)).toEqual(expect.stringContaining('KNOWN_UNMAPPED_METRIC: 5s完播率'));
    expect(JSON.stringify(preview.body)).not.toContain('Unknown column');

    const rowB = preview.body.rows[1];
    expect(rowB.parsed.metrics.completionRate).toBe(0.12);
    expect(rowB.parsed.metrics.averageWatchTimeSeconds).toBe(33);
    expect(rowB.parsed.metrics.newFollowers).toBe(2);
    expect(rowB.parsed.metrics.completionRate).not.toBe(0.8);
    expect(rowB.parsed.metrics.newFollowers).not.toBe(99);

    expect(rowB.matchResult.kind).toBe('WEAK');
    const payload = {
      projectId,
      mappingVersion: preview.body.mappingVersion,
      fileFingerprint: preview.body.fileFingerprint,
      format: 'XLSX' as const,
      rows: [
        {
          rowNumber: 2,
          publicationId: publication.id,
          observedAt: '2026-08-03T00:00:00.000Z',
          metrics: rowA.parsed.metrics,
        },
        {
          rowNumber: 3,
          publicationId: workB.publication.id,
          observedAt: '2026-08-03T00:00:00.000Z',
          metrics: rowB.parsed.metrics,
        },
      ],
    };
    const confirm = await request(app.getHttpServer())
      .post('/metrics/import/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send(payload)
      .expect(201);
    expect(confirm.body.results[0].status).toBe('imported');
    expect(confirm.body.results[0].snapshot).toMatchObject({
      source: 'IMPORT',
      provider: 'XLSX_IMPORT',
      views: 961,
      likes: 34,
      comments: 10,
      shares: 9,
      favorites: 3,
      completionRate: null,
      averageWatchTimeSeconds: null,
      newFollowers: null,
    });
    const stored = await prisma.publicationMetricSnapshot.findFirstOrThrow({
      where: { id: confirm.body.results[0].snapshot.id, tenantId: user.tenantId },
    });
    expect(confirm.body.results[1].snapshot).toMatchObject({
      source: 'IMPORT',
      provider: 'XLSX_IMPORT',
      views: 1200,
      completionRate: 0.12,
      averageWatchTimeSeconds: 33,
      newFollowers: 2,
    });
    expect(stored.sourceJobId).toBeNull();
    expect(stored.completionRate).toBeNull();

    const replay = await request(app.getHttpServer())
      .post('/metrics/import/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send(payload)
      .expect(201);
    expect(replay.body.results[0].snapshot.id).toBe(confirm.body.results[0].snapshot.id);
    expect(
      await prisma.publicationMetricSnapshot.count({
        where: { publicationId: publication.id, tenantId: user.tenantId },
      }),
    ).toBe(1);

    const summary = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/summary`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(summary.body.latest.views).toBe(961);
    expect(summary.body.latest.likes).toBe(34);
    expect(summary.body.latest.completionRate).toBeNull();
    expect(summary.body.sourcesUsed).toEqual(['IMPORT']);

    const insights = await request(app.getHttpServer())
      .get(`/publications/${publication.id}/metrics/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(insights.body.publicationId).toBe(publication.id);
  });
});
