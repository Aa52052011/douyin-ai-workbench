import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MetricSource, Platform, PrismaClient, PublicationMode, PublicationStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  migrateDeploy,
  startTestDatabase,
  stopTestDatabase,
} from '../../../database/test/harness.ts';
import { AppModule } from '../src/app.module.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from '../src/agents/definitions/account-positioning.fixture.js';
import { configureApp } from '../src/configure-app.js';
import { ErrorCode } from '../src/common/errors/app-error.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

const TOPIC_CONTRACT_KEYS = [
  'id',
  'dayIndex',
  'title',
  'hook',
  'contentPillar',
  'targetAudience',
  'painPoint',
  'contentAngle',
  'format',
  'estimatedDuration',
  'priority',
  'reason',
  'keywords',
  'cta',
  'status',
];

async function registerUser(app: INestApplication, name = 'PlanStrategy') {
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
  };
}

async function createProject(app: INestApplication, token: string, name = '策略规划项目') {
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

async function confirmResearch(app: INestApplication, token: string, projectId: string) {
  const res = await request(app.getHttpServer())
    .post(`/projects/${projectId}/market-research/confirm`)
    .set('Authorization', `Bearer ${token}`)
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
  return res.body as { id: string };
}

async function createInsight(app: INestApplication, token: string, researchId: string) {
  const res = await request(app.getHttpServer())
    .post(`/market-research/${researchId}/insights`)
    .set('Authorization', `Bearer ${token}`)
    .send({})
    .expect(201);
  return res.body as { insight: { id: string } };
}

async function generateStrategy(
  app: INestApplication,
  token: string,
  projectId: string,
  body: Record<string, unknown>,
) {
  const res = await request(app.getHttpServer())
    .post(`/projects/${projectId}/campaign-strategies/generate`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-idempotency-key', `cs-plan-${suffix()}`)
    .send(body)
    .expect(201);
  return res.body as {
    strategy: {
      id: string;
      version: number;
      status: string;
      payload: Record<string, unknown>;
      inputSnapshot: Record<string, unknown>;
    };
    run: { id: string };
  };
}

async function createPlan(
  app: INestApplication,
  token: string,
  body: Record<string, unknown>,
  expectedStatus = 201,
) {
  return request(app.getHttpServer())
    .post('/content-plans')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(expectedStatus);
}

async function seedPublished(
  prisma: PrismaClient,
  user: { tenantId: string; workspaceId: string; userId: string },
  projectId: string,
  publishedAt: Date,
) {
  const tag = suffix();
  const video = await prisma.video.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId,
      status: 'COMPLETED',
    },
  });
  return prisma.publication.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId,
      videoId: video.id,
      platform: Platform.MOCK,
      mode: PublicationMode.MANUAL,
      status: PublicationStatus.PUBLISHED,
      title: `Hist ${tag}`,
      visibility: 'PUBLIC',
      publishedAt,
      idempotencyKey: `idem-csplan-${tag}`,
      createdByUserId: user.userId,
    },
  });
}

async function addSnapshot(
  prisma: PrismaClient,
  user: { tenantId: string; workspaceId: string },
  publication: { id: string; projectId: string },
  data: { observedAt: Date; views: number; likes: number },
) {
  return prisma.publicationMetricSnapshot.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: publication.projectId,
      publicationId: publication.id,
      platform: Platform.MOCK,
      source: MetricSource.MANUAL,
      collectionKey: `csplan-${suffix()}`,
      observedAt: data.observedAt,
      views: data.views,
      likes: data.likes,
      comments: 0,
      shares: 0,
      favorites: 0,
      completionRate: 0.7,
      provider: 'MANUAL',
    },
  });
}

async function seedSufficientPublication(
  prisma: PrismaClient,
  user: { tenantId: string; workspaceId: string; userId: string },
  projectId: string,
  publishedAt: Date,
  likes: number,
) {
  const publication = await seedPublished(prisma, user, projectId, publishedAt);
  await addSnapshot(prisma, user, publication, {
    observedAt: new Date(publishedAt.getTime() + 12 * 3600 * 1000),
    views: 120,
    likes: Math.max(1, Math.floor(likes / 2)),
  });
  await addSnapshot(prisma, user, publication, {
    observedAt: new Date(publishedAt.getTime() + 24 * 3600 * 1000),
    views: 200,
    likes,
  });
  return publication;
}

