import { randomUUID } from 'node:crypto';
import { AssetLinkRole, AssetStatus, AssetType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { ImageProvider } from '../../../media/providers/media-provider.types.js';
import type { ProductionScene, VideoProductionPlan, VisualSceneCheckpoint } from '../production-plan.types.js';
import type { StageContext } from '../stage-context.js';
import { VisualGenerationStage } from './visual.stage.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const VIDEO = '44444444-4444-4444-8444-444444444444';
const JOB = '55555555-5555-4555-8555-555555555555';
const GEN = 'gen-visual-1';

type StoredAsset = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  type: AssetType;
  status: AssetStatus;
  deletedAt: Date | null;
  storageKey: string;
  metadata: Record<string, unknown>;
  mimeType?: string;
};

type StoredLink = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  assetId: string;
  videoId: string;
  jobId: string;
  role: AssetLinkRole;
  sortOrder: number;
  createdAt: Date;
};

function scene(sequence: number): ProductionScene {
  return {
    sceneId: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa0${sequence}`,
    sourceSectionSequence: sequence,
    sourceKind: sequence === 1 ? 'hook' : 'section',
    sequence,
    narration: `旁白${sequence}`,
    subtitle: `字幕${sequence}`,
    visualSuggestion: `画面${sequence}`,
    visualIntent: `旁白${sequence}`,
    requiredEvidence: `画面${sequence}`,
    visualPrompt: `竖屏静帧 ${sequence}`,
    visualNegativePrompt: '字幕, 水印',
    visualSourceType: 'COLOR_BACKGROUND',
    durationBudget: 2,
    transition: 'cut',
  };
}

function plan(scenes = [1, 2, 3, 4, 5].map(scene)): VideoProductionPlan {
  return {
    version: 1,
    scriptId: '66666666-6666-4666-8666-666666666666',
    videoId: VIDEO,
    scriptVersion: 1,
    generationVersion: GEN,
    aspectRatio: '9:16',
    resolution: '1080x1920',
    fps: 30,
    targetDuration: 15,
    voice: { style: 'default', language: 'zh-CN', speed: 1, text: '旁白' },
    scenes,
    audio: { backgroundMusic: 'none', volume: 0.15 },
    subtitle: { style: 'default', position: 'bottom', format: 'srt' },
    output: { format: 'mp4', codec: 'h264' },
  };
}

function matches(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) {
    return true;
  }
  return Object.entries(where).every(([key, expected]) => {
    if (expected === null) {
      return row[key] == null;
    }
    return row[key] === expected;
  });
}

function createHarness(input?: { jobId?: string; output?: unknown; providerId?: string }) {
  const jobId = input?.jobId ?? JOB;
  const assets = new Map<string, StoredAsset>();
  const links: StoredLink[] = [];
  const existingKeys = new Set<string>();
  const job = {
    id: jobId,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    projectId: PROJECT,
    output: input?.output ?? {},
  };
  const generate = vi.fn(async (request: { storageKey: string; sceneId: string; clientRequestId: string }) => {
    existingKeys.add(request.storageKey);
    return {
      storageKey: request.storageKey,
      mimeType: 'image/png',
      size: 24,
      width: 1080,
      height: 1920,
      provider: 'color-background',
      model: 'color-background-v1',
    };
  });
  const images = { id: input?.providerId ?? 'color-background', generate } as unknown as ImageProvider;
  const prisma = {
    asset: {
      create: vi.fn(async ({ data }: { data: StoredAsset }) => {
        const row = { ...data, deletedAt: data.deletedAt ?? null };
        assets.set(row.id, row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return [...assets.values()].find((item) => matches(item as unknown as Record<string, unknown>, where)) ?? null;
      }),
    },
    assetLink: {
      create: vi.fn(async ({ data }: { data: Omit<StoredLink, 'id' | 'createdAt'> }) => {
        const row = { ...data, id: randomUUID(), createdAt: new Date() };
        links.push(row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return links.find((item) => matches(item as unknown as Record<string, unknown>, where)) ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return links
          .filter((item) => matches(item as unknown as Record<string, unknown>, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((item) => ({ ...item, asset: assets.get(item.assetId) }));
      }),
    },
  };
  const ctx = {
    prisma,
    jobs: {
      mergeOutput: vi.fn(async (_tenant: string, _id: string, output: unknown) => {
        job.output = output;
      }),
      getById: vi.fn(async () => job),
    },
    storage: {
      exists: vi.fn(async (key: string) => existingKeys.has(key)),
      delete: vi.fn(async (key: string) => {
        existingKeys.delete(key);
      }),
    },
    job,
    plan: plan(),
    generationVersion: GEN,
  } as unknown as StageContext;
  return { ctx, images, generate, assets, links, existingKeys, job, prisma };
}

describe('VisualGenerationStage', () => {
  it('completes five scenes with scene-level checkpoints', async () => {
    const { ctx, images, generate, assets, links, job } = createHarness();
    const ids = await new VisualGenerationStage(images).run(ctx);
    expect(ids).toHaveLength(5);
    expect(generate).toHaveBeenCalledTimes(5);
    expect(assets.size).toBe(5);
    expect(links).toHaveLength(5);
    expect(links.every((item) => item.role === AssetLinkRole.VIDEO_SOURCE)).toBe(true);
    const visual = (job.output as { stages: { visual: { status: string; assetIds: string[]; scenes: VisualSceneCheckpoint[] } } })
      .stages.visual;
    expect(visual.status).toBe('completed');
    expect(visual.assetIds).toEqual(ids);
    expect(visual.scenes).toHaveLength(5);
    expect(visual.scenes.every((item) => item.status === 'ready')).toBe(true);
    expect(visual.scenes[0]?.clientRequestId).toBe(`${JOB}:visual:${ctx.plan.scenes[0]?.sceneId}:${GEN}`);
    expect(visual.scenes[0]?.status).toBe('ready');
    expect(visual.scenes[0]?.submittedAt).toBeTruthy();
    expect((job.output as { usage: { visual?: { provider: string; imageCount: number } } }).usage.visual).toMatchObject({
      provider: 'color-background',
      imageCount: 5,
    });
    const created = [...assets.values()][0];
    expect(created?.type).toBe(AssetType.IMAGE);
    expect(created?.status).toBe(AssetStatus.READY);
    expect(created?.metadata).toMatchObject({
      sceneId: ctx.plan.scenes[0]?.sceneId,
      generationVersion: GEN,
      provider: 'color-background',
      promptVersion: 'v2',
    });
    expect(created?.metadata).not.toHaveProperty('prompt');
    expect(JSON.stringify(created?.metadata)).not.toContain('Authorization');
    expect(JSON.stringify(job.output)).not.toContain(ctx.plan.scenes[0]?.visualPrompt);
  });

  it('checkpoints scenes 1-3 then skips them after scene 4 fails', async () => {
    const harness = createHarness();
    harness.ctx.failVisualAfter = 3;
    await expect(new VisualGenerationStage(harness.images).run(harness.ctx)).rejects.toMatchObject({
      code: 'VIDEO_PROVIDER_FAILED',
    });
    expect(harness.generate).toHaveBeenCalledTimes(3);
    const visual = (harness.job.output as { stages: { visual: { assetIds: string[]; scenes: VisualSceneCheckpoint[] } } })
      .stages.visual;
    expect(visual.assetIds).toHaveLength(3);
    expect(visual.scenes.filter((item) => item.status === 'ready')).toHaveLength(3);
    expect(visual.scenes.find((item) => item.sequence === 4)?.status).toBe('failed');

    harness.ctx.failVisualAfter = undefined;
    const ids = await new VisualGenerationStage(harness.images).run(harness.ctx);
    expect(ids).toHaveLength(5);
    expect(harness.generate).toHaveBeenCalledTimes(5);
    expect(ids.slice(0, 3)).toEqual(visual.assetIds);
  });

  it('regenerates only the scene whose storage is missing', async () => {
    const harness = createHarness();
    const first = await new VisualGenerationStage(harness.images).run(harness.ctx);
    const secondAsset = [...harness.assets.values()].find(
      (item) => item.metadata.sceneId === harness.ctx.plan.scenes[1]?.sceneId,
    );
    harness.existingKeys.delete(secondAsset!.storageKey);
    const second = await new VisualGenerationStage(harness.images).run(harness.ctx);
    expect(harness.generate).toHaveBeenCalledTimes(6);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect(second[2]).toBe(first[2]);
  });

  it('regenerates only the FAILED scene', async () => {
    const harness = createHarness();
    const first = await new VisualGenerationStage(harness.images).run(harness.ctx);
    const failed = [...harness.assets.values()].find(
      (item) => item.metadata.sceneId === harness.ctx.plan.scenes[1]?.sceneId,
    )!;
    failed.status = AssetStatus.FAILED;
    const second = await new VisualGenerationStage(harness.images).run(harness.ctx);
    expect(harness.generate).toHaveBeenCalledTimes(6);
    expect(second[1]).not.toBe(first[1]);
    expect(second[0]).toBe(first[0]);
  });

  it('reuses VIDEO_SOURCE assets across jobs when checkpoint is missing', async () => {
    const first = createHarness();
    const ids = await new VisualGenerationStage(first.images).run(first.ctx);
    const retry = createHarness({ jobId: '77777777-7777-4777-8777-777777777777', output: {} });
    retry.assets = first.assets;
    retry.links.push(...first.links);
    retry.existingKeys = first.existingKeys;
    retry.ctx.storage.exists = vi.fn(async (key: string) => first.existingKeys.has(key));
    retry.prisma.asset.findFirst = first.prisma.asset.findFirst;
    retry.prisma.asset.create = first.prisma.asset.create;
    retry.prisma.assetLink.findMany = first.prisma.assetLink.findMany;
    retry.prisma.assetLink.findFirst = first.prisma.assetLink.findFirst;
    retry.prisma.assetLink.create = first.prisma.assetLink.create;
    const reused = await new VisualGenerationStage(retry.images).run(retry.ctx);
    expect(retry.generate).not.toHaveBeenCalled();
    expect(reused).toEqual(ids);
  });

  it('does not reuse a VIDEO_SOURCE whose metadata sceneId does not match', async () => {
    const first = createHarness();
    await new VisualGenerationStage(first.images).run(first.ctx);
    for (const asset of first.assets.values()) {
      asset.metadata = { ...asset.metadata, sceneId: '99999999-9999-4999-8999-999999999999' };
    }
    const retry = createHarness({ jobId: '88888888-8888-4888-8888-888888888888' });
    retry.ctx.storage.exists = vi.fn(async (key: string) => first.existingKeys.has(key));
    retry.prisma.asset.findFirst = first.prisma.asset.findFirst;
    retry.prisma.assetLink.findMany = vi.fn(async () =>
      first.links.map((item) => ({ ...item, asset: first.assets.get(item.assetId) })),
    );
    await new VisualGenerationStage(retry.images).run(retry.ctx);
    expect(retry.generate).toHaveBeenCalledTimes(5);
  });

  it('does not reuse a VIDEO_SOURCE whose generationVersion does not match', async () => {
    const first = createHarness();
    await new VisualGenerationStage(first.images).run(first.ctx);
    for (const asset of first.assets.values()) {
      asset.metadata = { ...asset.metadata, generationVersion: 'other-gen' };
    }
    const retry = createHarness({ jobId: '99999999-9999-4999-8999-999999999999' });
    retry.ctx.storage.exists = vi.fn(async (key: string) => first.existingKeys.has(key));
    retry.prisma.asset.findFirst = first.prisma.asset.findFirst;
    retry.prisma.assetLink.findMany = vi.fn(async () =>
      first.links.map((item) => ({ ...item, asset: first.assets.get(item.assetId) })),
    );
    await new VisualGenerationStage(retry.images).run(retry.ctx);
    expect(retry.generate).toHaveBeenCalledTimes(5);
  });
});

describe('VisualGenerationStage paid wanx freeze', () => {
  it('does not resubmit a wanx scene left in submitting', async () => {
    const harness = createHarness({ providerId: 'wanx' });
    harness.ctx.job.output = {
      stages: {
        visual: {
          status: 'running',
          assetIds: [],
          scenes: [
            {
              sceneId: harness.ctx.plan.scenes[0]?.sceneId,
              sequence: 1,
              status: 'submitting',
              clientRequestId: `${JOB}:visual:${harness.ctx.plan.scenes[0]?.sceneId}:${GEN}`,
              generationVersion: GEN,
              provider: 'wanx',
              model: 'wan2.6-t2i',
              submittedAt: new Date().toISOString(),
            },
          ],
        },
      },
    };
    await expect(new VisualGenerationStage(harness.images).run(harness.ctx)).rejects.toMatchObject({
      code: 'VISUAL_PROVIDER_UNKNOWN_BILLING',
    });
    expect(harness.generate).not.toHaveBeenCalled();
    const visual = (harness.job.output as { stages: { visual: { scenes: VisualSceneCheckpoint[] } } }).stages.visual;
    expect(visual.scenes[0]?.status).toBe('unknown_billing');
  });

  it('does not resubmit a wanx unknown_billing scene', async () => {
    const harness = createHarness({ providerId: 'wanx' });
    harness.ctx.job.output = {
      stages: {
        visual: {
          status: 'failed',
          assetIds: [],
          scenes: [
            {
              sceneId: harness.ctx.plan.scenes[0]?.sceneId,
              sequence: 1,
              status: 'unknown_billing',
              clientRequestId: `${JOB}:visual:${harness.ctx.plan.scenes[0]?.sceneId}:${GEN}`,
              generationVersion: GEN,
              provider: 'wanx',
              model: 'wan2.6-t2i',
              error: { code: 'VISUAL_PROVIDER_UNKNOWN_BILLING' },
            },
          ],
        },
      },
    };
    await expect(new VisualGenerationStage(harness.images).run(harness.ctx)).rejects.toMatchObject({
      code: 'VISUAL_PROVIDER_UNKNOWN_BILLING',
    });
    expect(harness.generate).not.toHaveBeenCalled();
  });

  it('still retries a local submitting scene', async () => {
    const harness = createHarness();
    harness.ctx.job.output = {
      stages: {
        visual: {
          status: 'running',
          assetIds: [],
          scenes: [
            {
              sceneId: harness.ctx.plan.scenes[0]?.sceneId,
              sequence: 1,
              status: 'submitting',
              clientRequestId: `${JOB}:visual:${harness.ctx.plan.scenes[0]?.sceneId}:${GEN}`,
              generationVersion: GEN,
              provider: 'color-background',
            },
          ],
        },
      },
    };
    const ids = await new VisualGenerationStage(harness.images).run(harness.ctx);
    expect(ids).toHaveLength(5);
    expect(harness.generate).toHaveBeenCalledTimes(5);
  });
});
