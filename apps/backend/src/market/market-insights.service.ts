import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AgentsService } from '../agents/agent.service.js';
import {
  MARKET_INTELLIGENCE_AGENT_ID,
  MARKET_INTELLIGENCE_AGENT_VERSION,
  type AgentRunPublic,
} from '../agents/agent.types.js';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { MarketEvidenceService } from './market-evidence.service.js';
import { toPublicMarketInsight, type MarketInsightPublic } from './market-insights.mapper.js';
import type { ProductBriefPayload } from './market.types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export type MarketInsightCreateResult = {
  insight: MarketInsightPublic;
  run: AgentRunPublic;
};

@Injectable()
export class MarketInsightsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly agents: AgentsService,
    private readonly evidence: MarketEvidenceService,
  ) {}

  async list(auth: AuthContext, marketResearchId: string, workspaceHint?: string): Promise<MarketInsightPublic[]> {
    const research = await this.requireResearch(auth, marketResearchId, workspaceHint);
    const rows = await this.prisma.marketInsight.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId: research.workspaceId,
        marketResearchId: research.id,
      },
      orderBy: { version: 'desc' },
    });
    return rows.map(toPublicMarketInsight);
  }

  async getById(auth: AuthContext, id: string, workspaceHint?: string): Promise<MarketInsightPublic> {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.MARKET_INSIGHT_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const row = await this.prisma.marketInsight.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId },
    });
    if (!row) {
      throw new AppError(ErrorCode.MARKET_INSIGHT_NOT_FOUND);
    }
    return toPublicMarketInsight(row);
  }

  async getLatest(auth: AuthContext, marketResearchId: string, workspaceHint?: string): Promise<MarketInsightPublic> {
    const items = await this.list(auth, marketResearchId, workspaceHint);
    if (items.length === 0) {
      throw new AppError(ErrorCode.MARKET_INSIGHT_NOT_FOUND);
    }
    return items[0];
  }

  async create(
    auth: AuthContext,
    marketResearchId: string,
    input: { userFocus?: string },
    meta: { requestId: string; locale?: string; workspaceHint?: string; idempotencyKey?: string },
  ): Promise<MarketInsightCreateResult> {
    const research = await this.requireResearch(auth, marketResearchId, meta.workspaceHint);
    if (meta.idempotencyKey) {
      const existing = await this.prisma.marketInsight.findFirst({
        where: {
          tenantId: auth.tenantId,
          marketResearchId: research.id,
          idempotencyKey: meta.idempotencyKey,
        },
      });
      if (existing?.sourceAgentRunId) {
        const run = await this.agents.getRun(auth, existing.sourceAgentRunId, meta.workspaceHint);
        return { insight: toPublicMarketInsight(existing), run };
      }
    }

    const marketEvidence = await this.evidence.getForResearch(auth, research.id, meta.workspaceHint);
    const queryContext =
      research.queryContext && typeof research.queryContext === 'object'
        ? (research.queryContext as Record<string, unknown>)
        : {};
    const agentInput = {
      productBrief: research.productBriefSnapshot as ProductBriefPayload,
      marketEvidence,
      ...(isRecord(queryContext.normalizedMarketContext)
        ? { normalizedMarketContext: queryContext.normalizedMarketContext }
        : {}),
      ...(input.userFocus?.trim() ? { userFocus: input.userFocus.trim() } : {}),
    };

    const run = await this.agents.execute(
      auth,
      {
        agentId: MARKET_INTELLIGENCE_AGENT_ID,
        agentVersion: MARKET_INTELLIGENCE_AGENT_VERSION,
        projectId: research.projectId,
        input: agentInput,
      },
      { requestId: meta.requestId, locale: meta.locale, workspaceHint: meta.workspaceHint },
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const created = await this.prisma.$transaction(
          async (tx) => {
            const last = await tx.marketInsight.findFirst({
              where: { tenantId: auth.tenantId, marketResearchId: research.id },
              orderBy: { version: 'desc' },
              select: { version: true },
            });
            return tx.marketInsight.create({
              data: {
                tenantId: auth.tenantId,
                workspaceId: research.workspaceId,
                projectId: research.projectId,
                marketResearchId: research.id,
                version: (last?.version ?? 0) + 1,
                payload: run.output as Prisma.InputJsonValue,
                sourceAgentRunId: run.id,
                idempotencyKey: meta.idempotencyKey ?? null,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return { insight: toPublicMarketInsight(created), run };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2034') &&
          attempt < 4
        ) {
          if (meta.idempotencyKey) {
            const raced = await this.prisma.marketInsight.findFirst({
              where: {
                tenantId: auth.tenantId,
                marketResearchId: research.id,
                idempotencyKey: meta.idempotencyKey,
              },
            });
            if (raced?.sourceAgentRunId) {
              const existingRun = await this.agents.getRun(auth, raced.sourceAgentRunId, meta.workspaceHint);
              return { insight: toPublicMarketInsight(raced), run: existingRun };
            }
          }
          continue;
        }
        throw error;
      }
    }
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Unable to allocate market insight version');
  }

  private async requireResearch(auth: AuthContext, id: string, workspaceHint?: string) {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.MARKET_RESEARCH_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const row = await this.prisma.marketResearch.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId },
      select: {
        id: true,
        workspaceId: true,
        projectId: true,
        productBriefSnapshot: true,
        queryContext: true,
      },
    });
    if (!row) {
      throw new AppError(ErrorCode.MARKET_RESEARCH_NOT_FOUND);
    }
    return row;
  }
}
