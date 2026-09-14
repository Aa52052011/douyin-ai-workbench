import { Injectable, Optional } from '@nestjs/common';
import { MarketResearchStatus, Prisma, PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { buildMarketDataQuality } from './market-data-quality.js';
import { normalizeMarketItems } from './market-normalizer.js';
import { buildMarketSampleStats } from './market-sample-stats.js';
import {
  buildMarketResearchContext,
  isMarketSourceRole,
  isMarketSourceType,
  type MarketSourceDraftEntry,
  type MarketSourceProvenance,
} from './market-source.js';
import type { NormalizedMarketItem } from './market.types.js';
import {
  toPublicMarketResearch,
  type MarketResearchPublic,
} from './market-research.mapper.js';
import { ProductBriefsService } from './product-briefs.service.js';
import { AutonomousResearchService } from '../research/autonomous-research.service.js';

export type MarketResearchPreviewPublic = {
  productBriefId: string;
  productBriefSnapshot: unknown;
  collectedAt: string;
  items: NormalizedMarketItem[];
  warnings: string[];
  duplicateCount: number;
  sampleStats: ReturnType<typeof buildMarketSampleStats>;
  dataQuality: ReturnType<typeof buildMarketDataQuality>;
};

@Injectable()
export class MarketResearchService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly briefs: ProductBriefsService,
    @Optional() private readonly autonomousResearch?: AutonomousResearchService,
  ) {}

  async preview(
    auth: AuthContext,
    projectId: string,
    input: { productBriefId?: string; collectedAt: string; items: unknown[]; timeWindow?: Record<string, unknown> },
    workspaceHint?: string,
  ): Promise<MarketResearchPreviewPublic> {
    await this.requireProject(auth, projectId, workspaceHint);
    const brief = await this.briefs.requireCurrentPayload(auth, projectId, input.productBriefId, workspaceHint);
    const normalized = normalizeMarketItems({ items: input.items, collectedAt: input.collectedAt });
    return {
      productBriefId: brief.id,
      productBriefSnapshot: brief.payload,
      collectedAt: new Date(input.collectedAt).toISOString(),
      items: normalized.items,
      warnings: normalized.warnings,
      duplicateCount: normalized.duplicateCount,
      sampleStats: buildMarketSampleStats(normalized.items),
      dataQuality: buildMarketDataQuality({
        items: normalized.items,
        duplicateCount: normalized.duplicateCount,
      }),
    };
  }

  async confirm(
    auth: AuthContext,
    projectId: string,
    input: {
      productBriefId?: string;
      collectedAt: string;
      items: unknown[];
      timeWindow?: Record<string, unknown>;
      intakeSources?: unknown[];
      researchRequested?: boolean;
    },
    workspaceHint?: string,
  ): Promise<MarketResearchPublic> {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const brief = await this.briefs.requireCurrentPayload(auth, projectId, input.productBriefId, workspaceHint);
    const normalized = normalizeMarketItems({ items: input.items, collectedAt: input.collectedAt });
    const sampleStats = buildMarketSampleStats(normalized.items);
    const dataQuality = buildMarketDataQuality({
      items: normalized.items,
      duplicateCount: normalized.duplicateCount,
    });
    const collectedAt = new Date(input.collectedAt);
    const buckets = bucketItems(normalized.items);
    const sources = [...new Set(normalized.items.map((item) => item.source))];
    const intakeSources = sanitizeIntakeSources(input.intakeSources);
    // PRODUCTION_ASSET never enters MarketResearch.
    const marketIntakeSources = intakeSources.filter((row) => row.role !== 'PRODUCTION_ASSET');
    const normalizedContext = buildMarketResearchContext({
      sources: marketIntakeSources,
      researchRequested: Boolean(input.researchRequested),
      userAcknowledgedLimitedData: normalized.items.length === 0,
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const created = await this.prisma.$transaction(
          async (tx) => {
            const last = await tx.marketResearch.findFirst({
              where: { tenantId: auth.tenantId, projectId: project.id },
              orderBy: { version: 'desc' },
              select: { version: true },
            });
            const research = await tx.marketResearch.create({
              data: {
                tenantId: auth.tenantId,
                workspaceId: project.workspaceId,
                projectId: project.id,
                version: (last?.version ?? 0) + 1,
                status: MarketResearchStatus.READY,
                productBriefId: brief.id,
                productBriefSnapshot: brief.payload as Prisma.InputJsonValue,
                queryContext: {
                  source: 'MANUAL',
                  collectedAt: collectedAt.toISOString(),
                  itemCount: normalized.items.length,
                  duplicateCount: normalized.duplicateCount,
                  researchRequested: Boolean(input.researchRequested),
                  intakeSources: marketIntakeSources,
                  normalizedMarketContext: normalizedContext,
                } as Prisma.InputJsonValue,
                sourceAgentRunId: null,
                sourceJobId: null,
              },
            });
            const snapshot = await tx.marketResearchSnapshot.create({
              data: {
                tenantId: auth.tenantId,
                workspaceId: project.workspaceId,
                projectId: project.id,
                marketResearchId: research.id,
                collectedAt,
                timeWindow: (input.timeWindow ?? undefined) as Prisma.InputJsonValue | undefined,
                sources: sources as Prisma.InputJsonValue,
                keywords: buckets.keywords as Prisma.InputJsonValue,
                contents: buckets.contents as Prisma.InputJsonValue,
                competitors: buckets.competitors as Prisma.InputJsonValue,
                trends: buckets.trends as Prisma.InputJsonValue,
                audienceSignals: buckets.audienceSignals as Prisma.InputJsonValue,
                sampleStats: sampleStats as Prisma.InputJsonValue,
                dataQuality: dataQuality as Prisma.InputJsonValue,
              },
            });

            for (const ref of marketIntakeSources.filter((row) => row.role === 'REFERENCE_CONTENT')) {
              if (ref.assetId) {
                const asset = await tx.asset.findFirst({
                  where: {
                    id: ref.assetId,
                    tenantId: auth.tenantId,
                    workspaceId: project.workspaceId,
                    projectId: project.id,
                    deletedAt: null,
                  },
                  select: { id: true },
                });
                if (!asset) {
                  throw new AppError(ErrorCode.ASSET_NOT_FOUND);
                }
              }
              if (ref.canonicalUrl || ref.url) {
                const canon = ref.canonicalUrl || ref.url || null;
                const dup = await tx.referenceContent.findFirst({
                  where: {
                    tenantId: auth.tenantId,
                    projectId: project.id,
                    canonicalUrl: canon,
                    deletedAt: null,
                  },
                });
                if (dup) continue;
              }
              if (ref.assetId) {
                const dupAsset = await tx.referenceContent.findFirst({
                  where: {
                    tenantId: auth.tenantId,
                    projectId: project.id,
                    assetId: ref.assetId,
                    deletedAt: null,
                  },
                });
                if (dupAsset) continue;
              }
              await tx.referenceContent.create({
                data: {
                  tenantId: auth.tenantId,
                  workspaceId: project.workspaceId,
                  projectId: project.id,
                  sourceType: ref.sourceType,
                  platform: ref.platform ?? null,
                  title: ref.title ?? ref.label ?? null,
                  note: ref.userNote ?? null,
                  reasonForReference: ref.reasonForReference ?? null,
                  url: ref.url ?? null,
                  canonicalUrl: ref.canonicalUrl ?? null,
                  assetId: ref.assetId ?? null,
                  referenceOnly: true,
                  createdByUserId: auth.userId,
                  metadata: { role: 'REFERENCE_CONTENT', sourceId: ref.id },
                },
              });
            }

            return { research, snapshot };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        const publicResearch = toPublicMarketResearch(created.research, created.snapshot);
        if (input.researchRequested && this.autonomousResearch) {
          try {
            await this.autonomousResearch.requestResearch(
              auth,
              project.id,
              {
                platform: 'douyin',
                seedKeywords: normalizedContext.keywords,
                seedCompetitors: normalizedContext.competitors,
              },
              workspaceHint,
            );
          } catch {
            // Research failure must not block MarketResearch confirm / planning.
          }
        }
        return publicResearch;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2034') &&
          attempt < 4
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Unable to allocate market research version');
  }

  async list(auth: AuthContext, projectId: string, workspaceHint?: string): Promise<MarketResearchPublic[]> {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const rows = await this.prisma.marketResearch.findMany({
      where: { tenantId: auth.tenantId, workspaceId: project.workspaceId, projectId: project.id },
      include: { snapshot: true },
      orderBy: { version: 'desc' },
    });
    return rows.map((row) => toPublicMarketResearch(row, row.snapshot));
  }

  async getById(auth: AuthContext, id: string, workspaceHint?: string): Promise<MarketResearchPublic> {
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
    return toPublicMarketResearch(row, row.snapshot);
  }

  private async requireProject(auth: AuthContext, projectId: string, workspaceHint?: string) {
    if (!isUuid(projectId)) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: auth.tenantId, workspaceId, deletedAt: null },
      select: { id: true, workspaceId: true },
    });
    if (!project) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    return project;
  }
}

