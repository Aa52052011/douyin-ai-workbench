import { AssetLinkRole, AssetStatus, AssetType, type Asset } from '@prisma/client';
import type { ProductionScene, VisualSceneCheckpoint } from './production-plan.types.js';
import type { StageContext } from './stage-context.js';

export function visualClientRequestId(jobId: string, sceneId: string, generationVersion: string): string {
  return `${jobId}:visual:${sceneId}:${generationVersion}`;
}

export function isReusableSceneStatus(status: VisualSceneCheckpoint['status'] | undefined): boolean {
  return status === 'ready' || status === 'completed';
}

export function metadataString(metadata: unknown, key: string): string | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

export function metadataNumber(metadata: unknown, key: string): number | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export async function isReusableVisualAsset(
  ctx: StageContext,
  asset: Asset | null | undefined,
  scene: ProductionScene,
): Promise<boolean> {
  if (!asset) {
    return false;
  }
  if (asset.deletedAt) {
    return false;
  }
  if (asset.type !== AssetType.IMAGE || asset.status !== AssetStatus.READY) {
    return false;
  }
  if (asset.tenantId !== ctx.job.tenantId) {
    return false;
  }
  if (asset.workspaceId !== ctx.job.workspaceId) {
    return false;
  }
  if (asset.projectId !== ctx.job.projectId) {
    return false;
  }
  if (metadataString(asset.metadata, 'videoId') !== ctx.plan.videoId) {
    return false;
  }
  if (metadataString(asset.metadata, 'sceneId') !== scene.sceneId) {
    return false;
  }
  if (metadataString(asset.metadata, 'generationVersion') !== ctx.generationVersion) {
    return false;
  }
  return ctx.storage.exists(asset.storageKey);
}

export async function findReusableVisualAsset(
  ctx: StageContext,
  scene: ProductionScene,
  checkpoint: VisualSceneCheckpoint | undefined,
): Promise<Asset | null> {
  if (checkpoint?.assetId && isReusableSceneStatus(checkpoint.status)) {
    const fromCheckpoint = await ctx.prisma.asset.findFirst({
      where: {
        id: checkpoint.assetId,
        tenantId: ctx.job.tenantId,
        workspaceId: ctx.job.workspaceId,
        projectId: ctx.job.projectId,
        deletedAt: null,
      },
    });
    if (await isReusableVisualAsset(ctx, fromCheckpoint, scene)) {
      return fromCheckpoint;
    }
  }
  const links = await ctx.prisma.assetLink.findMany({
    where: {
      tenantId: ctx.job.tenantId,
      workspaceId: ctx.job.workspaceId,
      projectId: ctx.job.projectId,
      videoId: ctx.plan.videoId,
      role: AssetLinkRole.VIDEO_SOURCE,
    },
    include: { asset: true },
    orderBy: { createdAt: 'desc' },
  });
  for (const link of links) {
    if (await isReusableVisualAsset(ctx, link.asset, scene)) {
      return link.asset;
    }
  }
  return null;
}
