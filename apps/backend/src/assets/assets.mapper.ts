import type { Asset } from '@prisma/client';

export type AssetPublic = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  type: string;
  status: string;
  originalFilename: string | null;
  mimeType: string | null;
  size: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  metadata: unknown;
  contentPath: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toPublicAsset(asset: Asset): AssetPublic {
  return {
    id: asset.id,
    tenantId: asset.tenantId,
    workspaceId: asset.workspaceId,
    projectId: asset.projectId,
    type: asset.type,
    status: asset.status,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    size: asset.size,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    metadata: asset.metadata,
    contentPath: `/assets/${asset.id}/content`,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}
