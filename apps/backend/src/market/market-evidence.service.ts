import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { buildMarketEvidence } from './market-evidence.builder.js';
import type { MarketEvidence } from './market-evidence.types.js';
import { buildMarketDataQuality } from './market-data-quality.js';
import { buildMarketSampleStats } from './market-sample-stats.js';
import type {
  MarketDataQuality,
  MarketSampleStats,
  NormalizedAudienceSignalItem,
  NormalizedCompetitorItem,
  NormalizedContentItem,
  NormalizedKeywordItem,
  NormalizedMarketItem,
  NormalizedTrendItem,
  ProductBriefPayload,
} from './market.types.js';

@Injectable()
export class MarketEvidenceService {
  constructor(private readonly prisma: PrismaClient) {}

  async getForResearch(auth: AuthContext, id: string, workspaceHint?: string): Promise<MarketEvidence> {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.MARKET_RESEARCH_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const row = await this.prisma.marketResearch.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId },
      include: { snapshot: true },
    });
    if (!row) {
      throw new AppError(ErrorCode.MARKET_RESEARCH_NOT_FOUND);
    }
    const snapshot = row.snapshot;
    const keywords = ofKind<NormalizedKeywordItem>(snapshot?.keywords, 'KEYWORD');
    const contents = ofKind<NormalizedContentItem>(snapshot?.contents, 'CONTENT');
    const competitors = ofKind<NormalizedCompetitorItem>(snapshot?.competitors, 'COMPETITOR');
    const trends = ofKind<NormalizedTrendItem>(snapshot?.trends, 'TREND');
    const audienceSignals = ofKind<NormalizedAudienceSignalItem>(snapshot?.audienceSignals, 'AUDIENCE_SIGNAL');
    const items = [...keywords, ...contents, ...competitors, ...trends, ...audienceSignals];
    const dataQuality = (snapshot?.dataQuality as MarketDataQuality | undefined) ?? buildMarketDataQuality({ items, duplicateCount: 0 });
    const sampleStats = (snapshot?.sampleStats as MarketSampleStats | undefined) ?? buildMarketSampleStats(items);
    return buildMarketEvidence({
      marketResearchId: row.id,
      marketResearchVersion: row.version,
      snapshotId: snapshot?.id ?? row.id,
      productBriefSnapshot: row.productBriefSnapshot as ProductBriefPayload,
      queryContext: row.queryContext,
      dataQuality,
      sampleStats,
      keywords,
      contents,
      competitors,
      trends,
      audienceSignals,
    });
  }
}

function ofKind<T extends NormalizedMarketItem>(value: unknown, kind: T['kind']): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is T => Boolean(item && typeof item === 'object' && (item as { kind?: string }).kind === kind));
}
