import { randomBytes, randomUUID } from 'node:crypto';
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
import { ErrorCode } from '../src/common/errors/app-error.js';
import { MockModelProvider } from '../src/agents/models/mock.provider.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function registerUser(app: INestApplication, name = 'InsightOwner') {
  const email = `${name.toLowerCase()}-${suffix()}@example.com`;
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'password1', name })
    .expect(201);
  return {
    token: res.body.accessToken as string,
    tenantId: res.body.tenant.id as string,
  };
}

async function createProject(app: INestApplication, token: string, name = '洞察项目') {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name })
    .expect(201);
  return res.body as { id: string };
}

async function createBrief(app: INestApplication, token: string, projectId: string) {
  await request(app.getHttpServer())
    .post(`/projects/${projectId}/product-briefs`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      productName: '防脱精华',
      industry: '个护',
      businessGoal: '获客',
      seedKeywords: ['防脱', '头皮护理'],
      sellingPoints: ['植物防脱', '无人提及的专利成分'],
    })
    .expect(201);
}

function richItems() {
  const contents = Array.from({ length: 10 }, (_, index) => ({
    kind: 'CONTENT',
    platform: 'douyin',
    title: `样本${index + 1}`,
    author: index < 4 ? 'same-author' : `author-${index}`,
    views: (index + 1) * 80,
    likes: 10,
    comments: 2,
    shares: 1,
    favorites: 1,
    hashtags: ['防脱'],
    keywords: ['防脱'],
    durationSeconds: index === 0 ? 15 : 40,
  }));
  return [
    {
      kind: 'KEYWORD',
      platform: 'douyin',
      keyword: '防脱',
      relatedKeywords: ['掉发'],
      volumeSignal: 'high',
      competitionSignal: 'low',
      searchRank: 1,
    },
    {
      kind: 'KEYWORD',
      platform: 'douyin',
      keyword: '头皮护理',
      relatedKeywords: ['掉发'],
      volumeSignal: 'high',
      competitionSignal: 'high',
    },
    ...contents,
    { kind: 'COMPETITOR', platform: 'douyin', displayName: '竞品A', followerCount: 1200, contentThemes: ['防脱'] },
  ];
}

function evidenceCodes(evidence: { [key: string]: unknown }): string[] {
  const bags = [
    evidence.keywordEvidence,
    evidence.contentEvidence,
    evidence.competitorEvidence,
    evidence.trendEvidence,
    evidence.audienceEvidence,
    evidence.opportunityEvidence,
    evidence.insufficientData ? [evidence.insufficientData] : [],
  ];
  return bags.flatMap((items) =>
    Array.isArray(items) ? items.map((item) => (item as { code: string }).code) : [],
  );
}

