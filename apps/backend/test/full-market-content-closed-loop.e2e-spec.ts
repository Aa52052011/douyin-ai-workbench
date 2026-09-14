import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  migrateDeploy,
  startTestDatabase,
  stopTestDatabase,
} from '../../../database/test/harness.ts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { ErrorCode } from '../src/common/errors/app-error.js';
import { MockModelProvider } from '../src/agents/models/mock.provider.js';
import { JobProcessor } from '../src/jobs/job.processor.js';
import { MARKET_IMPORT_MAPPING_VERSION } from '../src/market/import/market-import.constants.js';
import { PerformanceFeedbackService } from '../src/metrics/performance-feedback.service.js';
import { PlatformMetricsProviderRegistry } from '../src/metrics/metrics-provider.registry.js';
import { MockPublishingProvider } from '../src/publishing/providers/mock-publishing.provider.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from '../src/agents/definitions/account-positioning.fixture.js';

function suffix(): string {
  return randomUUID().slice(0, 8);
}

function csvBuffer(lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf8');
}

function leakKeys(value: unknown): string[] {
  const text = JSON.stringify(value);
  return [
    'accessToken',
    'refreshToken',
    'credentialRef',
    'providerMetadata',
    'collectionKey',
    'MODEL_API_KEY',
    'password1',
    'rawSnapshot',
    '.csv',
    '.xlsx',
  ].filter((key) => text.includes(key));
}

function evidenceCodes(evidence: Record<string, unknown>): string[] {
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

const BRIEF = {
  productName: '晨光屏障精华',
  industry: '美妆护肤',
  businessGoal: '品牌认知 + 内容获客',
  sellingPoints: ['神经酰胺修护', '敏感肌可用'],
  seedKeywords: ['神经酰胺', '屏障修护'],
};

const TOPIC_KEYS = [
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

async function createProject(app: INestApplication, token: string, name = 'AI护肤内容测试项目') {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, industry: '美妆护肤', platform: 'douyin', description: '闭环验证样本，不是抖音大盘' })
    .expect(201);
  return res.body as { id: string };
}

async function createBrief(app: INestApplication, token: string, projectId: string) {
  const res = await request(app.getHttpServer())
    .post(`/projects/${projectId}/product-briefs`)
    .set('Authorization', `Bearer ${token}`)
    .send(BRIEF)
    .expect(201);
  return res.body as { id: string; version: number; payload: { productName: string } };
}

