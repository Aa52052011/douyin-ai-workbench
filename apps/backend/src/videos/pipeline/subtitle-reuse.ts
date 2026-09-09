import { AssetLinkRole, AssetStatus, AssetType, type Asset } from '@prisma/client';
import { metadataNumber, metadataString } from './visual-reuse.js';
import type { StageContext } from './stage-context.js';

export async function isReusableSubtitleAsset(
  ctx: StageContext,
  asset: Asset | null | undefined,
  voice: { assetId: string; durationExact: number },
): Promise<boolean> {
  if (!asset || asset.deletedAt) {
    return false;
  }
  if (asset.type !== AssetType.SUBTITLE || asset.status !== AssetStatus.READY) {
    return false;
  }
  if (asset.tenantId !== ctx.job.tenantId) {
    return false;
  }
  if (asset.workspaceId !== ctx.job.workspaceId || asset.projectId !== ctx.job.projectId) {
    return false;
  }
  if (metadataString(asset.metadata, 'videoId') !== ctx.plan.videoId) {
    return false;
  }
  if (metadataString(asset.metadata, 'generationVersion') !== ctx.generationVersion) {
    return false;
  }
  const boundVoice = metadataString(asset.metadata, 'voiceAssetId');
  if (boundVoice && boundVoice !== voice.assetId) {
    return false;
  }
  const boundDuration = metadataNumber(asset.metadata, 'voiceDurationExact');
  if (boundDuration != null && Math.abs(boundDuration - voice.durationExact) > 0.05) {
    return false;
  }
  return ctx.storage.exists(asset.storageKey);
}

/**
 * Prefer newest READY subtitle for this video matching generationVersion and
 * (when present) the reused voice asset / duration fingerprint.
 */
export async function findReusableSubtitleAsset(
  ctx: StageContext,
  voice: { assetId: string; durationExact: number },
): Promise<Asset | null> {
  const links = await ctx.prisma.assetLink.findMany({
    where: {
      tenantId: ctx.job.tenantId,
      workspaceId: ctx.job.workspaceId,
      projectId: ctx.job.projectId,
      videoId: ctx.plan.videoId,
      role: AssetLinkRole.VIDEO_SUBTITLE,
    },
    include: { asset: true },
    orderBy: { createdAt: 'desc' },
  });
  for (const link of links) {
    if (await isReusableSubtitleAsset(ctx, link.asset, voice)) {
      return link.asset;
    }
  }
  return null;
}
