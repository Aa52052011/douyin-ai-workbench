import { createHash } from 'node:crypto';
import { AssetLinkRole, AssetStatus, AssetType, type Asset } from '@prisma/client';
import { metadataString } from './visual-reuse.js';
import type { StageContext } from './stage-context.js';

export function voiceTextFingerprint(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export async function isReusableVoiceAsset(ctx: StageContext, asset: Asset | null | undefined): Promise<boolean> {
  if (!asset || asset.deletedAt) {
    return false;
  }
  if (asset.type !== AssetType.AUDIO || asset.status !== AssetStatus.READY) {
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
  const storedHash = metadataString(asset.metadata, 'voiceTextHash');
  if (storedHash && storedHash !== voiceTextFingerprint(ctx.plan.voice.text)) {
    return false;
  }
  return ctx.storage.exists(asset.storageKey);
}

/**
 * Deterministic selection: newest READY VIDEO_AUDIO for this video whose
 * generationVersion (plan fingerprint) matches. Optional voiceTextHash when present.
 */
export async function findReusableVoiceAsset(ctx: StageContext): Promise<Asset | null> {
  const links = await ctx.prisma.assetLink.findMany({
    where: {
      tenantId: ctx.job.tenantId,
      workspaceId: ctx.job.workspaceId,
      projectId: ctx.job.projectId,
      videoId: ctx.plan.videoId,
      role: AssetLinkRole.VIDEO_AUDIO,
    },
    include: { asset: true },
    orderBy: { createdAt: 'desc' },
  });
  for (const link of links) {
    if (await isReusableVoiceAsset(ctx, link.asset)) {
      return link.asset;
    }
  }
  return null;
}
