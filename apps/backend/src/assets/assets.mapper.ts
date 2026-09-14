import type { Asset } from '@prisma/client';
import {
  assetRightsLabel,
  assetSourceLabel,
  assetTypeLabel,
  toAssetLibraryView,
} from './asset-library.js';

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
  /** Additive library fields (optional for older clients). */
  sourceType?: string;
  sourceLabel?: string;
  ownerType?: string;
  referenceOnly?: boolean;
  reusable?: boolean;
  rightsStatus?: string;
  rightsLabel?: string;
  consentStatus?: string;
  libraryVisible?: boolean;
  usedCount?: number;
  lastUsedAt?: Date | null;
  typeLabel?: string;
};

export function toPublicAsset(asset: Asset): AssetPublic {
  const view = toAssetLibraryView(asset);
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
    sourceType: view.sourceType,
    sourceLabel: view.sourceLabel || assetSourceLabel(view.sourceType),
    ownerType: asset.ownerType,
    referenceOnly: view.referenceOnly,
    reusable: view.reusable,
    rightsStatus: view.rightsStatus,
    rightsLabel: view.rightsLabel || assetRightsLabel(view.rightsStatus),
    consentStatus: asset.consentStatus,
    libraryVisible: view.libraryVisible,
    usedCount: asset.usedCount,
    lastUsedAt: asset.lastUsedAt,
    typeLabel: assetTypeLabel(asset.type),
  };
}