function assertTopicContract(topics: Array<Record<string, unknown>>) {
  for (const topic of topics) {
    for (const key of TOPIC_CONTRACT_KEYS) {
      expect(topic).toHaveProperty(key);
    }
    expect(topic).not.toHaveProperty('experiment');
    expect(topic).not.toHaveProperty('campaignStrategy');
    expect(typeof topic.cta).toBe('string');
  }
}

describe('content.planning + CampaignStrategy (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-plan-cs-${process.pid}`);
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

  it('runs Brief → Market → Insight → Positioning → Strategy → Planning with explicit strategyId', async () => {
    const user = await registerUser(app, 'FullChain');
    const project = await createProject(app, user.token, '闭环项目');
    const brief = await createBrief(app, user.token, project.id);
    const research = await confirmResearch(app, user.token, project.id);
    const insight = await createInsight(app, user.token, research.id);
    const positioning = await createPositioning(app, user.token, project.id);
    const generated = await generateStrategy(app, user.token, project.id, {
      productBriefId: brief.id,
      marketResearchId: research.id,
      positioningRunId: positioning.id,
      userGoal: '本阶段只做品牌认知',
    });

    expect(generated.strategy.status).toBe('READY');
    expect(generated.strategy.payload).toBeTruthy();
    expect(await prisma.productBrief.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.marketResearch.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.marketResearchSnapshot.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.marketInsight.count({ where: { projectId: project.id } })).toBe(1);
    expect(insight.insight.id).toBeTruthy();

    const strategyBefore = await prisma.campaignStrategy.findFirst({
      where: { id: generated.strategy.id, tenantId: user.tenantId },
    });
    const strategyCountBefore = await prisma.campaignStrategy.count({
      where: { tenantId: user.tenantId, projectId: project.id },
    });
    const scriptsBefore = await prisma.script.count({ where: { projectId: project.id } });
    const videosBefore = await prisma.video.count({ where: { projectId: project.id } });

    const created = await createPlan(app, user.token, {
      projectId: project.id,
      planningDays: 7,
      postsPerDay: 2,
      platform: 'douyin',
      additionalRequirements: '这次只规划新品预热方向',
      positioningRunId: positioning.id,
      strategyId: generated.strategy.id,
    });

    expect(created.body.payload.planningDays).toBe(7);
    expect(created.body.payload.postsPerDay).toBe(2);
    expect(created.body.payload.topics).toHaveLength(14);
    expect(created.body.payload.usedTrendData).toBe(false);
    expect(created.body.payload).not.toHaveProperty('campaignStrategy');
    expect(created.body.payload).not.toHaveProperty('strategyId');
    expect(created.body.payload).not.toHaveProperty('performanceFeedback');
    expect(created.body.payload).not.toHaveProperty('marketInsight');
    expect(created.body).not.toHaveProperty('campaignStrategyId');
    assertTopicContract(created.body.payload.topics);
    expect(created.body.payload.topics[0].title).toContain('·');
    expect(created.body.payload.topics[0].title).not.toContain('落地法');
    expect(
      created.body.payload.topics.every((topic: { contentPillar: string }) =>
        MOCK_ACCOUNT_POSITIONING_OUTPUT.contentPillars.some((pillar) => pillar.name === topic.contentPillar),
      ),
    ).toBe(true);

    const run = await prisma.agentRun.findFirst({
      where: { id: created.body.sourceAgentRunId, tenantId: user.tenantId },
    });
    const input = run?.input as {
      strategyId?: string;
      campaignStrategy?: {
        id: string;
        version: number;
        status: string;
        payload: Record<string, unknown>;
        inputSnapshot?: unknown;
      };
      performanceFeedback?: { dataState?: string };
      planningDays?: number;
      postsPerDay?: number;
    };
    expect(run?.agentId).toBe('content.planning');
    expect(input.strategyId).toBe(generated.strategy.id);
    expect(input.campaignStrategy?.id).toBe(generated.strategy.id);
    expect(input.campaignStrategy?.version).toBe(generated.strategy.version);
    expect(input.campaignStrategy?.status).toBe('READY');
    expect(input.campaignStrategy?.payload).toEqual(generated.strategy.payload);
    expect(input.campaignStrategy).not.toHaveProperty('inputSnapshot');
    expect(input.planningDays).toBe(7);
    expect(input.postsPerDay).toBe(2);
    expect(input.performanceFeedback).toBeTruthy();
    const inputText = JSON.stringify(input);
    expect(inputText).not.toContain('inputSnapshot');
    expect(inputText).not.toContain('marketEvidence');
    expect(inputText).not.toContain('collectionKey');
    expect(inputText).not.toContain('providerMetadata');
    expect(inputText).not.toContain('"rawSnapshot"');

    const strategyAfter = await prisma.campaignStrategy.findFirst({
      where: { id: generated.strategy.id, tenantId: user.tenantId },
    });
    expect(strategyAfter?.payload).toEqual(strategyBefore?.payload);
    expect(strategyAfter?.status).toBe(strategyBefore?.status);
    expect(strategyAfter?.version).toBe(strategyBefore?.version);
    expect(
      await prisma.campaignStrategy.count({ where: { tenantId: user.tenantId, projectId: project.id } }),
    ).toBe(strategyCountBefore);
    expect(await prisma.script.count({ where: { projectId: project.id } })).toBe(scriptsBefore);
    expect(await prisma.video.count({ where: { projectId: project.id } })).toBe(videosBefore);
  });

  it('does not auto-load latest Strategy and still accepts CONFIRMED', async () => {
    const user = await registerUser(app, 'NoAuto');
    const project = await createProject(app, user.token, '不自动项目');
    const brief = await createBrief(app, user.token, project.id);
    const positioning = await createPositioning(app, user.token, project.id);
    const generated = await generateStrategy(app, user.token, project.id, {
      productBriefId: brief.id,
      positioningRunId: positioning.id,
    });

    const withoutStrategy = await createPlan(app, user.token, {
      projectId: project.id,
      planningDays: 7,
      postsPerDay: 1,
      platform: 'douyin',
      positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
    });
    const skipped = await prisma.agentRun.findFirst({
      where: { id: withoutStrategy.body.sourceAgentRunId, tenantId: user.tenantId },
    });
    expect((skipped?.input as { campaignStrategy?: unknown }).campaignStrategy).toBeFalsy();
    expect(withoutStrategy.body.payload.topics[0].title).toContain('落地法');

    await prisma.campaignStrategy.update({
      where: { id: generated.strategy.id },
      data: { status: 'CONFIRMED' },
    });
    const confirmed = await createPlan(app, user.token, {
      projectId: project.id,
      planningDays: 7,
      postsPerDay: 1,
      platform: 'douyin',
      positioningRunId: positioning.id,
      strategyId: generated.strategy.id,
    });
    const confirmedRun = await prisma.agentRun.findFirst({
      where: { id: confirmed.body.sourceAgentRunId, tenantId: user.tenantId },
    });
    expect((confirmedRun?.input as { campaignStrategy?: { status?: string } }).campaignStrategy?.status).toBe(
      'CONFIRMED',
    );
    expect(confirmed.body.payload.topics).toHaveLength(7);
  });

  it('rejects archived, missing, and cross-scope strategies without fallback', async () => {
    const user = await registerUser(app, 'RejectCs');
    const other = await registerUser(app, 'OtherCs');
    const project = await createProject(app, user.token, '拒绝项目');
    const otherProject = await createProject(app, user.token, '另一个项目');
    const brief = await createBrief(app, user.token, project.id);
    const positioning = await createPositioning(app, user.token, project.id);
    const generated = await generateStrategy(app, user.token, project.id, {
      productBriefId: brief.id,
      positioningRunId: positioning.id,
    });

    await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        agentId: 'content.planning',
        agentVersion: 'v1',
        projectId: project.id,
        input: {
          positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
          planningDays: 7,
          postsPerDay: 1,
          platform: 'douyin',
          campaignStrategy: {
            id: generated.strategy.id,
            version: 1,
            status: 'READY',
            payload: generated.strategy.payload,
          },
        },
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe(ErrorCode.AGENT_INVALID_INPUT);
      });

    await prisma.campaignStrategy.update({
      where: { id: generated.strategy.id },
      data: { status: 'ARCHIVED' },
    });
    const plansBefore = await prisma.contentPlan.count({ where: { projectId: project.id } });
    const archived = await createPlan(
      app,
      user.token,
      {
        projectId: project.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
        strategyId: generated.strategy.id,
      },
      400,
    );
    expect(archived.body.code).toBe(ErrorCode.CAMPAIGN_STRATEGY_NOT_USABLE);
    expect(await prisma.contentPlan.count({ where: { projectId: project.id } })).toBe(plansBefore);
    expect(
      await prisma.campaignStrategy.findFirst({
        where: { id: generated.strategy.id, tenantId: user.tenantId },
      }),
    ).toMatchObject({ status: 'ARCHIVED' });

    const crossProject = await createPlan(
      app,
      user.token,
      {
        projectId: otherProject.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
        strategyId: generated.strategy.id,
      },
      404,
    );
    expect(crossProject.body.code).toBe(ErrorCode.CAMPAIGN_STRATEGY_NOT_FOUND);

    const foreignProject = await createProject(app, other.token, '外人项目');
    const crossTenant = await createPlan(
      app,
      other.token,
      {
        projectId: foreignProject.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
        strategyId: generated.strategy.id,
      },
      404,
    );
    expect(crossTenant.body.code).toBe(ErrorCode.CAMPAIGN_STRATEGY_NOT_FOUND);

    const missing = await createPlan(
      app,
      user.token,
      {
        projectId: project.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
        strategyId: randomUUID(),
      },
      404,
    );
    expect(missing.body.code).toBe(ErrorCode.CAMPAIGN_STRATEGY_NOT_FOUND);
  });

  it('keeps the original Strategy snapshot while injecting latest PerformanceFeedback', async () => {
    const user = await registerUser(app, 'HistFb');
    const project = await createProject(app, user.token, '反馈刷新项目');
    const brief = await createBrief(app, user.token, project.id);
    const positioning = await createPositioning(app, user.token, project.id);
    const generated = await generateStrategy(app, user.token, project.id, {
      productBriefId: brief.id,
      positioningRunId: positioning.id,
    });
    const snapshotFeedback = (generated.strategy.inputSnapshot as { performanceFeedback?: { dataState?: string } })
      .performanceFeedback;
    expect(snapshotFeedback?.dataState).toBe('NONE');

    await seedSufficientPublication(prisma, user, project.id, new Date('2026-08-01T00:00:00.000Z'), 20);
    await seedSufficientPublication(prisma, user, project.id, new Date('2026-08-03T00:00:00.000Z'), 22);

    const created = await createPlan(app, user.token, {
      projectId: project.id,
      planningDays: 7,
      postsPerDay: 1,
      platform: 'douyin',
      positioningRunId: positioning.id,
      strategyId: generated.strategy.id,
    });

    const run = await prisma.agentRun.findFirst({
      where: { id: created.body.sourceAgentRunId, tenantId: user.tenantId },
    });
    const input = run?.input as {
      campaignStrategy?: { id: string; payload: unknown };
      performanceFeedback?: { dataState?: string; version?: string; positiveSignals?: Array<{ code: string }> };
    };
    expect(input.campaignStrategy?.id).toBe(generated.strategy.id);
    expect(input.campaignStrategy?.payload).toEqual(generated.strategy.payload);
    expect(input.performanceFeedback?.version).toBe('v1');
    expect(input.performanceFeedback?.dataState).toBe('USABLE');
    expect(input.performanceFeedback?.positiveSignals?.some((row) => row.code === 'HIGH_LIKE_RATE')).toBe(true);
    expect(JSON.stringify(input.performanceFeedback)).not.toContain('collectionKey');
    expect(created.body.payload.topics).toHaveLength(7);
    expect(
      await prisma.campaignStrategy.count({ where: { tenantId: user.tenantId, projectId: project.id } }),
    ).toBe(1);
    expect(await prisma.script.count({ where: { projectId: project.id } })).toBe(0);
  });
});
