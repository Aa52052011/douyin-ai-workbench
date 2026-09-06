import type { CampaignStrategy } from '@prisma/client';
import type { CampaignStrategyInputSnapshot, CampaignStrategyOutputV1 } from './campaign-strategy.types.js';

export type CampaignStrategyPublic = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  version: number;
  status: string;
  productBriefId: string | null;
  marketResearchId: string | null;
  marketInsightId: string | null;
  positioningRunId: string;
  payload: CampaignStrategyOutputV1 | Record<string, never>;
  inputSnapshot: CampaignStrategyInputSnapshot | Record<string, never>;
  sourceAgentRunId: string | null;
  createdAt: Date;
};

export function toPublicCampaignStrategy(row: CampaignStrategy): CampaignStrategyPublic {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    version: row.version,
    status: row.status,
    productBriefId: row.productBriefId,
    marketResearchId: row.marketResearchId,
    marketInsightId: row.marketInsightId,
    positioningRunId: row.positioningRunId,
    payload: row.payload as CampaignStrategyPublic['payload'],
    inputSnapshot: row.inputSnapshot as CampaignStrategyPublic['inputSnapshot'],
    sourceAgentRunId: row.sourceAgentRunId,
    createdAt: row.createdAt,
  };
}