describe('market.intelligence:v1 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let mock: MockModelProvider;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-market-intel-${process.pid}`);
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
    mock = app.get(MockModelProvider);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('returns deterministic insufficient insight for NONE without calling the model', async () => {
    const user = await registerUser(app, 'NoneInsight');
    const project = await createProject(app, user.token, '空样本项目');
    await createBrief(app, user.token, project.id);
    const confirmed = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ collectedAt: '2026-09-01T00:00:00.000Z', items: [] })
      .expect(201);

    const evidence = await request(app.getHttpServer())
      .get(`/market-research/${confirmed.body.id}/evidence`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(evidence.body.dataSufficiency).toBe('NONE');

    const beforeCalls = mock.generateCalls;
    const created = await request(app.getHttpServer())
      .post(`/market-research/${confirmed.body.id}/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(201);

    expect(mock.generateCalls).toBe(beforeCalls);
    expect(created.body.run.agentId).toBe('market.intelligence');
    expect(created.body.run.usage.totalTokens).toBe(0);
    expect(created.body.run.usage.estimatedCost).toBe('0');
    expect(created.body.insight.version).toBe(1);
    expect(created.body.insight.payload.marketState).toBe('INSUFFICIENT_DATA');
    expect(created.body.insight.payload.confidence).toBe('LOW');
    expect(created.body.insight.payload.dataLimitations).toContain('NO_MARKET_DATA');
    expect(created.body.insight.payload.evidenceCoverage.coverageRate).toBe(0);
    expect(created.body.insight.sourceAgentRunId).toBe(created.body.run.id);
    expect(created.body.run.input.marketEvidence.dataSufficiency).toBe('NONE');
    expect(created.body.run.input).not.toHaveProperty('snapshot');
    expect(created.body.run.input).not.toHaveProperty('contents');
  });

  it('runs ProductBrief → Research → Evidence → Agent and versions insights', async () => {
    const user = await registerUser(app, 'LimitedInsight');
    const project = await createProject(app, user.token);
    await createBrief(app, user.token, project.id);
    const confirmed = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ collectedAt: '2026-09-01T00:00:00.000Z', items: richItems() })
      .expect(201);

    const evidence = await request(app.getHttpServer())
      .get(`/market-research/${confirmed.body.id}/evidence`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(evidence.body.dataSufficiency).toBe('LIMITED');
    const builderCodes = evidenceCodes(evidence.body);
    expect(builderCodes).toEqual(
      expect.arrayContaining([
        'HIGH_VOLUME_SIGNAL_KEYWORDS',
        'ABOVE_SAMPLE_MEDIAN_VIEWS',
        'PRODUCT_MARKET_KEYWORD_OVERLAP',
      ]),
    );

    const planCountBefore = await prisma.contentPlan.count({ where: { tenantId: user.tenantId } });
    const beforeCalls = mock.generateCalls;
    const first = await request(app.getHttpServer())
      .post(`/market-research/${confirmed.body.id}/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(201);
    expect(mock.generateCalls).toBeGreaterThan(beforeCalls);
    expect(first.body.insight.version).toBe(1);
    expect(first.body.run.input.marketEvidence.marketResearchId).toBe(confirmed.body.id);
    expect(evidenceCodes(first.body.run.input.marketEvidence).sort()).toEqual(builderCodes.sort());
    expect(first.body.run.input).not.toHaveProperty('snapshot');
    expect(['LOW', 'MEDIUM']).toContain(first.body.insight.payload.confidence);
    expect(first.body.insight.payload.confidence).not.toBe('HIGH');
    expect(first.body.insight.payload.dataLimitations.length).toBeGreaterThan(0);
    const used = [
      ...first.body.insight.payload.keywordInsights,
      ...first.body.insight.payload.contentInsights,
      ...first.body.insight.payload.competitorInsights,
      ...first.body.insight.payload.opportunityInsights,
      ...first.body.insight.payload.strategicImplications,
    ].flatMap((item: { evidenceCodes: string[] }) => item.evidenceCodes);
    expect(used.every((code: string) => builderCodes.includes(code))).toBe(true);
    expect(JSON.stringify(first.body.insight.payload)).not.toMatch(
      /publishingCadence|budget|ctaStrategy|contentMix|contentPillars|postingSchedule/,
    );

    const firstPayload = first.body.insight.payload;
    const second = await request(app.getHttpServer())
      .post(`/market-research/${confirmed.body.id}/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ userFocus: '关注控油相关覆盖' })
      .expect(201);
    expect(second.body.insight.version).toBe(2);
    expect(second.body.insight.id).not.toBe(first.body.insight.id);

    const listed = await request(app.getHttpServer())
      .get(`/market-research/${confirmed.body.id}/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(listed.body.map((item: { version: number }) => item.version)).toEqual([2, 1]);
    expect(listed.body.find((item: { version: number }) => item.version === 1).payload).toEqual(firstPayload);

    const latest = await request(app.getHttpServer())
      .get(`/market-research/${confirmed.body.id}/insights/latest`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(latest.body.version).toBe(2);
    expect(latest.body.id).toBe(second.body.insight.id);

    expect(await prisma.contentPlan.count({ where: { tenantId: user.tenantId } })).toBe(planCountBefore);

    const other = await registerUser(app, 'InsightOther');
    await request(app.getHttpServer())
      .get(`/market-research/${confirmed.body.id}/insights`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe(ErrorCode.MARKET_RESEARCH_NOT_FOUND);
      });
  });

  it('reuses the same insight when the idempotency key repeats', async () => {
    const user = await registerUser(app, 'IdemInsight');
    const project = await createProject(app, user.token, '幂等项目');
    await createBrief(app, user.token, project.id);
    const confirmed = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ collectedAt: '2026-09-01T00:00:00.000Z', items: richItems() })
      .expect(201);
    const key = `insight-${suffix()}`;
    const first = await request(app.getHttpServer())
      .post(`/market-research/${confirmed.body.id}/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', key)
      .send({})
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/market-research/${confirmed.body.id}/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', key)
      .send({})
      .expect(201);
    expect(second.body.insight.id).toBe(first.body.insight.id);
    expect(second.body.insight.version).toBe(first.body.insight.version);
    const count = await prisma.marketInsight.count({
      where: { tenantId: user.tenantId, marketResearchId: confirmed.body.id },
    });
    expect(count).toBe(1);
  });
});
