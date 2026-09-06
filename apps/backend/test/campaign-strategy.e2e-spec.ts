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

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function registerUser(app: INestApplication, name = 'StrategyGen') {
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

async function createProject(app: INestApplication, token: string, name = '策略生成项目') {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, industry: '个护', platform: 'douyin', description: '测试项目' })
    .expect(201);
  return res.body as { id: string };
}

async function createBrief(app: INestApplication, token: string, projectId: string) {
  const res = await request(app.getHttpServer())
    .post(`/projects/${projectId}/product-briefs`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      productName: '防脱精华',
      industry: '个护',
      businessGoal: '获客',
      seedKeywords: ['防脱'],
      sellingPoints: ['植物防脱'],
    })
    .expect(201);
  return res.body as { id: string; version: number };
}

async function createPositioning(app: INestApplication, token: string, projectId: string) {
  const res = await request(app.getHttpServer())
    .post('/agents/runs')
    .set('Authorization', `Bearer ${token}`)
    .send({
      agentId: 'account.positioning',
      agentVersion: 'v1',
      projectId,
      input: {
        industry: '个护',
        platform: 'douyin',
        accountType: '个人IP',
        goal: '帮助用户建立头皮护理方法',
      },
    })
    .expect(201);
  return res.body as { id: string };
}

