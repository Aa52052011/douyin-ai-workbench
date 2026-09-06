import type { MarketInsight } from '@prisma/client';
import type { MarketInsightOutputV1 } from '../agents/definitions/market-intelligence.types.js';

export type MarketInsightPublic = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  marketResearchId: string;
  version: number;
  payload: MarketInsightOutputV1;
  sourceAgentRunId: string | null;
  createdAt: Date;
};

export function toPublicMarketInsight(row: MarketInsight): MarketInsightPublic {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    marketResearchId: row.marketResearchId,
    version: row.version,
    payload: row.payload as MarketInsightOutputV1,
    sourceAgentRunId: row.sourceAgentRunId,
    createdAt: row.createdAt,
  };
}
