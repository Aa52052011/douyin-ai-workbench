import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  migrateDeploy,
  startTestDatabase,
  stopTestDatabase,
} from '../../../database/test/harness.ts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { JobProcessor } from '../src/jobs/job.processor.js';
import { isFfmpegAvailable, isFfprobeAvailable } from '../src/media/ffmpeg/ffmpeg-available.js';
import { ffprobeBin, resolveComposeProviderId } from '../src/media/ffmpeg/ffmpeg-config.js';
import { runChildProcess } from '../src/media/ffmpeg/run-process.js';
import { StorageService } from '../src/media/storage/storage.service.js';
import { isMiniMaxTtsConfigured, readMiniMaxTtsConfig } from '../src/media/tts/minimax-tts-config.js';
import { resolveTtsProviderId } from '../src/media/tts/tts-config.js';
import { resolveImageProviderId } from '../src/media/visual/visual-config.js';
import { isWanxImageConfigured, readWanxImageConfig } from '../src/media/visual/wanx-config.js';
import { usesInMemoryJobQueue } from '../src/jobs/queue/redis-config.js';
import { REAL_VISUAL_PIPELINE_SCRIPT } from '../src/videos/pipeline/real-visual-pipeline.fixture.js';
import { visualClientRequestId } from '../src/videos/pipeline/visual-reuse.js';
import type { VideoProductionPlan, VisualSceneCheckpoint } from '../src/videos/pipeline/production-plan.types.js';

function isValidationEnabled(): boolean {
  try {
    return (
      process.env.RUN_REAL_VISUAL_PIPELINE_VALIDATION === 'true' &&
      process.env.RUN_REAL_VISUAL_TESTS === 'true' &&
      process.env.RUN_REAL_TTS_TESTS === 'true' &&
      process.env.RUN_FFMPEG_TESTS === 'true' &&
      process.env.MEDIA_IMAGE_PROVIDER === 'wanx' &&
      process.env.MEDIA_TTS_PROVIDER === 'minimax-tts' &&
      process.env.MEDIA_COMPOSE_PROVIDER === 'ffmpeg' &&
      isWanxImageConfigured() &&
      isMiniMaxTtsConfigured() &&
      isFfmpegAvailable()
    );
  } catch {
    return false;
  }
}

const enabled = isValidationEnabled();
const KEEP_MP4 = path.resolve('D:/project/ai-content-factory/storage/real-visual-pipeline-validation.mp4');

function suffix(): string {
  return randomUUID().slice(0, 8);
}

function redactWanxBase(url: string): string {
  return url.replace(/https:\/\/[^/]+/, 'https://***');
}

