/**
 * Step 12.8 — Missing Runtime Product Acceptance
 * Gated: RUN_RUNTIME_ACCEPTANCE=true
 * Uses local acf_dev + safe mock/color-background/ffmpeg providers. No paid providers.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { ErrorCode } from '../src/common/errors/app-error.js';
import { MockModelProvider } from '../src/agents/models/mock.provider.js';
import { JobProcessor } from '../src/jobs/job.processor.js';
import { StorageService } from '../src/media/storage/storage.service.js';
import { isFfmpegAvailable } from '../src/media/ffmpeg/ffmpeg-available.js';
import { REPEATED_SIGNAL_MIN_SUPPORT } from '../src/metrics/performance-feedback.constants.js';

const enabled = process.env.RUN_RUNTIME_ACCEPTANCE === 'true';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidenceRoot = path.join(repoRoot, '.local', 'runtime-acceptance');
const storageRoot = path.join(evidenceRoot, 'storage', `run-${process.pid}`);
const LOCAL_DATABASE_URL = 'postgresql://acf:acf@127.0.0.1:55432/acf_dev?schema=public';
const API_PORT = 3201;
const UI_PORT = 3020;

function suffix(): string {
  return randomUUID().slice(0, 8);
}

type Evidence = Record<string, unknown>;

describe.skipIf(!enabled)('Step 12.8 runtime product acceptance', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let frontend: ChildProcess | undefined;
  const evidence: Evidence = {
    startedAt: new Date().toISOString(),
    externalCalls: { routerOne: 0, wanx: 0, minimax: 0, douyin: 0 },
    issues: [] as Array<{ route: string; severity: string; rootCause: string; blocker: boolean }>,
    fixes: [] as string[],
  };

  beforeAll(async () => {
    mkdirSync(storageRoot, { recursive: true });
    mkdirSync(path.join(evidenceRoot, 'screenshots'), { recursive: true });
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'runtime-acceptance-jwt-secret';
    process.env.PLATFORM_SECRET_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.DATABASE_URL = LOCAL_DATABASE_URL;
    process.env.MEDIA_STORAGE_ROOT = storageRoot;
    process.env.MEDIA_IMAGE_PROVIDER = 'color-background';
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    process.env.MODEL_PROVIDER = 'mock';
    delete process.env.AI_ENGINE_URL;
    delete process.env.MODEL_API_KEY;
    delete process.env.WANX_API_KEY;
    delete process.env.MINIMAX_TTS_API_KEY;
    delete process.env.RUN_REDIS_TESTS;
    delete process.env.RUN_REAL_TTS_TESTS;
    delete process.env.RUN_REAL_VISUAL_TESTS;
    if (isFfmpegAvailable()) {
      process.env.RUN_FFMPEG_TESTS = 'true';
      process.env.MEDIA_COMPOSE_PROVIDER = 'ffmpeg';
      evidence.composeProvider = 'ffmpeg';
    } else {
      process.env.MEDIA_COMPOSE_PROVIDER = 'mock';
      evidence.composeProvider = 'mock';
      (evidence.issues as Array<{ route: string; severity: string; rootCause: string; blocker: boolean }>).push({
        route: 'media/compose',
        severity: 'P2',
        rootCause: 'FFmpeg unavailable; fell back to mock compose with READY asset',
        blocker: false,
      });
    }

    prisma = new PrismaClient({ datasources: { db: { url: LOCAL_DATABASE_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await app.listen(API_PORT);
    evidence.apiBase = `http://127.0.0.1:${API_PORT}`;
  }, 180_000);

  afterAll(async () => {
    if (frontend?.pid) {
      try {
        frontend.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
    evidence.finishedAt = new Date().toISOString();
    writeFileSync(path.join(evidenceRoot, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');
    await app?.close();
    await prisma?.$disconnect();
  });

  it(
    'COMPLETED video → publication → metrics → second planning feedback',
    async () => {
      const mock = app.get(MockModelProvider);
      const callsBefore = mock.generateCalls;
      const tag = suffix();
      const email = `rt-acc-${tag}@example.test`;
      const password = 'Acceptance12';

      const health = await request(app.getHttpServer()).get('/health').expect(200);
      evidence.environment = {
        backendHealth: health.body,
        postgres: 'connected',
        redis: 'not-required-in-memory-queue',
        worker: 'in-process JobProcessor',
        ffmpeg: evidence.composeProvider,
        frontendPlanned: `http://127.0.0.1:${UI_PORT}`,
      };

      const user = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password, name: 'RuntimeAcc' })
        .expect(201);
      const token = user.body.accessToken as string;
      evidence.acceptanceUser = { email, name: 'RuntimeAcc' };

      const isolation = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'V1 Isolation', industry: '个护', platform: 'douyin' })
        .expect(201);

      const project = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'V1 Runtime Acceptance',
          industry: '个护',
          platform: 'douyin',
          description: 'Step 12.8 runtime product acceptance',
        })
        .expect(201);
      evidence.acceptanceProject = { name: 'V1 Runtime Acceptance' };
      evidence.isolationProject = { name: 'V1 Isolation' };

      const brief = await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/product-briefs`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          productName: 'Runtime 防脱精华',
          industry: '个护',
          businessGoal: '获客',
          seedKeywords: ['防脱'],
          sellingPoints: ['植物防脱'],
        })
        .expect(201);

      const positioning = await request(app.getHttpServer())
        .post('/agents/runs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          agentId: 'account.positioning',
          agentVersion: 'v1',
          projectId: project.body.id,
          input: {
            industry: '个护',
            platform: 'douyin',
            accountType: '个人IP',
            goal: '帮助用户建立头皮护理方法',
          },
        })
        .expect(201);

      const research = await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/market-research/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          collectedAt: '2026-09-01T00:00:00.000Z',
          items: [
            {
              kind: 'KEYWORD',
              platform: 'douyin',
              keyword: '防脱',
              relatedKeywords: ['头皮护理'],
              volumeSignal: 'high',
              competitionSignal: 'low',
            },
            {
              kind: 'KEYWORD',
              platform: 'douyin',
              keyword: '头皮护理',
              relatedKeywords: ['防脱'],
              volumeSignal: 'high',
              competitionSignal: 'medium',
            },
            {
              kind: 'CONTENT',
              platform: 'douyin',
              title: '验收样本内容A',
              externalContentId: `rt-c-${tag}-a`,
              views: 200,
              likes: 20,
              comments: 2,
              shares: 1,
              favorites: 1,
              hashtags: ['防脱'],
              keywords: ['防脱'],
            },
            {
              kind: 'CONTENT',
              platform: 'douyin',
              title: '验收样本内容B',
              externalContentId: `rt-c-${tag}-b`,
              views: 300,
              likes: 30,
              comments: 3,
              shares: 2,
              favorites: 2,
              hashtags: ['头皮护理'],
              keywords: ['头皮护理'],
            },
            {
              kind: 'CONTENT',
              platform: 'douyin',
              title: '验收样本内容C',
              externalContentId: `rt-c-${tag}-c`,
              views: 400,
              likes: 40,
              comments: 4,
              shares: 2,
              favorites: 3,
              hashtags: ['防脱'],
              keywords: ['防脱'],
            },
          ],
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/market-research/${research.body.id}/insights`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(201);

      const strategy = await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/campaign-strategies/generate`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', `rt-cs-${tag}`)
        .send({
          productBriefId: brief.body.id,
          positioningRunId: positioning.body.id,
          userGoal: '本阶段只做品牌认知，不做立即转化',
        })
        .expect(201);
      expect(strategy.body.strategy.status).toBe('READY');
      evidence.strategy = { status: strategy.body.strategy.status, version: strategy.body.strategy.version };

      const plan1 = await request(app.getHttpServer())
        .post('/content-plans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: project.body.id,
          planningDays: 7,
          postsPerDay: 1,
          platform: 'douyin',
          positioningRunId: positioning.body.id,
          strategyId: strategy.body.strategy.id,
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/content-plans/${plan1.body.id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const script = await request(app.getHttpServer())
        .post('/scripts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          contentPlanId: plan1.body.id,
          topicId: plan1.body.payload.topics[0].id,
          targetDuration: 15,
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/scripts/${script.body.id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const videoCreated = await request(app.getHttpServer())
        .post('/videos')
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', `rt-video-${tag}`)
        .send({ scriptId: script.body.id, targetDuration: 15 })
        .expect(201);
      await app.get(JobProcessor).process(videoCreated.body.sourceJobId);

      const video = await request(app.getHttpServer())
        .get(`/videos/${videoCreated.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(video.body.status).toBe('COMPLETED');
      expect(video.body.outputAssetId).toBeTruthy();
      expect(video.body.outputAsset?.status).toBe('READY');

      const links = await prisma.assetLink.count({
        where: {
          videoId: video.body.id,
          tenantId: user.body.tenant.id,
          role: 'VIDEO_OUTPUT',
        },
      });
      expect(links).toBe(1);

      const asset = await prisma.asset.findFirstOrThrow({
        where: { id: video.body.outputAssetId, tenantId: user.body.tenant.id },
      });
      const bytes = await app.get(StorageService).get(asset.storageKey);
      expect(bytes.byteLength).toBeGreaterThan(0);

      const preview = await request(app.getHttpServer())
        .get(`/assets/${video.body.outputAssetId}/content`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(preview.headers['content-type']).toMatch(/video|octet|mp4/i);
      expect(preview.body.length ?? Buffer.byteLength(preview.body)).toBeGreaterThan(0);

      const exported = await request(app.getHttpServer())
        .get(`/videos/${video.body.id}/export`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(exported.status).toBe(200);
      evidence.completedVideo = {
        source: 'safe-local-pipeline',
        status: video.body.status,
        outputReady: video.body.outputAsset?.status === 'READY',
        videoOutputLink: links === 1,
        storageBytes: bytes.byteLength,
        previewHttp: preview.status,
        exportHttp: exported.status,
        composeProvider: evidence.composeProvider,
      };

      const pubKey = `rt-pub-${tag}`;
      const pubBody = {
        platform: 'DOUYIN',
        mode: 'MANUAL',
        title: 'acceptance title',
        visibility: 'PUBLIC',
      };
      const pub1 = await request(app.getHttpServer())
        .post(`/videos/${video.body.id}/publications`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', pubKey)
        .send(pubBody)
        .expect(201);
      expect(pub1.body.status).toBe('PENDING');

      const pubReplay = await request(app.getHttpServer())
        .post(`/videos/${video.body.id}/publications`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', pubKey)
        .send(pubBody)
        .expect(201);
      expect(pubReplay.body.id).toBe(pub1.body.id);
      const pubCount = await prisma.publication.count({
        where: { videoId: video.body.id, tenantId: user.body.tenant.id },
      });
      expect(pubCount).toBe(1);
      evidence.publicationCreate = { status: pub1.body.status, idempotentReplay: true };

      const completed = await request(app.getHttpServer())
        .post(`/publications/${pub1.body.id}/manual-complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ externalUrl: 'https://example.com/v1-runtime-acceptance' })
        .expect(200);
      expect(completed.body.status).toBe('PUBLISHED');
      expect(completed.body.publishedAt).toBeTruthy();
      const refreshed = await request(app.getHttpServer())
        .get(`/publications/${pub1.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(refreshed.body.status).toBe('PUBLISHED');
      evidence.manualComplete = { status: refreshed.body.status, hasPublishedAt: Boolean(refreshed.body.publishedAt) };

      const emptyLatest = await request(app.getHttpServer())
        .get(`/publications/${pub1.body.id}/metrics/latest`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      evidence.performanceInitial = {
        latestStatus: emptyLatest.status,
        empty: emptyLatest.body?.snapshot == null,
      };

      const publishedMs = new Date(refreshed.body.publishedAt).getTime();
      const obs1At = new Date(publishedMs + 60_000).toISOString();
      const obs1Key = `rt-m1-${tag}`;
      const obs1Body = {
        views: 1000,
        likes: 80,
        comments: 10,
        shares: 5,
        favorites: 20,
        completionRate: 0.35,
        observedAt: obs1At,
      };
      const obs1 = await request(app.getHttpServer())
        .post(`/publications/${pub1.body.id}/metrics/manual`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', obs1Key)
        .send(obs1Body)
        .expect(201);
      expect(obs1.body.views).toBe(1000);

      const hist1 = await request(app.getHttpServer())
        .get(`/publications/${pub1.body.id}/metrics`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const hist1Count = hist1.body.items?.length ?? 0;
      expect(hist1Count).toBe(1);
      evidence.metricsObs1 = { views: 1000, historyCount: hist1Count, observedAt: obs1.body.observedAt };

      const obs2At = new Date(publishedMs + 120_000).toISOString();
      const obs2Key = `rt-m2-${tag}`;
      const obs2Body = {
        views: 1500,
        likes: 130,
        comments: 15,
        shares: 8,
        favorites: 30,
        completionRate: 0.42,
        observedAt: obs2At,
      };
      const obs2 = await request(app.getHttpServer())
        .post(`/publications/${pub1.body.id}/metrics/manual`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', obs2Key)
        .send(obs2Body)
        .expect(201);

      const obs2Replay = await request(app.getHttpServer())
        .post(`/publications/${pub1.body.id}/metrics/manual`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', obs2Key)
        .send(obs2Body)
        .expect(201);
      expect(obs2Replay.body.id).toBe(obs2.body.id);

      const obs2Conflict = await request(app.getHttpServer())
        .post(`/publications/${pub1.body.id}/metrics/manual`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', obs2Key)
        .send({ ...obs2Body, views: 1501 })
        .expect(409);
      expect(obs2Conflict.body.code).toBe(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);

      const hist2 = await request(app.getHttpServer())
        .get(`/publications/${pub1.body.id}/metrics`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const hist2Rows = hist2.body.items ?? [];
      expect(hist2Rows).toHaveLength(2);

      const latest = await request(app.getHttpServer())
        .get(`/publications/${pub1.body.id}/metrics/latest`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(latest.body.snapshot?.id).toBe(obs2.body.id);
      expect(latest.body.snapshot?.views).toBe(1500);

      const summary = await request(app.getHttpServer())
        .get(`/publications/${pub1.body.id}/metrics/summary`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(summary.body.snapshotCount).toBe(2);
      expect(summary.body.latest?.views).toBe(1500);

      const insights = await request(app.getHttpServer())
        .get(`/publications/${pub1.body.id}/metrics/insights`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(insights.body.insights)).toBe(true);
      evidence.metricsObs2 = {
        views: 1500,
        historyCount: 2,
        latestViews: latest.body.snapshot?.views,
        idempotentReplay: true,
        conflictOnDifferentSemantics: true,
      };
      evidence.performanceSummary = {
        snapshotCount: summary.body.snapshotCount,
        latestViews: summary.body.latest?.views,
        insightsCount: insights.body.insights?.length ?? 0,
        humanized: insights.body.insights?.every((row: { title?: string; message?: string }) =>
          Boolean(row.title || row.message || row.code),
        ),
      };

      const snapCountBeforePlan2 = await prisma.publicationMetricSnapshot.count({
        where: { publicationId: pub1.body.id, tenantId: user.body.tenant.id },
      });

      const plan2 = await request(app.getHttpServer())
        .post('/content-plans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: project.body.id,
          planningDays: 7,
          postsPerDay: 1,
          platform: 'douyin',
          additionalRequirements: '结合最新发布表现继续验证认知',
          positioningRunId: positioning.body.id,
          strategyId: strategy.body.strategy.id,
        })
        .expect(201);
      expect(plan2.body.id).not.toBe(plan1.body.id);

      const plan2Run = await prisma.agentRun.findFirstOrThrow({
        where: { id: plan2.body.sourceAgentRunId, tenantId: user.body.tenant.id },
      });
      const input = plan2Run.input as {
        campaignStrategy?: { id: string; version: number };
        performanceFeedback?: {
          dataState?: string;
          publicationsConsidered?: number;
          sampleSize?: number;
          positiveSignals?: Array<{ code: string; supportCount: number }>;
          cautionSignals?: Array<{ code: string; supportCount: number }>;
          dataQualitySignals?: Array<{ code: string; supportCount: number }>;
        };
      };
      expect(input.campaignStrategy?.id).toBe(strategy.body.strategy.id);
      expect(input.performanceFeedback).toBeTruthy();
      expect(input.performanceFeedback?.publicationsConsidered).toBeGreaterThanOrEqual(1);
      const signalCount =
        (input.performanceFeedback?.positiveSignals?.length ?? 0) +
        (input.performanceFeedback?.cautionSignals?.length ?? 0) +
        (input.performanceFeedback?.dataQualitySignals?.length ?? 0);
      const supportSummary = [
        ...(input.performanceFeedback?.positiveSignals ?? []),
        ...(input.performanceFeedback?.cautionSignals ?? []),
        ...(input.performanceFeedback?.dataQualitySignals ?? []),
      ].map((row) => ({ code: row.code, supportCount: row.supportCount }));

      evidence.feedbackInjection = {
        verified: true,
        campaignStrategy: Boolean(input.campaignStrategy),
        performanceFeedback: Boolean(input.performanceFeedback),
        dataState: input.performanceFeedback?.dataState,
        publicationsConsidered: input.performanceFeedback?.publicationsConsidered,
        sampleSize: input.performanceFeedback?.sampleSize,
        signalCount,
        supportCountSummary: supportSummary,
        repeatedSignalMinSupport: REPEATED_SIGNAL_MIN_SUPPORT,
        note: 'Same publication with 2 observations does not equal supportCount>=2 across publications',
      };
      evidence.secondPlanning = {
        created: true,
        strategyReused: input.campaignStrategy?.id === strategy.body.strategy.id,
        strategyVersion: input.campaignStrategy?.version,
        planVersion: plan2.body.version,
      };
      evidence.agentRuntime = {
        mockGenerateCallsDelta: mock.generateCalls - callsBefore,
        modelProvider: 'mock',
        planningRunStatus: plan2Run.status,
      };

      const isoPubs = await prisma.publication.count({
        where: { projectId: isolation.body.id, tenantId: user.body.tenant.id },
      });
      const isoMetrics = await prisma.publicationMetricSnapshot.count({
        where: { projectId: isolation.body.id, tenantId: user.body.tenant.id },
      });
      expect(isoPubs).toBe(0);
      expect(isoMetrics).toBe(0);
      evidence.crossProjectIsolation = { isolationPubs: isoPubs, isolationMetrics: isoMetrics };

      const snapsAfter = await prisma.publicationMetricSnapshot.count({
        where: { publicationId: pub1.body.id, tenantId: user.body.tenant.id },
      });
      expect(snapsAfter).toBe(snapCountBeforePlan2);

      evidence.businessWrites = [
        'POST /auth/register',
        'POST /projects (acceptance + isolation)',
        'POST product-briefs',
        'POST agents/runs positioning',
        'POST campaign-strategies/generate',
        'POST /content-plans ×2',
        'POST confirm plan/script',
        'POST /scripts',
        'POST /videos + JobProcessor',
        'POST publications + manual-complete',
        'POST metrics/manual ×2',
      ];
      evidence.externalCalls = { routerOne: 0, wanx: 0, minimax: 0, douyin: 0 };
      evidence.ids = {
        projectName: 'V1 Runtime Acceptance',
        hasVideo: true,
        hasPublication: true,
        hasPlan2: true,
        email,
      };
      // keep credentials only in-memory for UI; strip secrets from on-disk evidence
      const uiCredentials = { email, password, token, session: user.body };

      writeFileSync(path.join(evidenceRoot, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');

      frontend = await startFrontend();
      const ui = await runUiChecks({
        email: uiCredentials.email,
        password: uiCredentials.password,
        session: uiCredentials.session,
        projectId: project.body.id,
        videoId: video.body.id,
        publicationId: pub1.body.id,
      });
      evidence.ui = ui;
      writeFileSync(path.join(evidenceRoot, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');

      expect(ui.publicationUi).toBe('PASS');
      expect(ui.performanceDataState).toBe('PASS');
      expect(ui.contentPlansUi).toBe('PASS');
      expect(ui.overviewSecondLoop).toBe('PASS');
      expect(ui.mountSideEffects).toBe('PASS');
      expect(ui.refreshRecovery).toBe('PASS');
    },
    420_000,
  );
});

async function startFrontend(): Promise<ChildProcess> {
  const frontendRoot = path.join(repoRoot, 'apps', 'frontend');
  const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(UI_PORT)], {
    cwd: frontendRoot,
    env: {
      ...process.env,
      BACKEND_URL: `http://127.0.0.1:${API_PORT}`,
      PORT: String(UI_PORT),
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const ready = await waitForHttp(`http://127.0.0.1:${UI_PORT}`, 90_000);
  if (!ready) {
    child.kill();
    throw new Error('frontend failed to start on 3020');
  }
  return child;
}

function waitForHttp(url: string, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      try {
        const res = await fetch(url, { redirect: 'manual' });
        if (res.status > 0) {
          resolve(true);
          return;
        }
      } catch {
        /* retry */
      }
      if (Date.now() - started > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 800);
    };
    void tick();
  });
}

