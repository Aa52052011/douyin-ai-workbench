import type { MarketSourceValue, NormalizedMarketItem } from './market.types.js';

export type MarketDataQuery = {
  tenantId: string;
  workspaceId: string;
  projectId: string;
  platform: string;
  seedKeywords?: string[];
  referenceCompetitors?: string[];
  maxItems?: number;
};

export type MarketDataBatch = {
  source: MarketSourceValue;
  collectedAt: string;
  items: NormalizedMarketItem[];
  warnings: string[];
};

export interface MarketDataProvider {
  readonly source: MarketSourceValue;
  query(query: MarketDataQuery): Promise<MarketDataBatch>;
}

export const MARKET_DATA_PROVIDER_REGISTRY = Symbol('MARKET_DATA_PROVIDER_REGISTRY');
