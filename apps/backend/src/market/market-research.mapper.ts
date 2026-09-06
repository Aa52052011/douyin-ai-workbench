import type { MarketResearch, MarketResearchSnapshot } from '@prisma/client';
import type { MarketDataQuality, MarketSampleStats, NormalizedMarketItem, ProductBriefPayload } from './market.types.js';

export type MarketResearchPublic = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  version: number;
  status: string;
  productBriefId: string | null;
  productBriefSnapshot: ProductBriefPayload;
  queryContext: unknown;
  sourceAgentRunId: string | null;
  sourceJobId: string | null;
  createdAt: Date;
  updatedAt: Date;
  snapshot?: MarketResearchSnapshotPublic;
};

export type MarketResearchSnapshotPublic = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  marketResearchId: string;
  collectedAt: Date;
  timeWindow: unknown;
  sources: unknown;
  keywords: NormalizedMarketItem[];
  contents: NormalizedMarketItem[];
  competitors: NormalizedMarketItem[];
  trends: NormalizedMarketItem[];
  audienceSignals: NormalizedMarketItem[];
  sampleStats: MarketSampleStats;
  dataQuality: MarketDataQuality;
  createdAt: Date;
};

export function toPublicMarketResearch(
  row: MarketResearch,
  snapshot?: MarketResearchSnapshot | null,
): MarketResearchPublic {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    version: row.version,
    status: row.status,
    productBriefId: row.productBriefId,
    productBriefSnapshot: row.productBriefSnapshot as ProductBriefPayload,
    queryContext: row.queryContext,
    sourceAgentRunId: row.sourceAgentRunId,
    sourceJobId: row.sourceJobId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(snapshot ? { snapshot: toPublicMarketSnapshot(snapshot) } : {}),
  };
}

export function toPublicMarketSnapshot(row: MarketResearchSnapshot): MarketResearchSnapshotPublic {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    marketResearchId: row.marketResearchId,
    collectedAt: row.collectedAt,
    timeWindow: row.timeWindow,
    sources: row.sources,
    keywords: row.keywords as NormalizedMarketItem[],
    contents: row.contents as NormalizedMarketItem[],
    competitors: row.competitors as NormalizedMarketItem[],
    trends: row.trends as NormalizedMarketItem[],
    audienceSignals: row.audienceSignals as NormalizedMarketItem[],
    sampleStats: row.sampleStats as MarketSampleStats,
    dataQuality: row.dataQuality as MarketDataQuality,
    createdAt: row.createdAt,
  };
}