function bucketItems(items: NormalizedMarketItem[]) {
  return {
    keywords: items.filter((item) => item.kind === 'KEYWORD'),
    contents: items.filter((item) => item.kind === 'CONTENT'),
    competitors: items.filter((item) => item.kind === 'COMPETITOR'),
    trends: items.filter((item) => item.kind === 'TREND'),
    audienceSignals: items.filter((item) => item.kind === 'AUDIENCE_SIGNAL'),
  };
}

function sanitizeIntakeSources(raw: unknown[] | undefined): MarketSourceDraftEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: MarketSourceDraftEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (!isMarketSourceRole(row.role) || !isMarketSourceType(row.sourceType)) continue;
    if (typeof row.id !== 'string' || !row.id.trim()) continue;
    const provenance = (
      typeof row.provenance === 'string' ? row.provenance : 'USER_PROVIDED'
    ) as MarketSourceProvenance;
    out.push({
      id: row.id.trim(),
      role: row.role,
      sourceType: row.sourceType,
      provenance: ['USER_PROVIDED', 'SYSTEM_DISCOVERED', 'PLATFORM_API', 'UPLOADED', 'MANUAL'].includes(provenance)
        ? provenance
        : 'USER_PROVIDED',
      capturedAt: typeof row.capturedAt === 'string' ? row.capturedAt : new Date().toISOString(),
      ...(typeof row.platform === 'string' ? { platform: row.platform } : {}),
      ...(typeof row.title === 'string' ? { title: row.title } : {}),
      ...(typeof row.text === 'string' ? { text: row.text } : {}),
      ...(typeof row.url === 'string' ? { url: row.url } : {}),
      ...(typeof row.canonicalUrl === 'string' ? { canonicalUrl: row.canonicalUrl } : {}),
      ...(typeof row.assetId === 'string' ? { assetId: row.assetId } : {}),
      ...(typeof row.competitorName === 'string' ? { competitorName: row.competitorName } : {}),
      ...(typeof row.keyword === 'string' ? { keyword: row.keyword } : {}),
      ...(typeof row.label === 'string' ? { label: row.label } : {}),
      ...(typeof row.userNote === 'string' ? { userNote: row.userNote } : {}),
      ...(typeof row.reasonForReference === 'string' ? { reasonForReference: row.reasonForReference } : {}),
    });
  }
  return out;
}
