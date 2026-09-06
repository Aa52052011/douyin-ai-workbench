import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
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
import { ErrorCode } from '../src/common/errors/app-error.js';
import { MARKET_IMPORT_MAPPING_VERSION, MARKET_IMPORT_MAX_FILE_BYTES } from '../src/market/import/market-import.constants.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function registerUser(app: INestApplication, name = 'ImportOwner') {
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

async function createProject(app: INestApplication, token: string, name = '导入项目') {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name })
    .expect(201);
  return res.body as { id: string };
}

async function createBrief(app: INestApplication, token: string, projectId: string, productName = '防脱精华') {
  const res = await request(app.getHttpServer())
    .post(`/projects/${projectId}/product-briefs`)
    .set('Authorization', `Bearer ${token}`)
    .send({ productName, industry: '个护', businessGoal: '获客' })
    .expect(201);
  return res.body as { id: string; version: number; payload: { productName: string } };
}

function csvBuffer(lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf8');
}

async function xlsxBuffer(headers: string[], rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('数据');
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const briefV1 = {
  productName: '职场表达课',
  industry: '教育',
  businessGoal: '获客',
};

describe('Market CSV/XLSX import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-market-import-${process.pid}`);
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    process.env.MEDIA_COMPOSE_PROVIDER = 'mock';
    process.env.MEDIA_IMAGE_PROVIDER = 'color-background';
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

  it('previews without writing and confirms an IMPORT snapshot', async () => {
    const user = await registerUser(app);
    const project = await createProject(app, user.token);
    await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/preview`)
      .set('Authorization', `Bearer ${user.token}`)
      .field('kind', 'CONTENT')
      .attach('file', csvBuffer(['title,views', 'A,10']), 'content.csv')
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe(ErrorCode.PRODUCT_BRIEF_REQUIRED);
      });

    const brief = await createBrief(app, user.token, project.id);
    const beforeResearch = await prisma.marketResearch.count({ where: { tenantId: user.tenantId } });
    const beforeSnapshot = await prisma.marketResearchSnapshot.count({ where: { tenantId: user.tenantId } });

    const file = csvBuffer([
      '作品标题,作品ID,作品链接,播放量,点赞数,完播率,话题',
      '样本A,aweme-1,https://www.douyin.com/video/1,0,10,12%,#防脱|#洗发水',
      '样本A,aweme-1,https://www.douyin.com/video/1,0,10,12%,#防脱|#洗发水',
    ]);
    const preview = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/preview`)
      .set('Authorization', `Bearer ${user.token}`)
      .field('kind', 'CONTENT')
      .field('origin', 'THIRD_PARTY')
      .field('selectionMethod', 'THIRD_PARTY_EXPORT')
      .field('sampleScope', '搜索词“防脱”第一页')
      .field('collectedAtOverride', '2026-09-01T00:00:00.000Z')
      .attach('file', file, 'content.csv')
      .expect(201);

    expect(preview.body.kind).toBe('CONTENT');
    expect(preview.body.mappingVersion).toBe(MARKET_IMPORT_MAPPING_VERSION);
    expect(preview.body.summary.validRows).toBe(1);
    expect(preview.body.summary.duplicateRows).toBe(1);
    expect(preview.body.dataQualityPreview.dataSufficiency).toBe('LIMITED');
    expect(preview.body.dataQualityPreview.importOnly).toBe(true);
    expect(preview.body.dataQualityPreview.thirdPartyUsed).toBe(false);
    expect(preview.body.sampleStatsPreview.note).toBe('snapshot_sample_only');
    expect(preview.body.rows[0].parsedItem.source).toBe('IMPORT');
    expect(preview.body.rows[0].parsedItem.metrics.views).toBe(0);
    expect(preview.body.rows[0].canonicalKey).toContain('id:');
    expect(await prisma.marketResearch.count({ where: { tenantId: user.tenantId } })).toBe(beforeResearch);
    expect(await prisma.marketResearchSnapshot.count({ where: { tenantId: user.tenantId } })).toBe(beforeSnapshot);

    const confirmed = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `import-key-${suffix()}`)
      .send({
        kind: 'CONTENT',
        productBriefId: brief.id,
        collectedAt: '2026-09-01T00:00:00.000Z',
        mappingVersion: preview.body.mappingVersion,
        fileFingerprint: preview.body.fileFingerprint,
        format: 'CSV',
        resolvedMapping: preview.body.resolvedMapping,
        origin: 'THIRD_PARTY',
        selectionMethod: 'THIRD_PARTY_EXPORT',
        sampleScope: '搜索词“防脱”第一页',
        rows: preview.body.rows.map((row: { rowNumber: number; cells: Record<string, unknown> }) => ({
          rowNumber: row.rowNumber,
          cells: row.cells,
        })),
      })
      .expect(201);

    expect(confirmed.body.status).toBe('READY');
    expect(confirmed.body.version).toBe(1);
    expect(confirmed.body.sourceAgentRunId).toBeNull();
    expect(confirmed.body.sourceJobId).toBeNull();
    expect(confirmed.body.snapshot.sources).toEqual(['IMPORT']);
    expect(confirmed.body.snapshot.contents[0].source).toBe('IMPORT');
    expect(confirmed.body.snapshot.dataQuality.dataSufficiency).toBe('LIMITED');
    expect(confirmed.body.queryContext.source).toBe('IMPORT');
    expect(confirmed.body.queryContext.origin).toBe('THIRD_PARTY');
    expect(confirmed.body.queryContext.selectionMethod).toBe('THIRD_PARTY_EXPORT');
    expect(confirmed.body.queryContext.sampleScope).toBe('搜索词“防脱”第一页');
    expect(confirmed.body.queryContext.productBriefVersion).toBe(brief.version);
    expect(await prisma.marketResearchSnapshot.count({ where: { marketResearchId: confirmed.body.id } })).toBe(1);
  });

  it('supports XLSX, custom mapping, assumed collectedAt and ProductBrief isolation', async () => {
    const user = await registerUser(app, 'XlsxOwner');
    const project = await createProject(app, user.token, 'XLSX项目');
    const brief = await createBrief(app, user.token, project.id, '旧名字');
    const file = await xlsxBuffer(['词', '相关'], [['防脱', '掉发|头皮']]);
    const preview = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/preview`)
      .set('Authorization', `Bearer ${user.token}`)
      .field('kind', 'KEYWORD')
      .field('mapping', JSON.stringify({ 词: 'keyword', 相关: 'relatedKeywords' }))
      .attach('file', file, 'keywords.xlsx')
      .expect(201);
    expect(preview.body.format).toBe('XLSX');
    expect(preview.body.collectedAtAssumed).toBe(true);
    expect(preview.body.warnings).toContain('COLLECTED_AT_ASSUMED');
    expect(preview.body.rows[0].parsedItem.relatedKeywords).toEqual(['掉发', '头皮']);

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/product-briefs`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productName: '新名字', industry: '个护', businessGoal: '转化' })
      .expect(201);

    const confirmed = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `xlsx-key-${suffix()}`)
      .send({
        kind: 'KEYWORD',
        productBriefId: brief.id,
        mappingVersion: MARKET_IMPORT_MAPPING_VERSION,
        fileFingerprint: preview.body.fileFingerprint,
        format: 'XLSX',
        resolvedMapping: preview.body.resolvedMapping,
        rows: preview.body.rows.map((row: { rowNumber: number; cells: Record<string, unknown> }) => ({
          rowNumber: row.rowNumber,
          cells: row.cells,
        })),
      })
      .expect(201);
    expect(confirmed.body.productBriefSnapshot.productName).toBe('旧名字');

    const otherProject = await createProject(app, user.token, '隔离');
    await createBrief(app, user.token, otherProject.id);
    await request(app.getHttpServer())
      .post(`/projects/${otherProject.id}/market-research/import/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `cross-${suffix()}`)
      .send({
        kind: 'KEYWORD',
        productBriefId: brief.id,
        mappingVersion: MARKET_IMPORT_MAPPING_VERSION,
        fileFingerprint: preview.body.fileFingerprint,
        format: 'XLSX',
        resolvedMapping: preview.body.resolvedMapping,
        rows: preview.body.rows.map((row: { rowNumber: number; cells: Record<string, unknown> }) => ({
          rowNumber: row.rowNumber,
          cells: row.cells,
        })),
      })
      .expect(404);
  });

  it('rejects bad files, forbidden mapping and identity columns', async () => {
    const user = await registerUser(app, 'RejectOwner');
    const project = await createProject(app, user.token, '拒绝项目');
    await createBrief(app, user.token, project.id);

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/preview`)
      .set('Authorization', `Bearer ${user.token}`)
      .field('kind', 'CONTENT')
      .attach('file', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]), 'old.xls')
      .expect(400);
    await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/preview`)
      .set('Authorization', `Bearer ${user.token}`)
      .field('kind', 'CONTENT')
      .attach('file', Buffer.from('PK\x03\x04xl/vbaProject.bin'), 'macro.xlsm')
      .expect(400);
    await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/preview`)
      .set('Authorization', `Bearer ${user.token}`)
      .field('kind', 'CONTENT')
      .attach('file', Buffer.alloc(MARKET_IMPORT_MAX_FILE_BYTES + 32, 97), 'huge.csv')
      .expect(400)
      .expect({ code: ErrorCode.VALIDATION_ERROR, message: 'Import file is too large' });

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/preview`)
      .set('Authorization', `Bearer ${user.token}`)
      .field('kind', 'KEYWORD')
      .field('mapping', JSON.stringify({ 词: 'canonicalKey' }))
      .attach('file', csvBuffer(['词', '防脱']), 'bad-map.csv')
      .expect(400);

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/preview`)
      .set('Authorization', `Bearer ${user.token}`)
      .field('kind', 'AUDIENCE_SIGNAL')
      .attach('file', csvBuffer(['topic,signalType,username', '掉发,pain,user-1']), 'pii.csv')
      .expect(400);

    const emptyPreview = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/preview`)
      .set('Authorization', `Bearer ${user.token}`)
      .field('kind', 'CONTENT')
      .attach('file', csvBuffer(['title,completionRate', ',12']), 'invalid.csv')
      .expect(201);
    expect(emptyPreview.body.summary.validRows).toBe(0);
    await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `empty-${suffix()}`)
      .send({
        kind: 'CONTENT',
        mappingVersion: MARKET_IMPORT_MAPPING_VERSION,
        fileFingerprint: emptyPreview.body.fileFingerprint,
        format: 'CSV',
        resolvedMapping: emptyPreview.body.resolvedMapping,
        rows: emptyPreview.body.rows.map((row: { rowNumber: number; cells: Record<string, unknown> }) => ({
          rowNumber: row.rowNumber,
          cells: row.cells,
        })),
      })
      .expect(400);
  });

  it('keeps request-level idempotency and allows a new version for a different key', async () => {
    const user = await registerUser(app, 'IdemOwner');
    const project = await createProject(app, user.token, '幂等项目');
    await createBrief(app, user.token, project.id);
    const preview = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/preview`)
      .set('Authorization', `Bearer ${user.token}`)
      .field('kind', 'COMPETITOR')
      .attach('file', csvBuffer(['displayName,followerCount', '竞品A,100']), 'comp.csv')
      .expect(201);

    const payload = {
      kind: 'COMPETITOR',
      mappingVersion: MARKET_IMPORT_MAPPING_VERSION,
      fileFingerprint: preview.body.fileFingerprint,
      format: 'CSV',
      resolvedMapping: preview.body.resolvedMapping,
      origin: 'MANUAL_EXPORT',
      selectionMethod: 'MANUAL_CURATED',
      collectedAt: '2026-09-01T00:00:00.000Z',
      rows: preview.body.rows.map((row: { rowNumber: number; cells: Record<string, unknown> }) => ({
        rowNumber: row.rowNumber,
        cells: row.cells,
      })),
    };
    const key = `same-key-${suffix()}`;
    const first = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', key)
      .send(payload)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', key)
      .send(payload)
      .expect(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.version).toBe(1);

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', key)
      .send({ ...payload, origin: 'UNKNOWN' })
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
      });

    const second = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/import/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `other-key-${suffix()}`)
      .send(payload)
      .expect(201);
    expect(second.body.version).toBe(2);
    expect(second.body.id).not.toBe(first.body.id);

    const concurrentKey = `concurrent-${suffix()}`;
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/projects/${project.id}/market-research/import/confirm`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('x-idempotency-key', concurrentKey)
        .send(payload),
      request(app.getHttpServer())
        .post(`/projects/${project.id}/market-research/import/confirm`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('x-idempotency-key', concurrentKey)
        .send(payload),
    ]);
    expect([a.status, b.status].every((status) => status === 201)).toBe(true);
    expect(a.body.id).toBe(b.body.id);
  });

  it('still allows MANUAL market research after import', async () => {
    const user = await registerUser(app, 'ManualStill');
    const project = await createProject(app, user.token, '手工仍可用');
    await request(app.getHttpServer())
      .post(`/projects/${project.id}/product-briefs`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(briefV1)
      .expect(201);
    const confirmed = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectedAt: '2026-09-01T00:00:00.000Z',
        items: [{ kind: 'KEYWORD', platform: 'douyin', keyword: '手工词' }],
      })
      .expect(201);
    expect(confirmed.body.snapshot.sources).toEqual(['MANUAL']);
  });
});