async function previewAndConfirmImport(
  app: INestApplication,
  token: string,
  projectId: string,
  briefId: string,
  kind: 'CONTENT' | 'KEYWORD',
  file: Buffer,
  filename: string,
  mapping: Record<string, string>,
) {
  const preview = await request(app.getHttpServer())
    .post(`/projects/${projectId}/market-research/import/preview`)
    .set('Authorization', `Bearer ${token}`)
    .field('kind', kind)
    .field('origin', 'THIRD_PARTY')
    .field('selectionMethod', 'THIRD_PARTY_EXPORT')
    .field('sampleScope', '护肤测试样本第一页，非平台大盘')
    .field('collectedAtOverride', '2026-09-01T00:00:00.000Z')
    .field('mapping', JSON.stringify(mapping))
    .attach('file', file, filename)
    .expect(201);
  const confirmed = await request(app.getHttpServer())
    .post(`/projects/${projectId}/market-research/import/confirm`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-idempotency-key', `loop-import-${kind}-${suffix()}`)
    .send({
      kind,
      productBriefId: briefId,
      collectedAt: '2026-09-01T00:00:00.000Z',
      mappingVersion: preview.body.mappingVersion,
      fileFingerprint: preview.body.fileFingerprint,
      format: preview.body.format,
      resolvedMapping: preview.body.resolvedMapping,
      origin: 'THIRD_PARTY',
      selectionMethod: 'THIRD_PARTY_EXPORT',
      sampleScope: '护肤测试样本第一页，非平台大盘',
      rows: preview.body.rows.map((row: { rowNumber: number; cells: Record<string, unknown> }) => ({
        rowNumber: row.rowNumber,
        cells: row.cells,
      })),
    })
    .expect(201);
  return { preview, confirmed };
}

function contentCsv(): Buffer {
  const rows = [
    '标题,作品ID,播放量,点赞,评论,分享,收藏,话题',
    '样本A,loop-a,80,8,1,1,1,#神经酰胺|#屏障',
    '样本B,loop-b,160,16,2,1,1,#神经酰胺',
    '样本C,loop-c,240,24,3,2,2,#屏障修护',
    '样本D,loop-d,320,32,4,2,2,#神经酰胺|#敏感肌',
    '样本E,loop-e,400,40,5,3,3,#神经酰胺',
  ];
  return csvBuffer(rows);
}

function keywordCsv(): Buffer {
  return csvBuffer([
    '词,相关,量级,竞争',
    '神经酰胺,屏障|保湿,high,low',
    '屏障修护,敏感肌|修红,high,low',
    '敏感肌精华,神经酰胺,medium,medium',
    '保湿精华,屏障,medium,high',
    '修红精华,敏感肌,low,low',
  ]);
}

function mixedItems() {
  const contents = Array.from({ length: 5 }, (_, index) => ({
    kind: 'CONTENT' as const,
    platform: 'douyin',
    title: `护肤样本${index + 1}`,
    views: (index + 1) * 80,
    likes: 8,
    comments: 1,
    shares: 1,
    favorites: 1,
    hashtags: ['神经酰胺'],
    keywords: ['神经酰胺'],
  }));
  return [
    {
      kind: 'KEYWORD',
      platform: 'douyin',
      keyword: '神经酰胺',
      relatedKeywords: ['屏障', '保湿'],
      volumeSignal: 'high',
      competitionSignal: 'low',
    },
    {
      kind: 'KEYWORD',
      platform: 'douyin',
      keyword: '屏障修护',
      relatedKeywords: ['敏感肌'],
      volumeSignal: 'high',
      competitionSignal: 'low',
    },
    ...contents,
  ];
}

describe('Full market-to-content closed loop (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let mock: MockModelProvider;
  let processor: JobProcessor;
  let feedback: PerformanceFeedbackService;
  let publisher: MockPublishingProvider;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-loop-10-9-${process.pid}`);
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    process.env.MEDIA_COMPOSE_PROVIDER = 'mock';
    process.env.MEDIA_IMAGE_PROVIDER = 'color-background';
    delete process.env.AI_ENGINE_URL;
    delete process.env.MODEL_API_KEY;
    delete process.env.WANX_API_KEY;
    delete process.env.MINIMAX_TTS_API_KEY;
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
    mock = app.get(MockModelProvider);
    processor = app.get(JobProcessor);
    feedback = app.get(PerformanceFeedbackService);
    publisher = app.get(MockPublishingProvider);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('runs first generation then post-publish feedback on the same project', async () => {
    const user = await registerUser(app, 'ClosedLoop');
    const project = await createProject(app, user.token);
    const registry = app.get(PlatformMetricsProviderRegistry);
    const resolveSpy = vi.spyOn(registry, 'resolve');
    const mockCallsBefore = mock.generateCalls;

    const brief = await createBrief(app, user.token, project.id);
    expect(brief.version).toBe(1);
    expect(brief.payload.productName).toBe(BRIEF.productName);
    const storedBrief = await prisma.productBrief.findFirst({
      where: { id: brief.id, tenantId: user.tenantId, projectId: project.id },
    });
    expect(storedBrief?.workspaceId).toBe(user.workspaceId);

    const contentImport = await previewAndConfirmImport(
      app,
      user.token,
      project.id,
      brief.id,
      'CONTENT',
      contentCsv(),
      'skincare-content.csv',
      {
        标题: 'title',
        作品ID: 'externalContentId',
        播放量: 'views',
        点赞: 'likes',
        评论: 'comments',
        分享: 'shares',
        收藏: 'favorites',
        话题: 'hashtags',
      },
    );
    expect(contentImport.preview.body.mappingVersion).toBe(MARKET_IMPORT_MAPPING_VERSION);
    expect(contentImport.preview.body.dataQualityPreview.dataSufficiency).toBe('LIMITED');
    expect(contentImport.confirmed.body.version).toBe(1);
    expect(contentImport.confirmed.body.snapshot.sources).toEqual(['IMPORT']);
    expect(contentImport.confirmed.body.productBriefSnapshot.productName).toBe(BRIEF.productName);
    expect(contentImport.confirmed.body.snapshot.dataQuality.dataSufficiency).toBe('LIMITED');
    expect(contentImport.confirmed.body.snapshot.contents).toHaveLength(5);

    const keywordImport = await previewAndConfirmImport(
      app,
      user.token,
      project.id,
      brief.id,
      'KEYWORD',
      keywordCsv(),
      'skincare-keywords.csv',
      { 词: 'keyword', 相关: 'relatedKeywords', 量级: 'volumeSignal', 竞争: 'competitionSignal' },
    );
    expect(keywordImport.confirmed.body.version).toBe(2);
    expect(keywordImport.confirmed.body.snapshot.sources).toEqual(['IMPORT']);
    expect(keywordImport.confirmed.body.snapshot.keywords.length).toBeGreaterThanOrEqual(5);
    expect(keywordImport.confirmed.body.productBriefSnapshot.productName).toBe(BRIEF.productName);

    const mixed = await request(app.getHttpServer())
      .post(`/projects/${project.id}/market-research/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectedAt: '2026-09-01T00:00:00.000Z',
        items: mixedItems(),
      })
      .expect(201);
    expect(mixed.body.productBriefSnapshot.productName).toBe(BRIEF.productName);
    expect(mixed.body.productBriefSnapshot.version ?? brief.version).toBeTruthy();

    const contentEvidence = await request(app.getHttpServer())
      .get(`/market-research/${contentImport.confirmed.body.id}/evidence`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const keywordEvidence = await request(app.getHttpServer())
      .get(`/market-research/${keywordImport.confirmed.body.id}/evidence`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const mixedEvidence = await request(app.getHttpServer())
      .get(`/market-research/${mixed.body.id}/evidence`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(contentEvidence.body.dataSufficiency).toBe('LIMITED');
    expect(keywordEvidence.body.dataSufficiency).toBe('LIMITED');
    expect(mixedEvidence.body.dataSufficiency).toBe('LIMITED');
    expect(mixedEvidence.body.confidence).not.toBe('HIGH');
    const mixedCodes = evidenceCodes(mixedEvidence.body);
    expect(mixedCodes).toEqual(
      expect.arrayContaining([
        'KEYWORD_SAMPLE_SIZE',
        'CONTENT_SAMPLE_SIZE',
        'HIGH_VOLUME_SIGNAL_KEYWORDS',
        'PRODUCT_MARKET_KEYWORD_OVERLAP',
      ]),
    );
    expect(evidenceCodes(contentEvidence.body)).toContain('CONTENT_SAMPLE_SIZE');
    expect(evidenceCodes(keywordEvidence.body)).toContain('KEYWORD_SAMPLE_SIZE');
    expect(JSON.stringify(mixedEvidence.body)).not.toMatch(/全抖音|平台大盘|official ranking/);

    const insight = await request(app.getHttpServer())
      .post(`/market-research/${mixed.body.id}/insights`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(201);
    expect(insight.body.run.agentId).toBe('market.intelligence');
    expect(insight.body.run.status).toBe('COMPLETED');
    expect(insight.body.run.input.productBrief.productName).toBe(BRIEF.productName);
    expect(evidenceCodes(insight.body.run.input.marketEvidence).sort()).toEqual(mixedCodes.sort());
    expect(insight.body.insight.sourceAgentRunId).toBe(insight.body.run.id);
    expect(insight.body.insight.payload.confidence).not.toBe('HIGH');
    const usedCodes = [
      ...insight.body.insight.payload.keywordInsights,
      ...insight.body.insight.payload.contentInsights,
      ...insight.body.insight.payload.competitorInsights,
      ...insight.body.insight.payload.trendInsights,
      ...insight.body.insight.payload.audienceInsights,
      ...insight.body.insight.payload.opportunityInsights,
      ...insight.body.insight.payload.strategicImplications,
    ].flatMap((item: { evidenceCodes?: string[] }) => item.evidenceCodes ?? []);
    expect(usedCodes.every((code: string) => mixedCodes.includes(code))).toBe(true);
    expect(JSON.stringify(insight.body.insight.payload)).not.toMatch(
      /publishingCadence|budget|ctaStrategy|contentMix|contentPillars|postingSchedule/,
    );
    expect(insight.body.run.input).not.toHaveProperty('snapshot');
    expect(leakKeys(insight.body.run.input)).toEqual([]);

    const positioning = await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        agentId: 'account.positioning',
        agentVersion: 'v1',
        projectId: project.id,
        input: {
          industry: '美妆护肤',
          platform: 'douyin',
          accountType: '个人IP',
          goal: '帮助敏感肌用户建立屏障护理方法',
        },
      })
      .expect(201);
    expect(positioning.body.status).toBe('COMPLETED');
    expect(positioning.body.output.accountPositioning).toBeTruthy();

    const generated = await request(app.getHttpServer())
      .post(`/projects/${project.id}/campaign-strategies/generate`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `loop-cs-${suffix()}`)
      .send({
        productBriefId: brief.id,
        marketResearchId: mixed.body.id,
        positioningRunId: positioning.body.id,
        userGoal: '先做品牌认知与内容验证，不做强转化。',
      })
      .expect(201);
    expect(generated.body.strategy.version).toBe(1);
    expect(generated.body.strategy.status).toBe('READY');
    expect(generated.body.strategy.sourceAgentRunId).toBe(generated.body.run.id);
    expect(generated.body.strategy.marketInsightId).toBe(insight.body.insight.id);
    expect(generated.body.run.input.marketInsight.payload.version).toBe('v1');
    expect(generated.body.run.input.accountPositioning.positioningRunId).toBe(positioning.body.id);
    expect(generated.body.run.input.performanceFeedback.dataState).toBe('NONE');
    expect(generated.body.strategy.inputSnapshot.performanceFeedback.dataState).toBe('NONE');
    expect(generated.body.strategy.payload.confidence).not.toBe('HIGH');
    const strategyText = JSON.stringify(generated.body.strategy.payload);
    expect(strategyText).toMatch(/PRODUCT_BRIEF|ACCOUNT_POSITIONING|MARKET_INSIGHT/);
    expect(JSON.stringify(generated.body.strategy)).not.toContain('marketEvidence');
    expect(JSON.stringify(generated.body.strategy.payload)).not.toContain('"topics"');
    expect(await prisma.script.count({ where: { projectId: project.id } })).toBe(0);
    expect(leakKeys(generated.body.run.input)).toEqual([]);

    const firstFeedback = await feedback.buildForProject({
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: project.id,
    });
    expect(firstFeedback.dataState).toBe('NONE');

    const plan1 = await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId: project.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        additionalRequirements: '这次先验证屏障护理认知',
        positioningRunId: positioning.body.id,
        strategyId: generated.body.strategy.id,
      })
      .expect(201);
    expect(plan1.body.payload.topics).toHaveLength(7);
    expect(plan1.body.payload).not.toHaveProperty('campaignStrategy');
    for (const topic of plan1.body.payload.topics) {
      for (const key of TOPIC_KEYS) {
        expect(topic).toHaveProperty(key);
      }
    }
    expect(plan1.body.payload.topics[0].title).toContain('·');
    const plan1Run = await prisma.agentRun.findFirst({
      where: { id: plan1.body.sourceAgentRunId, tenantId: user.tenantId },
    });
    const plan1Input = plan1Run?.input as {
      campaignStrategy?: { id: string; version: number; payload: unknown };
      performanceFeedback?: { dataState?: string };
    };
    expect(plan1Input.campaignStrategy?.id).toBe(generated.body.strategy.id);
    expect(plan1Input.campaignStrategy?.version).toBe(1);
    expect(plan1Input.campaignStrategy?.payload).toEqual(generated.body.strategy.payload);
    expect(plan1Input.performanceFeedback?.dataState).toBe('NONE');
    expect(leakKeys(plan1Run?.input)).toEqual([]);

    const strategyAfterPlan1 = await prisma.campaignStrategy.findFirst({
      where: { id: generated.body.strategy.id, tenantId: user.tenantId },
    });
    expect(strategyAfterPlan1?.payload).toEqual(generated.body.strategy.payload);
    expect(strategyAfterPlan1?.version).toBe(1);

    await request(app.getHttpServer())
      .post(`/content-plans/${plan1.body.id}/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const script = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        contentPlanId: plan1.body.id,
        topicId: plan1.body.payload.topics[0].id,
        targetDuration: 15,
      })
      .expect(201);
    expect(script.body.contentPlanId).toBe(plan1.body.id);
    expect(script.body.topicId).toBe(plan1.body.payload.topics[0].id);
    expect(script.body.payload).toHaveProperty('hook');
    expect(script.body.payload).toHaveProperty('sections');
    expect(script.body.payload).not.toHaveProperty('marketInsight');
    expect(script.body.payload).not.toHaveProperty('campaignStrategy');
    const scriptRun = await prisma.agentRun.findFirst({
      where: { id: script.body.sourceAgentRunId, tenantId: user.tenantId },
    });
    expect(scriptRun?.agentId).toBe('script.generation');
    expect(JSON.stringify(scriptRun?.input)).not.toMatch(/marketInsight|marketEvidence|campaignStrategy/);
    await request(app.getHttpServer())
      .post(`/scripts/${script.body.id}/confirm`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const videoCreated = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `loop-video-${suffix()}`)
      .send({ scriptId: script.body.id, targetDuration: 15 })
      .expect(201);
    await processor.process(videoCreated.body.sourceJobId);
    const video = await request(app.getHttpServer())
      .get(`/videos/${videoCreated.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(video.body.status).toBe('COMPLETED');
    expect(video.body.scriptId).toBe(script.body.id);
    expect(video.body.projectId).toBe(project.id);

    const pubA = await request(app.getHttpServer())
      .post(`/videos/${video.body.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `loop-pub-a-${suffix()}`)
      .send({
        platform: 'DOUYIN',
        mode: 'MANUAL',
        title: '闭环作品A',
        visibility: 'PUBLIC',
      })
      .expect(201);
    const pubB = await request(app.getHttpServer())
      .post(`/videos/${video.body.id}/publications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `loop-pub-b-${suffix()}`)
      .send({
        platform: 'MOCK',
        mode: 'MANUAL',
        title: '闭环作品B',
        visibility: 'PUBLIC',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/publications/${pubA.body.id}/manual-complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ externalUrl: 'https://www.douyin.com/video/loop-a' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/publications/${pubB.body.id}/manual-complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ externalPostId: `mock-loop-${suffix()}` })
      .expect(200);
    expect(publisher.getPublishAttempts(pubA.body.id)).toBe(0);
    expect(publisher.getPublishAttempts(pubB.body.id)).toBe(0);

    const publishedAt = new Date('2026-08-01T00:00:00.000Z');
    await prisma.publication.updateMany({
      where: { id: { in: [pubA.body.id, pubB.body.id] }, tenantId: user.tenantId },
      data: { publishedAt, status: 'PUBLISHED' },
    });

    for (const publicationId of [pubA.body.id, pubB.body.id]) {
      await request(app.getHttpServer())
        .post(`/publications/${publicationId}/metrics/manual`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('x-idempotency-key', `loop-m1-${publicationId.slice(0, 8)}`)
        .send({ views: 120, likes: 10, comments: 0, shares: 0, favorites: 0, observedAt: '2026-08-01T12:00:00.000Z' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/publications/${publicationId}/metrics/manual`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('x-idempotency-key', `loop-m2-${publicationId.slice(0, 8)}`)
        .send({ views: 200, likes: 20, comments: 0, shares: 0, favorites: 0, observedAt: '2026-08-02T00:00:00.000Z' })
        .expect(201);
    }

    const latestFeedback = await feedback.buildForProject({
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: project.id,
    });
    expect(latestFeedback.publicationsConsidered).toBe(2);
    expect(latestFeedback.sampleSize).toBe(2);
    expect(latestFeedback.dataState).toBe('USABLE');
    expect(latestFeedback.positiveSignals.some((row) => row.code === 'HIGH_LIKE_RATE' && row.supportCount === 2)).toBe(
      true,
    );
    expect(JSON.stringify(latestFeedback)).not.toContain('collectionKey');
    expect(JSON.stringify(latestFeedback)).not.toContain('providerMetadata');
    expect(latestFeedback.positiveSignals[0]?.publicationIds).toEqual(
      expect.arrayContaining([pubA.body.id, pubB.body.id]),
    );

    const plan1After = await request(app.getHttpServer())
      .get(`/content-plans/${plan1.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const strategyCount = await prisma.campaignStrategy.count({
      where: { tenantId: user.tenantId, projectId: project.id },
    });
    const scriptAfter = await request(app.getHttpServer())
      .get(`/scripts/${script.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const plan2 = await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId: project.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        additionalRequirements: '结合最新发布表现继续验证认知',
        positioningRunId: positioning.body.id,
        strategyId: generated.body.strategy.id,
      })
      .expect(201);
    expect(plan2.body.id).not.toBe(plan1.body.id);
    expect(plan2.body.version).toBe(2);
    const plan2Run = await prisma.agentRun.findFirst({
      where: { id: plan2.body.sourceAgentRunId, tenantId: user.tenantId },
    });
    const plan2Input = plan2Run?.input as {
      campaignStrategy?: { id: string; version: number; payload: unknown };
      performanceFeedback?: { dataState?: string; positiveSignals?: Array<{ code: string }> };
    };
    expect(plan2Input.campaignStrategy?.id).toBe(generated.body.strategy.id);
    expect(plan2Input.campaignStrategy?.version).toBe(1);
    expect(plan2Input.campaignStrategy?.payload).toEqual(generated.body.strategy.payload);
    expect(plan2Input.performanceFeedback?.dataState).toBe('USABLE');
    expect(plan2Input.performanceFeedback?.positiveSignals?.some((row) => row.code === 'HIGH_LIKE_RATE')).toBe(true);
    expect(plan2Input.performanceFeedback).not.toEqual(plan1Input.performanceFeedback);
    expect(mock.lastRequest?.prompt).toContain('HIGH_LIKE_RATE');
    expect(mock.lastRequest?.prompt).toContain('推广策略 JSON');
    expect(plan1After.body.payload.topics[0].id).toBe(plan1.body.payload.topics[0].id);
    expect(scriptAfter.body.payload).toEqual(script.body.payload);
    expect(
      await prisma.campaignStrategy.count({ where: { tenantId: user.tenantId, projectId: project.id } }),
    ).toBe(strategyCount);
    expect(
      await prisma.campaignStrategy.findFirst({
        where: { tenantId: user.tenantId, projectId: project.id, version: 2 },
      }),
    ).toBeNull();

    const runs = await prisma.agentRun.findMany({
      where: { tenantId: user.tenantId, workspaceId: user.workspaceId, projectId: project.id },
    });
    const agentIds = runs.map((row) => row.agentId);
    expect(agentIds).toEqual(
      expect.arrayContaining([
        'account.positioning',
        'market.intelligence',
        'campaign.strategy',
        'content.planning',
        'script.generation',
      ]),
    );
    expect(runs.filter((row) => row.agentId === 'content.planning')).toHaveLength(2);
    expect(runs.every((row) => row.status === 'COMPLETED')).toBe(true);
    for (const run of runs) {
      expect(leakKeys(run.input)).toEqual([]);
    }

    expect(await prisma.productBrief.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.marketResearch.count({ where: { projectId: project.id } })).toBe(3);
    expect(await prisma.marketResearchSnapshot.count({ where: { projectId: project.id } })).toBe(3);
    expect(await prisma.marketInsight.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.campaignStrategy.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.contentPlan.count({ where: { projectId: project.id } })).toBe(2);
    expect(await prisma.script.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.video.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.publication.count({ where: { projectId: project.id } })).toBe(2);
    expect(await prisma.publicationMetricSnapshot.count({ where: { projectId: project.id } })).toBe(4);

    expect(mock.generateCalls).toBeGreaterThan(mockCallsBefore);
    expect(resolveSpy).not.toHaveBeenCalled();
    resolveSpy.mockRestore();
  });

  it('allows no-market strategy and rejects archived strategy without fallback', async () => {
    const user = await registerUser(app, 'FailLoop');
    const project = await createProject(app, user.token, '失败用例项目');
    const brief = await createBrief(app, user.token, project.id);
    const positioning = await request(app.getHttpServer())
      .post('/agents/runs')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        agentId: 'account.positioning',
        agentVersion: 'v1',
        projectId: project.id,
        input: {
          industry: '美妆护肤',
          platform: 'douyin',
          accountType: '个人IP',
          goal: '帮助敏感肌用户建立屏障护理方法',
        },
      })
      .expect(201);
    const generated = await request(app.getHttpServer())
      .post(`/projects/${project.id}/campaign-strategies/generate`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-idempotency-key', `loop-nomarket-${suffix()}`)
      .send({
        productBriefId: brief.id,
        positioningRunId: positioning.body.id,
        userGoal: '先做品牌认知与内容验证，不做强转化。',
      })
      .expect(201);
    expect(generated.body.strategy.payload.dataLimitations).toEqual(
      expect.arrayContaining(['NO_MARKET_INSIGHT']),
    );
    expect(generated.body.run.input.marketInsight).toBeFalsy();

    await prisma.campaignStrategy.update({
      where: { id: generated.body.strategy.id },
      data: { status: 'ARCHIVED' },
    });
    const plansBefore = await prisma.contentPlan.count({ where: { projectId: project.id } });
    await request(app.getHttpServer())
      .post('/content-plans')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        projectId: project.id,
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
        strategyId: generated.body.strategy.id,
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe(ErrorCode.CAMPAIGN_STRATEGY_NOT_USABLE);
      });
    expect(await prisma.contentPlan.count({ where: { projectId: project.id } })).toBe(plansBefore);
  });

  it('does not invent feedback from empty metrics or cross-project publications', async () => {
    const user = await registerUser(app, 'IsoLoop');
    const project = await createProject(app, user.token, '隔离项目');
    const other = await createProject(app, user.token, '污染项目');
    await createBrief(app, user.token, project.id);

    const empty = await feedback.buildForProject({
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: project.id,
    });
    expect(empty.dataState).toBe('NONE');
    expect(empty.positiveSignals).toEqual([]);
    expect(empty.cautionSignals).toEqual([]);

    const otherVideo = await prisma.video.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        projectId: other.id,
        status: 'COMPLETED',
      },
    });
    const otherPub = await prisma.publication.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        projectId: other.id,
        videoId: otherVideo.id,
        platform: 'MOCK',
        mode: 'MANUAL',
        status: 'PUBLISHED',
        title: '外项目',
        visibility: 'PUBLIC',
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        idempotencyKey: `loop-other-${suffix()}`,
        createdByUserId: user.userId,
      },
    });
    await prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: user.tenantId,
        workspaceId: user.workspaceId,
        projectId: other.id,
        publicationId: otherPub.id,
        platform: 'MOCK',
        source: 'MANUAL',
        collectionKey: `loop-other-${suffix()}`,
        observedAt: new Date('2026-08-02T00:00:00.000Z'),
        views: 200,
        likes: 40,
        comments: 0,
        shares: 0,
        favorites: 0,
        provider: 'MANUAL',
      },
    });

    const isolated = await feedback.buildForProject({
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      projectId: project.id,
    });
    expect(isolated.dataState).toBe('NONE');
    expect(isolated.sampleSize).toBe(0);
    expect(isolated.positiveSignals).toEqual([]);
  });
});
