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

async function registerUser(app: INestApplication, name = 'StrategyOwner') {
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

async function createProject(app: INestApplication, token: string, name = '策略项目') {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, industry: '个护', platform: 'douyin', description: '测试项目' })
    .expect(201);
  return res.body as { id: string };
}

async function createBrief(app: INestApplication, token: string, projectId: string, productName = '防脱精华') {
  const res = await request(app.getHttpServer())
    .post(`/projects/${projectId}/product-briefs`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      productName,
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
  return res.body as { id: string; output: Record<string, unknown> };
}

describe('Campaign Strategy Foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-campaign-${process.pid}`);
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

  it('composes input without writing a strategy row and allows missing insight', async () => {
    const user = await registerUser(app);
    const project = await createProject(app, user.token);
    const brief = await createBrief(app, user.token, project.id);
    const positioning = await createPositioning(app, user.token, project.id);
    const agents = await request(app.getHttpServer())
      .get('/agents')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(agents.body.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([
        'account.positioning',
        'campaign.strategy',
        'content.planning',
        'market.intelligence',
        'script.generation',
        'system.echo',
      ]),
    );
    expect(agents.body.some((item: { id: string }) => item.id === 'campaign.strategy')).toBe(true);

    const empty = await request(app.getHttpServer())
      .get(`/projects/${project.id}/campaign-strategies`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(empty.body).toEqual([]);

    const before = await prisma.campaignStrategy.count({ where: { tenantId: user.tenantId } });
    const composed = await request(app.getHttpServer())
      .post(`/projects/${project.id}/campaign-strategy/compose-input`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        positioningRunId: positioning.id,
        userGoal: '先验证控油相关方向',
        focus: '样本覆盖',
      })
      .expect(201);

    expect(composed.body.productBrief.id).toBe(brief.id);
    expect(composed.body.productBrief.payload.productName).toBe('防脱精华');
    expect(composed.body.accountPositioning.positioningRunId).toBe(positioning.id);
    expect(composed.body.accountPositioning.output.accountPositioning).toBeTruthy();
    expect(composed.body.marketInsight).toBeNull();
    expect(composed.body.flags).toEqual(expect.arrayContaining(['NO_MARKET_INSIGHT', 'NO_PERFORMANCE_HISTORY']));
    expect(composed.body.performanceFeedback.dataState).toBe('NONE');
    expect(composed.body.performanceFeedback).not.toHaveProperty('providerMetadata');
    expect(composed.body.confidenceCeiling).toBe('LOW');
    expect(composed.body.dataState.overall).toBe('LIMITED');
    expect(composed.body.currentUserGoal.userGoal).toBe('先验证控油相关方向');
    expect(composed.body.projectContext.name).toBe('策略项目');
    expect(composed.body.inputPriority[0]).toBe('USER_GOAL');
    expect(JSON.stringify(composed.body)).not.toMatch(/credentialRef|providerMetadata|collectionKey/);
    expect(await prisma.campaignStrategy.count({ where: { tenantId: user.tenantId } })).toBe(before);

    await request(app.getHttpServer())
      .get(`/projects/${project.id}/campaign-strategies/latest`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe(ErrorCode.CAMPAIGN_STRATEGY_NOT_FOUND);
      });
  });

  it('loads explicit brief, latest insight, mismatch flag, and blocks cross-project refs', async () => {
    const user = await registerUser(app, 'InsightStrategy');
    const project = await createProject(app, user.token, '洞察策略');
    const briefV1 = await createBrief(app, user.token, project.id, '防脱精华');
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

    const withInsight = await request(app.getHttpServer())
      .post(`/projects/${project.id}/campaign-strategy/compose-input`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        productBriefId: briefV1.id,
        marketResearchId: research.body.id,
        positioningRunId: positioning.id,
      })
      .expect(201);
    expect(withInsight.body.marketInsight.id).toBe(insight.body.insight.id);
    expect(withInsight.body.marketInsight.payload.version).toBe('v1');
    expect(withInsight.body.flags).not.toContain('NO_MARKET_INSIGHT');
    expect(withInsight.body.confidenceCeiling).not.toBe('HIGH');

    const briefV2 = await createBrief(app, user.token, project.id, '防脱精华升级版');
    const mismatched = await request(app.getHttpServer())
      .post(`/projects/${project.id}/campaign-strategy/compose-input`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        productBriefId: briefV2.id,
        marketInsightId: insight.body.insight.id,
        positioningRunId: positioning.id,
      })
      .expect(201);
    expect(mismatched.body.flags).toContain('BRIEF_VERSION_MISMATCH');
    expect(mismatched.body.productBrief.id).toBe(briefV2.id);

    const otherProject = await createProject(app, user.token, '另一个项目');
    await request(app.getHttpServer())
      .post(`/projects/${otherProject.id}/campaign-strategy/compose-input`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        productBriefId: briefV1.id,
        positioningRunId: positioning.id,
      })
      .expect(404);

    const other = await registerUser(app, 'StrategyOther');
    await request(app.getHttpServer())
      .post(`/projects/${project.id}/campaign-strategy/compose-input`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ positioningRunId: positioning.id })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/campaign-strategy/compose-input`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ positioningRunId: insight.body.run.id })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe(ErrorCode.CAMPAIGN_STRATEGY_POSITIONING_INVALID);
      });
  });
});
