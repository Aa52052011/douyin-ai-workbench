import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Platform, PrismaClient, PublicationMode, PublicationStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  migrateDeploy,
  startTestDatabase,
  stopTestDatabase,
} from '../../../database/test/harness.ts';
import { AppModule } from '../src/app.module.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from '../src/agents/definitions/account-positioning.fixture.js';
import { MockModelProvider } from '../src/agents/models/mock.provider.js';
import { configureApp } from '../src/configure-app.js';
import { JOB_QUEUE } from '../src/jobs/queue/queue.constants.js';
import { InMemoryJobQueue } from '../src/jobs/queue/in-memory-job.queue.js';
import { buildDouyinWorkListExportFixture } from '../src/metrics/import/fixtures/douyin-work-list-export.js';
import { DOUYIN_EXPORT_MAPPING_VERSION } from '../src/metrics/import/import-file.constants.js';
import { PerformanceFeedbackService } from '../src/metrics/performance-feedback.service.js';
import { computeRates } from '../src/metrics/publication-metrics-aggregator.js';
import { PlatformMetricsProviderRegistry } from '../src/metrics/metrics-provider.registry.js';

const WORK_A_TITLE = '示例作品A';
const WORK_A_PUBLISHED_AT = '2026-08-01T10:00:00.000Z';
const OBSERVED_AT = '2026-08-03T00:00:00.000Z';
const IMPORTED_METRICS = {
  views: 961,
  likes: 34,
  comments: 10,
  shares: 9,
  favorites: 3,
} as const;
const EXPECTED_RATES = computeRates(IMPORTED_METRICS);
const POSITIONING_INPUT = {
  industry: '教育',
  platform: 'douyin',
  accountType: '个人IP',
  goal: '帮助职场新人建立可执行方法论',
};

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function registerUser(app: INestApplication, name = 'LoopOwner') {
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

async function createProject(app: INestApplication, token: string, name = '真实闭环项目') {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name })
    .expect(201);
  return res.body as { id: string };
}

async function seedPublishedChain(
  prisma: PrismaClient,
  user: { tenantId: string; workspaceId: string; userId: string },
  projectId: string,
  opts: { title: string; publishedAt: Date },
) {
  const tag = suffix();
  const topicId = randomUUID();
  const plan = await prisma.contentPlan.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId,
      title: `闭环计划 ${tag}`,
      status: 'CONFIRMED',
      version: 1,
      payload: {
        title: `闭环计划 ${tag}`,
        summary: 'Step 9.9E fixture chain',
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        topics: [{ id: topicId, title: opts.title, status: 'planned' }],
      },
      positioningSnapshot: MOCK_ACCOUNT_POSITIONING_OUTPUT,
      planningDays: 7,
      postsPerDay: 1,
      platform: 'douyin',
      usedTrendData: false,
    },
  });
  const script = await prisma.script.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId,
      contentPlanId: plan.id,
      topicId,
      title: opts.title,
      content: '闭环脚本旁白',
      version: 1,
      status: 'CONFIRMED',
      payload: { title: opts.title },
      topicSnapshot: { id: topicId, title: opts.title },
    },
  });
  const video = await prisma.video.create({
    data: {
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId,
      scriptId: script.id,
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
      title: opts.title,
      visibility: 'PUBLIC',
      publishedAt: opts.publishedAt,
      idempotencyKey: `idem-loop-${tag}`,
      createdByUserId: user.userId,
    },
  });
  return { plan, script, video, publication };
}

async function runAccountPositioning(
  app: INestApplication,
  token: string,
  projectId: string,
) {
  const res = await request(app.getHttpServer())
    .post('/agents/runs')
    .set('Authorization', `Bearer ${token}`)
    .send({
      agentId: 'account.positioning',
      agentVersion: 'v1',
      projectId,
      input: POSITIONING_INPUT,
    })
    .expect(201);
  expect(res.body.status).toBe('COMPLETED');
  return res.body as { id: string };
}

async function createContentPlan(
  app: INestApplication,
  token: string,
  projectId: string,
  positioningRunId: string,
) {
  return request(app.getHttpServer())
    .post('/content-plans')
    .set('Authorization', `Bearer ${token}`)
    .send({
      projectId,
      planningDays: 7,
      postsPerDay: 1,
      platform: 'douyin',
      positioningRunId,
    })
    .expect(201);
}