describe('campaign.strategy:v1 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-campaign-gen-${process.pid}`);
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

  it('generates v1 without market/performance, versions, and stays idempotent', async () => {
    const user = await registerUser(app);
    const project = await createProject(app, user.token);
    const brief = await createBrief(app, user.token, project.id);
    const positioning = await createPositioning(app, user.token, project.id);
    const key = `cs-none-${suffix()}`;

    const first = await request(app.getHttpServer())
      .post(`/projects/${project.id}/campaign-strategies/generate`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', key)
      .send({
        positioningRunId: positioning.id,
        userGoal: '本阶段只做品牌认知，不做立即转化',
      })
      .expect(201);

    expect(first.body.strategy.version).toBe(1);
    expect(first.body.strategy.status).toBe('READY');
    expect(first.body.strategy.productBriefId).toBe(brief.id);
    expect(first.body.strategy.sourceAgentRunId).toBe(first.body.run.id);
    expect(first.body.run.agentId).toBe('campaign.strategy');
    expect(first.body.run.input.productBrief.id).toBe(brief.id);
    expect(first.body.run.input.inputPriority[0]).toBe('USER_GOAL');
    expect(first.body.strategy.payload.confidence).toBe('LOW');
    expect(first.body.strategy.payload.dataLimitations).toEqual(
      expect.arrayContaining(['NO_MARKET_INSIGHT', 'NO_PERFORMANCE_HISTORY']),
    );
    expect(first.body.strategy.inputSnapshot.flags).toEqual(
      expect.arrayContaining(['NO_MARKET_INSIGHT', 'NO_PERFORMANCE_HISTORY']),
    );
    expect(JSON.stringify(first.body)).not.toMatch(/providerMetadata|collectionKey|credentialRef/);

    const replay = await request(app.getHttpServer())
      .post(`/projects/${project.id}/campaign-strategies/generate`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', key)
      .send({
        positioningRunId: positioning.id,
        userGoal: '本阶段只做品牌认知，不做立即转化',
      })
      .expect(201);
    expect(replay.body.strategy.id).toBe(first.body.strategy.id);
    expect(replay.body.strategy.version).toBe(1);

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/campaign-strategies/generate`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', key)
      .send({
        positioningRunId: positioning.id,
        userGoal: '改成强转化',
      })
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
      });

    const second = await request(app.getHttpServer())
      .post(`/projects/${project.id}/campaign-strategies/generate`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `cs-none-2-${suffix()}`)
      .send({
        positioningRunId: positioning.id,
        userGoal: '本阶段只做品牌认知，不做立即转化',
      })
      .expect(201);
    expect(second.body.strategy.version).toBe(2);
    expect(second.body.strategy.id).not.toBe(first.body.strategy.id);

    const latest = await request(app.getHttpServer())
      .get(`/projects/${project.id}/campaign-strategies/latest`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(latest.body.id).toBe(second.body.strategy.id);
    expect(latest.body.version).toBe(2);

    const firstAgain = await request(app.getHttpServer())
      .get(`/campaign-strategies/${first.body.strategy.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(firstAgain.body.version).toBe(1);
    expect(firstAgain.body.payload).toEqual(first.body.strategy.payload);

    const plans = await request(app.getHttpServer())
      .get('/content-plans')
      .query({ projectId: project.id })
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(plans.body).toEqual([]);

    const concurrentKey = `cs-co-${suffix()}`;
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/projects/${project.id}/campaign-strategies/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('x-idempotency-key', concurrentKey)
        .send({ positioningRunId: positioning.id, userGoal: '并发同一key' }),
      request(app.getHttpServer())
        .post(`/projects/${project.id}/campaign-strategies/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('x-idempotency-key', concurrentKey)
        .send({ positioningRunId: positioning.id, userGoal: '并发同一key' }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.strategy.id).toBe(b.body.strategy.id);
    expect(
      await prisma.campaignStrategy.count({
        where: { tenantId: user.tenantId, projectId: project.id, version: a.body.strategy.version },
      }),
    ).toBe(1);
  });

  it('runs the market insight chain, grounds codes, and blocks cross-project refs', async () => {
    const user = await registerUser(app, 'StrategyChain');
    const project = await createProject(app, user.token, '链路项目');
    const brief = await createBrief(app, user.token, project.id);
    const positioning = await createPositioning(app, user.token, project.id);
    const research = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectedAt: '2026-09-01T00:00:00.000Z',
        items: [
          { kind: 'KEYWORD', platform: 'douyin', keyword: '防脱', volumeSignal: 'high', competitionSignal: 'low' },
          {
            kind: 'CONTENT',
            platform: 'douyin',
            title: '样本A',
            views: 100,
            likes: 10,
            comments: 2,
            shares: 1,
            favorites: 1,
          },
        ],
      })
      .expect(201);
    const insight = await request(app.getHttpServer())
      .post(`/market-research/${research.body.id}/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(201);

    const generated = await request(app.getHttpServer())
      .post(`/projects/${project.id}/campaign-strategies/generate`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `cs-chain-${suffix()}`)
      .send({
        productBriefId: brief.id,
        marketResearchId: research.body.id,
        positioningRunId: positioning.id,
      })
      .expect(201);

    expect(generated.body.strategy.marketInsightId).toBe(insight.body.insight.id);
    expect(generated.body.run.input.marketInsight.payload.version).toBe('v1');
    expect(generated.body.strategy.payload.confidence).not.toBe('HIGH');
    const insightCodes = [
      ...generated.body.run.input.marketInsight.payload.keywordInsights,
      ...generated.body.run.input.marketInsight.payload.contentInsights,
      ...generated.body.run.input.marketInsight.payload.competitorInsights,
      ...generated.body.run.input.marketInsight.payload.trendInsights,
      ...generated.body.run.input.marketInsight.payload.audienceInsights,
      ...generated.body.run.input.marketInsight.payload.opportunityInsights,
      ...generated.body.run.input.marketInsight.payload.strategicImplications,
    ].map((item: { code: string }) => item.code);
    const used = JSON.stringify(generated.body.strategy.payload);
    expect(insightCodes.some((code: string) => used.includes(code))).toBe(true);
    expect(generated.body.run.input).toMatchObject({
      productBrief: { id: brief.id },
      accountPositioning: { positioningRunId: positioning.id },
    });

    const otherProject = await createProject(app, user.token, '另一个项目');
    await request(app.getHttpServer())
      .post(`/projects/${otherProject.id}/campaign-strategies/generate`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `cs-cross-brief-${suffix()}`)
      .send({
        productBriefId: brief.id,
        positioningRunId: positioning.id,
      })
      .expect(404);

    const otherBrief = await createBrief(app, user.token, otherProject.id);
    const otherPos = await createPositioning(app, user.token, otherProject.id);
    await request(app.getHttpServer())
      .post(`/projects/${otherProject.id}/campaign-strategies/generate`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `cs-cross-insight-${suffix()}`)
      .send({
        productBriefId: otherBrief.id,
        marketInsightId: insight.body.insight.id,
        positioningRunId: otherPos.id,
      })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/projects/${otherProject.id}/campaign-strategies/generate`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `cs-cross-pos-${suffix()}`)
      .send({ positioningRunId: positioning.id })
      .expect(404);

    const other = await registerUser(app, 'StrategyOther');
    await request(app.getHttpServer())
      .get(`/campaign-strategies/${generated.body.strategy.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);

    const failedBefore = await prisma.campaignStrategy.count({ where: { tenantId: user.tenantId } });
    await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        agentId: 'campaign.strategy',
        agentVersion: 'v1',
        projectId: project.id,
        input: { token: 'nope', version: 'v1' },
      })
      .expect(400);
    expect(await prisma.campaignStrategy.count({ where: { tenantId: user.tenantId } })).toBe(failedBefore);
  });
});
