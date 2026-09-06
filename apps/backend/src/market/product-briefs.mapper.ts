import type { ProductBrief } from '@prisma/client';
import type { ProductBriefPayload } from './market.types.js';

export type ProductBriefPublic = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  version: number;
  payload: ProductBriefPayload;
  createdAt: Date;
  updatedAt: Date;
};

export function toPublicProductBrief(row: ProductBrief): ProductBriefPublic {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    version: row.version,
    payload: row.payload as ProductBriefPayload,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