type CompactFeedback = {
  version: string;
  dataState: string;
  sampleSize: number;
  publicationsConsidered: number;
  dataQuality: { sufficientCount: number; partialCount: number; insufficientCount: number };
  positiveSignals: Array<{ code: string; publicationIds: string[] }>;
  cautionSignals: Array<{ code: string }>;
  dataQualitySignals: Array<{
    code: string;
    publicationIds: string[];
    representativeEvidence: Array<{ publicationId?: string; metric?: string }>;
  }>;
};

describe('Real Douyin metrics → planning feedback loop (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let queue: InMemoryJobQueue;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-dy-loop-${process.pid}`);
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    process.env.MEDIA_COMPOSE_PROVIDER = 'mock';
    process.env.MEDIA_IMAGE_PROVIDER = 'color-background';
    delete process.env.AI_ENGINE_URL;
    delete process.env.MODEL_API_KEY;
    delete process.env.RUN_REDIS_TESTS;
    delete process.env.RUN_REAL_TTS_TESTS;
    delete process.env.RUN_REAL_VISUAL_TESTS;
    const databaseUrl = await startTestDatabase();
    process.env.DATABASE_URL = databaseUrl;
    migrateDeploy(databaseUrl);
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    queue = app.get(JOB_QUEUE) as InMemoryJobQueue;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('imports a real Douyin work-list row and injects derived feedback into content.planning:v1', async () => {
    const user = await registerUser(app);
    const project = await createProject(app, user.token);
    const registry = app.get(PlatformMetricsProviderRegistry);
    const providerSpy = vi.spyOn(registry, 'resolve');
    const mock = app.get(MockModelProvider);
    const feedbackService = app.get(PerformanceFeedbackService);

    const positioning = await runAccountPositioning(app, user.token, project.id);
    const chain = await seedPublishedChain(prisma, user, project.id, {
      title: WORK_A_TITLE,
      publishedAt: new Date(WORK_A_PUBLISHED_AT),
    });
    expect(chain.video.scriptId).toBe(chain.script.id);
    expect(chain.script.contentPlanId).toBe(chain.plan.id);
    expect(chain.publication.status).toBe(PublicationStatus.PUBLISHED);
    expect(chain.publication.publishedAt?.toISOString()).toBe(WORK_A_PUBLISHED_AT);

    const snapsBeforePreview = await prisma.publicationMetricSnapshot.count({
      where: { tenantId: user.tenantId, publicationId: chain.publication.id },
    });
    const planningRunsBeforeImport = await prisma.agentRun.count({
      where: { tenantId: user.tenantId, projectId: project.id, agentId: 'content.planning' },
    });

    const file = await buildDouyinWorkListExportFixture();
    const preview = await request(app.getHttpServer())
      .post('/metrics/import/preview')
      .set('Authorization', `Bearer ${user.token}`)
      .field('projectId', project.id)
      .field('observedAtOverride', OBSERVED_AT)
      .attach('file', file, '作品列表导出.xlsx')
      .expect(201);

    expect(preview.body.format).toBe('XLSX');
    expect(preview.body.mappingVersion).toBe(DOUYIN_EXPORT_MAPPING_VERSION);
    const rowA = preview.body.rows[0];
    expect(rowA.parsed.title).toBe(WORK_A_TITLE);
    expect(rowA.parsed.publishedAt).toContain('2026-08-01');
    expect(rowA.parsed.metrics).toMatchObject(IMPORTED_METRICS);
    expect(rowA.parsed.metrics.completionRate ?? null).toBeNull();
    expect(rowA.parsed.metrics.averageWatchTimeSeconds ?? null).toBeNull();
    expect(rowA.parsed.metrics.newFollowers ?? null).toBeNull();
    expect(rowA.matchResult.kind).toBe('WEAK');
    expect(rowA.suggestedPublicationId).toBeNull();
    expect(JSON.stringify(preview.body)).toContain('KNOWN_UNMAPPED_METRIC: 5s完播率');
    expect(JSON.stringify(preview.body)).toContain('KNOWN_UNMAPPED_METRIC: 封面点击率');
    expect(JSON.stringify(preview.body)).toContain('KNOWN_UNMAPPED_METRIC: 2s跳出率');
    expect(JSON.stringify(preview.body)).toContain('KNOWN_UNMAPPED_METRIC: 主页访问量');
    expect(
      await prisma.publicationMetricSnapshot.count({
        where: { tenantId: user.tenantId, publicationId: chain.publication.id },
      }),
    ).toBe(snapsBeforePreview);

    const confirmPayload = {
      projectId: project.id,
      mappingVersion: preview.body.mappingVersion,
      fileFingerprint: preview.body.fileFingerprint,
      format: 'XLSX' as const,
      rows: [
        {
          rowNumber: 2,
          publicationId: chain.publication.id,
          observedAt: OBSERVED_AT,
          metrics: rowA.parsed.metrics,
        },
      ],
    };
    const confirm = await request(app.getHttpServer())
      .post('/metrics/import/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send(confirmPayload)
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
    expect(stored.sourceJobId).toBeNull();
    expect(stored.providerMetadata).toEqual({ mappingVersion: DOUYIN_EXPORT_MAPPING_VERSION });
    expect(JSON.stringify(stored)).not.toContain('5s完播率');
    expect(JSON.stringify(stored)).not.toContain('主页访问量');
    expect(
      await prisma.agentRun.count({
        where: { tenantId: user.tenantId, projectId: project.id, agentId: 'content.planning' },
      }),
    ).toBe(planningRunsBeforeImport);

    const replay = await request(app.getHttpServer())
      .post('/metrics/import/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send(confirmPayload)
      .expect(201);
    expect(replay.body.results[0].snapshot.id).toBe(confirm.body.results[0].snapshot.id);
    expect(
      await prisma.publicationMetricSnapshot.count({
        where: { tenantId: user.tenantId, publicationId: chain.publication.id },
      }),
    ).toBe(1);

    const summary = await request(app.getHttpServer())
      .get(`/publications/${chain.publication.id}/metrics/summary`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(summary.body.latest.views).toBe(961);
    expect(summary.body.latest.likes).toBe(34);
    expect(summary.body.latest.comments).toBe(10);
    expect(summary.body.latest.shares).toBe(9);
    expect(summary.body.latest.favorites).toBe(3);
    expect(summary.body.latest.completionRate).toBeNull();
    expect(summary.body.latest.likeRate).toBe(EXPECTED_RATES.likeRate);
    expect(summary.body.latest.commentRate).toBe(EXPECTED_RATES.commentRate);
    expect(summary.body.latest.shareRate).toBe(EXPECTED_RATES.shareRate);
    expect(summary.body.latest.favoriteRate).toBe(EXPECTED_RATES.favoriteRate);
    expect(summary.body.latest.engagementRate).toBe(EXPECTED_RATES.engagementRate);
    expect(summary.body.sourcesUsed).toEqual(['IMPORT']);

    const insights = await request(app.getHttpServer())
      .get(`/publications/${chain.publication.id}/metrics/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const insightCodes = insights.body.insights.map((row: { code: string }) => row.code);
    expect(insights.body.publicationId).toBe(chain.publication.id);
    expect(insights.body.dataSufficiency).toBe('PARTIAL');
    expect(insightCodes).toContain('HIGH_COMMENT_RATE');
    expect(insightCodes).toContain('INSUFFICIENT_DATA');
    expect(insightCodes).not.toContain('STRONG_COMPLETION_RATE');
    expect(insightCodes).not.toContain('WEAK_COMPLETION_RATE');
    const commentInsight = insights.body.insights.find((row: { code: string }) => row.code === 'HIGH_COMMENT_RATE');
    expect(commentInsight.evidence[0].metric).toBe('commentRate');
    expect(commentInsight.evidence[0].value).toBe(EXPECTED_RATES.commentRate);
    expect(commentInsight.evidence[0].views).toBe(961);

    const built = await feedbackService.buildForProject({
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: project.id,
    });
    expect(built.dataState).toBe('LIMITED');
    expect(built.sampleSize).toBe(1);
    expect(built.publicationsConsidered).toBe(1);
    expect(built.dataQuality.partialCount).toBe(1);
    expect(built.positiveSignals).toEqual([]);
    expect(built.cautionSignals).toEqual([]);
    const quality = built.dataQualitySignals.find((row) => row.code === 'INSUFFICIENT_DATA');
    expect(quality?.publicationIds).toEqual([chain.publication.id]);
    expect(quality?.representativeEvidence.some((item) => item.publicationId === chain.publication.id)).toBe(true);
    expect(JSON.stringify(built)).not.toContain('collectionKey');
    expect(JSON.stringify(built)).not.toContain('providerMetadata');
    expect(JSON.stringify(built)).not.toContain(user.tenantId);

    const created = await createContentPlan(app, user.token, project.id, positioning.id);
    expect(created.body.payload.topics).toHaveLength(7);
    expect(created.body.payload).not.toHaveProperty('performanceFeedback');

    const run = await prisma.agentRun.findFirstOrThrow({
      where: { id: created.body.sourceAgentRunId, tenantId: user.tenantId, agentId: 'content.planning' },
    });
    const input = run.input as { performanceFeedback?: CompactFeedback; positioning?: unknown };
    expect(input.positioning).toBeTruthy();
    expect(input.performanceFeedback?.version).toBe('v1');
    expect(input.performanceFeedback?.dataState).toBe('LIMITED');
    expect(input.performanceFeedback?.sampleSize).toBe(1);
    expect(input.performanceFeedback?.dataQuality.partialCount).toBe(1);
    expect(input.performanceFeedback?.dataQualitySignals[0]?.publicationIds).toEqual([chain.publication.id]);
    expect(
      input.performanceFeedback?.dataQualitySignals[0]?.representativeEvidence.some(
        (item) => item.publicationId === chain.publication.id,
      ),
    ).toBe(true);
    expect(JSON.stringify(input.performanceFeedback)).not.toContain('collectionKey');
    expect(JSON.stringify(input.performanceFeedback)).not.toContain('providerMetadata');
    expect(mock.lastRequest?.prompt).toContain('历史表现反馈 JSON');
    expect(mock.lastRequest?.prompt).toContain(chain.publication.id);
    expect(mock.lastRequest?.prompt).toContain('INSUFFICIENT_DATA');
    expect(mock.lastRequest?.systemPrompt).toContain('账号定位');

    expect(providerSpy).not.toHaveBeenCalled();
    expect(queue.enqueued.length).toBe(0);
    providerSpy.mockRestore();
  });

  it('keeps planning healthy when the project has no snapshot (feedback NONE)', async () => {
    const user = await registerUser(app, 'LoopNone');
    const project = await createProject(app, user.token, '无快照项目');
    const positioning = await runAccountPositioning(app, user.token, project.id);
    const feedback = await app.get(PerformanceFeedbackService).buildForProject({
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: project.id,
    });
    expect(feedback.dataState).toBe('NONE');
    expect(feedback.sampleSize).toBe(0);

    const created = await createContentPlan(app, user.token, project.id, positioning.id);
    expect(created.body.payload.topics).toHaveLength(7);
    const run = await prisma.agentRun.findFirstOrThrow({
      where: { id: created.body.sourceAgentRunId, tenantId: user.tenantId },
    });
    const input = run.input as { performanceFeedback?: CompactFeedback };
    expect(input.performanceFeedback?.dataState).toBe('NONE');
    expect(input.performanceFeedback?.sampleSize).toBe(0);
  });

  it('excludes a cross-project imported snapshot from the current project feedback', async () => {
    const user = await registerUser(app, 'LoopIso');
    const projectA = await createProject(app, user.token, '规划项目A');
    const projectB = await createProject(app, user.token, '规划项目B');
    const chainB = await seedPublishedChain(prisma, user, projectB.id, {
      title: WORK_A_TITLE,
      publishedAt: new Date(WORK_A_PUBLISHED_AT),
    });
    const file = await buildDouyinWorkListExportFixture();
    const preview = await request(app.getHttpServer())
      .post('/metrics/import/preview')
      .set('Authorization', `Bearer ${user.token}`)
      .field('projectId', projectB.id)
      .field('observedAtOverride', OBSERVED_AT)
      .attach('file', file, '作品列表导出.xlsx')
      .expect(201);
    await request(app.getHttpServer())
      .post('/metrics/import/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId: projectB.id,
        mappingVersion: preview.body.mappingVersion,
        fileFingerprint: preview.body.fileFingerprint,
        format: 'XLSX',
        rows: [
          {
            rowNumber: 2,
            publicationId: chainB.publication.id,
            observedAt: OBSERVED_AT,
            metrics: preview.body.rows[0].parsed.metrics,
          },
        ],
      })
      .expect(201);

    const foreignFeedback = await app.get(PerformanceFeedbackService).buildForProject({
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: projectB.id,
    });
    expect(foreignFeedback.dataState).toBe('LIMITED');
    expect(foreignFeedback.dataQualitySignals[0]?.publicationIds).toEqual([chainB.publication.id]);

    const positioning = await runAccountPositioning(app, user.token, projectA.id);
    const created = await createContentPlan(app, user.token, projectA.id, positioning.id);
    const run = await prisma.agentRun.findFirstOrThrow({
      where: { id: created.body.sourceAgentRunId, tenantId: user.tenantId },
    });
    const feedback = (run.input as { performanceFeedback?: CompactFeedback }).performanceFeedback;
    expect(feedback?.dataState).toBe('NONE');
    expect(feedback?.sampleSize).toBe(0);
    expect(JSON.stringify(feedback)).not.toContain(chainB.publication.id);
  });
});