async function pingRedis(url: string): Promise<boolean> {
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    lazyConnect: true,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

function hasCjk(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function countSrtCues(srt: string): number {
  return [...srt.matchAll(/^\d+\s*$/gm)].length || [...srt.matchAll(/-->/g)].length;
}

function secretsFromEnv(): string[] {
  return [process.env.WANX_API_KEY, process.env.MINIMAX_TTS_API_KEY]
    .map((item) => item?.trim() ?? '')
    .filter((item) => item.length >= 8);
}

function leakScan(text: string, secrets: string[]): {
  wanxKey: boolean;
  minimaxKey: boolean;
  authorization: boolean;
  signedUrl: boolean;
} {
  const wanx = process.env.WANX_API_KEY?.trim() ?? '';
  const minimax = process.env.MINIMAX_TTS_API_KEY?.trim() ?? '';
  return {
    wanxKey: Boolean(wanx && wanx.length >= 8 && text.includes(wanx)),
    minimaxKey: Boolean(minimax && minimax.length >= 8 && text.includes(minimax)),
    authorization: /Authorization/i.test(text) || /Bearer\s+\S{8,}/.test(text),
    signedUrl:
      /x-oss-signature/i.test(text) ||
      /OSSAccessKeyId/i.test(text) ||
      /x-oss-credential/i.test(text) ||
      /Signature=/i.test(text),
  };
}

type PlanInput = {
  productionPlan?: VideoProductionPlan;
};

describe.skipIf(!enabled)('Step 7.5 Full Real Visual Pipeline', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let previous: Record<string, string | undefined>;

  beforeAll(async () => {
    previous = {
      NODE_ENV: process.env.NODE_ENV,
      MEDIA_COMPOSE_PROVIDER: process.env.MEDIA_COMPOSE_PROVIDER,
      MEDIA_TTS_PROVIDER: process.env.MEDIA_TTS_PROVIDER,
      MEDIA_IMAGE_PROVIDER: process.env.MEDIA_IMAGE_PROVIDER,
      MEDIA_STORAGE_ROOT: process.env.MEDIA_STORAGE_ROOT,
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
      RUN_FFMPEG_TESTS: process.env.RUN_FFMPEG_TESTS,
      RUN_REAL_TTS_TESTS: process.env.RUN_REAL_TTS_TESTS,
      RUN_REAL_VISUAL_TESTS: process.env.RUN_REAL_VISUAL_TESTS,
      RUN_REDIS_TESTS: process.env.RUN_REDIS_TESTS,
      AI_ENGINE_URL: process.env.AI_ENGINE_URL,
      MODEL_API_KEY: process.env.MODEL_API_KEY,
    };
    process.env.NODE_ENV = 'test';
    process.env.RUN_FFMPEG_TESTS = 'true';
    process.env.RUN_REAL_TTS_TESTS = 'true';
    process.env.RUN_REAL_VISUAL_TESTS = 'true';
    process.env.MEDIA_COMPOSE_PROVIDER = 'ffmpeg';
    process.env.MEDIA_TTS_PROVIDER = 'minimax-tts';
    process.env.MEDIA_IMAGE_PROVIDER = 'wanx';
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MEDIA_STORAGE_ROOT = path.join(os.tmpdir(), `acf-real-visual-e2e-${process.pid}`);
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
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await app.close();
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it('runs Script → Wanx → MiniMax → SRT → FFmpeg → finalize once', async () => {
    const secrets = secretsFromEnv();
    const wanxCfg = readWanxImageConfig();
    const ttsCfg = readMiniMaxTtsConfig();
    const redisUrl = process.env.REDIS_URL?.trim() ?? '';
    const storage = app.get(StorageService);
    const probeKey = `v1/${randomUUID()}/${randomUUID()}/${randomUUID()}/${randomUUID()}/${randomUUID()}`;
    await storage.put(probeKey, Buffer.from('preflight'), { mimeType: 'text/plain' });
    const storageWritable = await storage.exists(probeKey);
    await storage.delete(probeKey);
    const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const redisOk = redisUrl ? await pingRedis(redisUrl) : false;
    const beijing = /cn-beijing\.maas\.aliyuncs\.com/i.test(wanxCfg.baseUrl);
    const preflight = {
      database: dbOk,
      redis: redisOk,
      backendConfig:
        resolveImageProviderId() === 'wanx' &&
        resolveTtsProviderId() === 'minimax-tts' &&
        resolveComposeProviderId() === 'ffmpeg',
      workerConfig: usesInMemoryJobQueue() && Boolean(app.get(JobProcessor)),
      storageWritable,
      ffmpeg: isFfmpegAvailable(),
      ffprobe: isFfprobeAvailable(),
      wanxConfigured: isWanxImageConfigured(wanxCfg) && beijing && wanxCfg.model === 'wan2.6-t2i' && wanxCfg.size === '960*1696',
      minimaxConfigured: isMiniMaxTtsConfigured(ttsCfg),
      wanxBaseRedacted: redactWanxBase(wanxCfg.baseUrl),
      wanxModel: wanxCfg.model,
      wanxSize: wanxCfg.size,
      ttsModel: ttsCfg.model,
      ttsProvider: resolveTtsProviderId(),
      imageProvider: resolveImageProviderId(),
      composeProvider: resolveComposeProviderId(),
    };
    console.log('STEP75_PREFLIGHT', JSON.stringify(preflight));
    if (
      !preflight.database ||
      !preflight.redis ||
      !preflight.backendConfig ||
      !preflight.workerConfig ||
      !preflight.storageWritable ||
      !preflight.ffmpeg ||
      !preflight.ffprobe ||
      !preflight.wanxConfigured ||
      !preflight.minimaxConfigured
    ) {
      console.log('STEP75_STOP', JSON.stringify({ reason: 'preflight', paidRequests: 0 }));
      throw new Error('STOP: preflight failed; 0 paid requests');
    }

    const email = `rvp-${suffix()}@example.com`;
    const user = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password1', name: 'RvpUser' })
      .expect(201);
    const token = user.body.accessToken as string;
    const tenantId = user.body.tenant.id as string;
    const workspaceId = user.body.workspace.id as string;
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'RealVisual验收' })
      .expect(201);
    const topicId = randomUUID();
    const content = REAL_VISUAL_PIPELINE_SCRIPT.sections.map((item) => item.narration).join('\n');
    const planRow = await prisma.contentPlan.create({
      data: {
        tenantId,
        workspaceId,
        projectId: project.body.id,
        title: 'Real Visual Pipeline fixture',
        status: 'CONFIRMED',
        version: 1,
        payload: {
          title: 'Real Visual Pipeline fixture',
          summary: 'fixture，未调用 Content Planning Agent',
          planningDays: 7,
          postsPerDay: 1,
          platform: 'douyin',
          topics: [{ id: topicId, title: REAL_VISUAL_PIPELINE_SCRIPT.title, status: 'planned' }],
        },
        positioningSnapshot: {},
        planningDays: 7,
        postsPerDay: 1,
        platform: 'douyin',
        usedTrendData: false,
      },
    });
    const script = await prisma.script.create({
      data: {
        tenantId,
        workspaceId,
        projectId: project.body.id,
        contentPlanId: planRow.id,
        topicId,
        title: REAL_VISUAL_PIPELINE_SCRIPT.title,
        content,
        version: 1,
        status: 'CONFIRMED',
        payload: REAL_VISUAL_PIPELINE_SCRIPT,
        topicSnapshot: { id: topicId, title: REAL_VISUAL_PIPELINE_SCRIPT.title },
      },
    });

    const reusablePaid = await prisma.asset.count({
      where: { tenantId, type: 'IMAGE', deletedAt: null },
    });
    expect(reusablePaid).toBe(0);

    let videoPosts = 0;
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${token}`)
      .set('x-request-id', `rvp-${suffix()}-once`)
      .send({ scriptId: script.id, targetDuration: 30 });
    videoPosts += 1;
    expect(videoPosts).toBe(1);
    expect(created.status).toBe(201);
    const videoId = created.body.id as string;
    const jobId = created.body.sourceJobId as string;
    expect(videoId).toBeTruthy();
    expect(jobId).toBeTruthy();

    const dbJob = await prisma.job.findFirstOrThrow({ where: { id: jobId, tenantId } });
    const productionPlan = (dbJob.input as PlanInput).productionPlan;
    const sceneCount = productionPlan?.scenes.length ?? 0;
    console.log(`scene count = ${sceneCount}`);
    if (sceneCount !== 4 || !productionPlan) {
      console.log('STEP75_STOP', JSON.stringify({ reason: 'scene-count', sceneCount, paidRequests: 0 }));
      throw new Error('STOP: visual scenes != 4; 0 paid requests');
    }
    const sceneIds = productionPlan.scenes.map((item) => item.sceneId);
    expect(new Set(sceneIds).size).toBe(4);
    expect(productionPlan.generationVersion.length).toBeGreaterThan(0);
    expect(productionPlan.scenes.every((item) => item.visualPrompt.length > 0)).toBe(true);
    const clientIds = productionPlan.scenes.map((item) =>
      visualClientRequestId(jobId, item.sceneId, productionPlan.generationVersion),
    );
    expect(new Set(clientIds).size).toBe(4);
    expect(clientIds).toEqual(
      productionPlan.scenes.map((item) => visualClientRequestId(jobId, item.sceneId, productionPlan.generationVersion)),
    );

    const originalFetch = globalThis.fetch.bind(globalThis);
    let wanxPosts = 0;
    let minimaxPosts = 0;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      const method = String(init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.includes('/services/aigc/multimodal-generation/generation')) {
        wanxPosts += 1;
        if (wanxPosts > 4) {
          throw new Error('STOP: Wanx generation POST exceeded 4');
        }
      }
      if (method === 'POST' && url.includes('t2a_v2')) {
        minimaxPosts += 1;
        if (minimaxPosts > 1) {
          throw new Error('STOP: MiniMax TTS request exceeded 1');
        }
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    let processResult: { status: string; reason?: string } | undefined;
    try {
      processResult = await app.get(JobProcessor).process(jobId);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const doneVideo = await prisma.video.findFirstOrThrow({ where: { id: videoId, tenantId } });
    const doneJob = await prisma.job.findFirstOrThrow({ where: { id: jobId, tenantId } });
    const publicVideo = await request(app.getHttpServer())
      .get(`/videos/${videoId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const output = (doneJob.output && typeof doneJob.output === 'object' ? doneJob.output : {}) as {
      stages?: {
        visual?: { status?: string; scenes?: VisualSceneCheckpoint[]; assetIds?: string[]; provider?: string; model?: string };
        voice?: { status?: string; assetIds?: string[]; provider?: string; model?: string; duration?: number };
        subtitle?: { status?: string; assetIds?: string[] };
        compose?: { status?: string; assetIds?: string[]; duration?: number };
      };
      usage?: {
        imageCount?: number;
        audioCharacters?: number;
        audioSeconds?: number;
        visual?: { imageCount?: number; provider?: string; model?: string };
      };
      currentStage?: string;
    };
    const scenes = output.stages?.visual?.scenes ?? [];
    const failedScenes = scenes.filter((item) => item.status === 'failed' || item.status === 'unknown_billing');
    const completedScenes = scenes.filter((item) => item.status === 'ready' || item.status === 'completed');
    const imageAssets = await prisma.asset.findMany({ where: { tenantId, type: 'IMAGE', deletedAt: null } });
    const sourceLinks = await prisma.assetLink.findMany({
      where: { tenantId, videoId, role: 'VIDEO_SOURCE' },
    });
    const outputLinks = await prisma.assetLink.findMany({
      where: { tenantId, videoId, role: 'VIDEO_OUTPUT' },
    });
    const voiceId = output.stages?.voice?.assetIds?.[0];
    const subtitleId = output.stages?.subtitle?.assetIds?.[0];
    const voiceAsset = voiceId
      ? await prisma.asset.findFirst({ where: { id: voiceId, tenantId } })
      : null;
    const subtitleAsset = subtitleId
      ? await prisma.asset.findFirst({ where: { id: subtitleId, tenantId } })
      : null;
    const outputAsset = doneVideo.outputAssetId
      ? await prisma.asset.findFirst({ where: { id: doneVideo.outputAssetId, tenantId } })
      : null;

    let subtitleCues = 0;
    let subtitleChinese = false;
    let subtitleExists = false;
    if (subtitleAsset?.storageKey) {
      subtitleExists = await storage.exists(subtitleAsset.storageKey);
      if (subtitleExists) {
        const srt = (await storage.get(subtitleAsset.storageKey)).toString('utf8');
        subtitleCues = countSrtCues(srt);
        subtitleChinese = hasCjk(srt);
      }
    }

    const imageExists = await Promise.all(imageAssets.map((item) => storage.exists(item.storageKey)));
    const audioExists = voiceAsset?.storageKey ? await storage.exists(voiceAsset.storageKey) : false;

    let probe: {
      exit: number | null;
      ffprobeExit: number | null;
      videoCodec?: string;
      audioCodec?: string;
      pixFmt?: string;
      width?: number;
      height?: number;
      fps?: number;
      duration?: number;
      hasVideo?: boolean;
      hasAudio?: boolean;
    } = { exit: null, ffprobeExit: null };
    let preservedBytes = 0;
    let preservedPath: string | null = null;
    if (outputAsset?.storageKey && (await storage.exists(outputAsset.storageKey))) {
      const body = await storage.get(outputAsset.storageKey);
      const tmpMp4 = path.join(process.env.MEDIA_STORAGE_ROOT!, 'real-visual-probe.mp4');
      writeFileSync(tmpMp4, body);
      mkdirSync(path.dirname(KEEP_MP4), { recursive: true });
      copyFileSync(tmpMp4, KEEP_MP4);
      preservedPath = KEEP_MP4;
      preservedBytes = statSync(KEEP_MP4).size;
      try {
        const probed = await runChildProcess(
          ffprobeBin(),
          ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', tmpMp4],
          { timeoutMs: 15_000 },
        );
        probe.ffprobeExit = 0;
        probe.exit = 0;
        const parsed = JSON.parse(probed.stdout || '{}') as {
          format?: { duration?: string };
          streams?: Array<{
            codec_type?: string;
            codec_name?: string;
            pix_fmt?: string;
            width?: number;
            height?: number;
            avg_frame_rate?: string;
          }>;
        };
        const videoStream = parsed.streams?.find((item) => item.codec_type === 'video');
        const audioStream = parsed.streams?.find((item) => item.codec_type === 'audio');
        const fpsRaw = videoStream?.avg_frame_rate ?? '';
        const [num, den] = String(fpsRaw).split('/').map(Number);
        probe = {
          ...probe,
          hasVideo: Boolean(videoStream),
          hasAudio: Boolean(audioStream),
          videoCodec: videoStream?.codec_name,
          audioCodec: audioStream?.codec_name,
          pixFmt: videoStream?.pix_fmt,
          width: videoStream?.width,
          height: videoStream?.height,
          fps: den ? num / den : Number(fpsRaw) || undefined,
          duration: Number(parsed.format?.duration),
        };
      } catch {
        probe.ffprobeExit = 1;
      }
    }

    const persisted = JSON.stringify({
      jobOutput: doneJob.output,
      jobError: doneJob.error,
      imageMeta: imageAssets.map((item) => item.metadata),
      voiceMeta: voiceAsset?.metadata,
      subtitleMeta: subtitleAsset?.metadata,
      outputMeta: outputAsset?.metadata,
    });
    const leaks = leakScan(persisted, secrets);
    const publicText = JSON.stringify(publicVideo.body);
    const publicStorageKey = publicText.includes('storageKey');
    const publicLeaks = leakScan(publicText, secrets);

    const unknownBilling = failedScenes.some((item) => item.status === 'unknown_billing') ||
      (doneJob.error && JSON.stringify(doneJob.error).includes('UNKNOWN_BILLING'));
    const report = {
      processResult,
      preflight,
      fixture: { targetDuration: 30, visualSceneCount: sceneCount },
      video: {
        id: doneVideo.id,
        status: doneVideo.status,
        duration: doneVideo.duration,
        outputAssetId: doneVideo.outputAssetId,
        sourceJobId: doneVideo.sourceJobId,
      },
      job: {
        id: doneJob.id,
        status: doneJob.status,
        progress: doneJob.progress,
        attempt: doneJob.attempt,
      },
      wanx: {
        provider: output.stages?.visual?.provider ?? 'wanx',
        model: output.stages?.visual?.model ?? wanxCfg.model,
        generationPostCount: wanxPosts,
        generationRetryCount: Math.max(0, wanxPosts - Math.max(scenes.filter((item) => item.submittedAt).length, completedScenes.length)),
        imageCount: imageAssets.length,
        completedScenes: completedScenes.length,
        failedScenes: failedScenes.map((item) => ({ sequence: item.sequence, status: item.status, code: item.error?.code })),
      },
      visualAssets: {
        count: imageAssets.length,
        readyCount: imageAssets.filter((item) => item.status === 'READY').length,
        videoSourceCount: sourceLinks.length,
        storageExists: imageExists.every(Boolean) && imageExists.length === imageAssets.length,
      },
      minimax: {
        requestCount: minimaxPosts,
        model: output.stages?.voice?.model ?? ttsCfg.model,
        characters: output.usage?.audioCharacters ?? 0,
        audioDuration: output.stages?.voice?.duration ?? voiceAsset?.duration ?? 0,
        audioAsset: voiceAsset
          ? { type: voiceAsset.type, status: voiceAsset.status, size: voiceAsset.size, exists: audioExists }
          : null,
      },
      subtitle: {
        cueCount: subtitleCues,
        ready: subtitleAsset?.status === 'READY',
        chinese: subtitleChinese,
        exists: subtitleExists,
      },
      ffmpeg: probe,
      finalMp4: { bytes: preservedBytes, path: preservedPath },
      finalize: {
        videoCompleted: doneVideo.status === 'COMPLETED',
        jobCompleted: doneJob.status === 'COMPLETED',
        videoOutputCount: outputLinks.length,
        pointerMatch:
          outputLinks.length === 1 && outputLinks[0]?.assetId === doneVideo.outputAssetId && doneVideo.sourceJobId === jobId,
      },
      usage: {
        visualImageCount: output.usage?.visual?.imageCount ?? output.usage?.imageCount ?? 0,
        ttsCharacters: output.usage?.audioCharacters ?? 0,
        ttsSeconds: output.usage?.audioSeconds ?? 0,
        llmCalls: 0,
      },
      security: {
        wanxKeyLeak: leaks.wanxKey || publicLeaks.wanxKey,
        minimaxKeyLeak: leaks.minimaxKey || publicLeaks.minimaxKey,
        authorizationLeak: leaks.authorization || publicLeaks.authorization,
        signedUrlPersisted: leaks.signedUrl,
        publicStorageKeyLeak: publicStorageKey,
      },
      scenes: scenes.map((item) => ({
        sequence: item.sequence,
        status: item.status,
        assetId: item.assetId ?? null,
        provider: item.provider,
        model: item.model,
        generationVersion: item.generationVersion,
        clientRequestId: item.clientRequestId,
      })),
      unknownBilling,
      publicHasStorageKey: publicStorageKey,
    };
    console.log('STEP75_RESULT', JSON.stringify(report));

    if (doneVideo.status !== 'COMPLETED' || doneJob.status !== 'COMPLETED') {
      console.log(
        'STEP75_FAIL_PAID',
        JSON.stringify({
          failedScene: failedScenes[0]?.sequence ?? output.currentStage,
          wanxPosts,
          minimaxPosts,
          failType: failedScenes[0]?.error?.code ?? doneJob.error,
          unknownBilling,
          reusableAssets: imageAssets.filter((item) => item.status === 'READY').map((item) => item.id),
        }),
      );
      throw new Error('STOP: paid pipeline failed; not rerunning');
    }

    expect(wanxPosts).toBe(4);
    expect(minimaxPosts).toBe(1);
    expect(imageAssets).toHaveLength(4);
    expect(imageAssets.every((item) => item.status === 'READY')).toBe(true);
    expect(sourceLinks).toHaveLength(4);
    expect(scenes).toHaveLength(4);
    expect(completedScenes).toHaveLength(4);
    expect(scenes.every((item) => item.provider === 'wanx')).toBe(true);
    expect(scenes.every((item) => item.model === 'wan2.6-t2i')).toBe(true);
    expect(scenes.every((item) => item.assetId)).toBe(true);
    expect(scenes.every((item) => item.clientRequestId)).toBe(true);
    expect(scenes.every((item) => item.generationVersion === productionPlan.generationVersion)).toBe(true);
    expect(voiceAsset?.type).toBe('AUDIO');
    expect(voiceAsset?.status).toBe('READY');
    expect(voiceAsset?.size ?? 0).toBeGreaterThan(0);
    expect(audioExists).toBe(true);
    expect(subtitleCues).toBeGreaterThan(0);
    expect(subtitleChinese).toBe(true);
    expect(subtitleExists).toBe(true);
    expect(probe.ffprobeExit).toBe(0);
    expect(probe.hasVideo).toBe(true);
    expect(probe.hasAudio).toBe(true);
    expect(probe.videoCodec).toBe('h264');
    expect(probe.audioCodec).toBe('aac');
    expect(probe.pixFmt).toBe('yuv420p');
    expect(probe.width).toBe(1080);
    expect(probe.height).toBe(1920);
    expect(probe.fps).toBe(30);
    expect(probe.duration ?? 0).toBeGreaterThan(0);
    expect(doneJob.progress).toBe(100);
    expect(outputLinks).toHaveLength(1);
    expect(outputAsset?.type).toBe('VIDEO');
    expect(outputAsset?.status).toBe('READY');
    expect(report.usage.visualImageCount).toBe(4);
    expect(report.usage.ttsCharacters).toBeGreaterThan(0);
    expect(report.usage.ttsSeconds).toBeGreaterThan(0);
    expect(report.security.wanxKeyLeak).toBe(false);
    expect(report.security.minimaxKeyLeak).toBe(false);
    expect(report.security.authorizationLeak).toBe(false);
    expect(report.security.signedUrlPersisted).toBe(false);
    expect(report.security.publicStorageKeyLeak).toBe(false);
    expect(preservedPath).toBe(KEEP_MP4);
    expect(preservedBytes).toBeGreaterThan(0);
  }, 900_000);
});