async function prismaCountHint(
  kind: 'publications' | 'metrics',
  id: string,
  token: string,
): Promise<number> {
  const base = `http://127.0.0.1:${API_PORT}`;
  if (kind === 'publications') {
    const res = await fetch(`${base}/publications?projectId=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return -1;
    }
    const body = (await res.json()) as unknown;
    return Array.isArray(body) ? body.length : ((body as { items?: unknown[] }).items?.length ?? -1);
  }
  const res = await fetch(`${base}/publications/${id}/metrics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return -1;
  }
  const body = (await res.json()) as { items?: unknown[] };
  return body.items?.length ?? -1;
}

async function runUiChecks(input: {
  email: string;
  password: string;
  session: unknown;
  projectId: string;
  videoId: string;
  publicationId: string;
}) {
  const require = createRequire(import.meta.url);
  const playwrightPath = path.join(repoRoot, '.local', 'responsive-acceptance', 'node_modules', 'playwright-core');
  if (!existsSync(playwrightPath)) {
    throw new Error('playwright-core missing under .local/responsive-acceptance');
  }
  const { chromium } = require(playwrightPath) as typeof import('playwright-core');
  const base = `http://127.0.0.1:${UI_PORT}`;
  const shotRoot = path.join(evidenceRoot, 'screenshots');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);
  const result: Record<string, unknown> = { shots: [] as string[] };
  const token = (input.session as { accessToken: string }).accessToken;

  try {
    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('邮箱').fill(input.email);
    await page.locator('input[type="password"]').fill(input.password);
    await page.getByRole('button', { name: /登录/ }).click();
    await page.waitForTimeout(2000);
    const health = await page.request.get(`${base}/api/health`);
    result.frontendProxyHealth = { status: health.status(), body: await health.text().catch(() => '') };

    const measure = async (label: string) => {
      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const vw = window.innerWidth;
        const overflow = Math.max(doc.scrollWidth, body.scrollWidth) - vw;
        return { overflow, path: location.pathname, text: document.body.innerText.slice(0, 2000) };
      });
      const file = path.join(shotRoot, `${label}.png`);
      await page.screenshot({ path: file, fullPage: true });
      (result.shots as string[]).push(path.basename(file));
      return metrics;
    };

    await page.goto(`${base}/dashboard/projects/${input.projectId}/publish?videoId=${input.videoId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(1500);
    const pubText = await page.locator('body').innerText();
    result.publicationUiText = pubText.slice(0, 500);
    result.publicationUi =
      /已发布|PUBLISHED|录入表现|标记已发布|发布记录/.test(pubText) && !/Authentication required|无法打开项目/.test(pubText)
        ? 'PASS'
        : 'FAIL';
    await measure('publication-1440');

    await page.goto(`${base}/dashboard/projects/${input.projectId}/performance?publicationId=${input.publicationId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(1500);
    let perf = await measure('performance-1440');
    const hasTabs = (await page.locator('[role="tab"], button').count()) > 0;
    const hasNumbers = /1[,.]?500|130|1[,.]?000|80/.test(perf.text);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const perf390 = await measure('performance-390');
    result.performanceDataState =
      hasNumbers && perf.overflow <= 2 && perf390.overflow <= 2 && hasTabs ? 'PASS' : 'FAIL';
    result.performanceVisual = {
      overflow1440: perf.overflow,
      overflow390: perf390.overflow,
      hasNumbers,
      hasTabs,
      textSample: perf.text.slice(0, 400),
    };

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/dashboard/projects/${input.projectId}/content/plans`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(1200);
    const plansText = await page.locator('body').innerText();
    result.contentPlansUi =
      /计划|DRAFT|草稿|版本|选题/.test(plansText) && !/Authentication required/.test(plansText) ? 'PASS' : 'FAIL';
    await measure('plans-1440');

    await page.goto(`${base}/dashboard/projects/${input.projectId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const overviewText = await page.locator('body').innerText();
    const nextCta = page.getByRole('link', { name: /确认内容计划|创建下一期内容计划|确认计划|从计划选题|生成脚本/ });
    const nextCtaCount = await nextCta.count();
    const strategyRegen = await page.getByRole('link', { name: /^生成推广策略$|^重新生成策略$/ }).count();
    result.overviewSecondLoop =
      nextCtaCount > 0 &&
      strategyRegen === 0 &&
      /已有表现数据|草稿/.test(overviewText) &&
      !/Authentication required|无法打开项目/.test(overviewText)
        ? 'PASS'
        : 'FAIL';
    result.overviewSnippet = overviewText.slice(0, 800);
    result.overviewNextCta = nextCtaCount > 0 ? await nextCta.first().innerText() : null;
    await measure('overview-1440');

    const pubCountBefore = await prismaCountHint('publications', input.projectId, token);
    const metricCountBefore = await prismaCountHint('metrics', input.publicationId, token);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.goto(`${base}/dashboard/projects/${input.projectId}/publish`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.goto(`${base}/dashboard/projects/${input.projectId}/performance?publicationId=${input.publicationId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(800);
    await page.goto(`${base}/dashboard/projects/${input.projectId}/content/plans`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(800);

    const pubCountAfter = await prismaCountHint('publications', input.projectId, token);
    const metricCountAfter = await prismaCountHint('metrics', input.publicationId, token);
    result.mountSideEffects =
      pubCountBefore === pubCountAfter && metricCountBefore === metricCountAfter && metricCountAfter === 2
        ? 'PASS'
        : 'FAIL';
    const refreshedPerf = await page.goto(
      `${base}/dashboard/projects/${input.projectId}/performance?publicationId=${input.publicationId}`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.waitForTimeout(1000);
    const refreshText = await page.locator('body').innerText();
    result.refreshRecovery =
      refreshedPerf?.ok() &&
      /1[,.]?500|130|acceptance title/.test(refreshText) &&
      !/Authentication required/.test(refreshText)
        ? 'PASS'
        : 'FAIL';
    result.proxyHealth = {
      pubCountBefore,
      pubCountAfter,
      metricCountBefore,
      metricCountAfter,
    };
  } finally {
    await browser.close();
  }
  return result;
}
