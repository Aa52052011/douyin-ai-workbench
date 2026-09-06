import { AssetStatus } from '@prisma/client';
import type { StageContext } from './stage-context.js';

export async function reusableAssetIds(ctx: StageContext, assetIds: string[] | undefined): Promise<string[] | null> {
  if (!assetIds?.length) {
    return null;
  }
  const reused: string[] = [];
  for (const id of assetIds) {
    const asset = await ctx.prisma.asset.findFirst({
      where: { id, tenantId: ctx.job.tenantId, deletedAt: null, status: AssetStatus.READY },
    });
    if (!asset) {
      return null;
    }
    if (!(await ctx.storage.exists(asset.storageKey))) {
      return null;
    }
    reused.push(asset.id);
  }
  return reused;
}
