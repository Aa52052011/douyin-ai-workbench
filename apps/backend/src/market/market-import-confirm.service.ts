import { Injectable } from '@nestjs/common';
import { MarketResearchStatus, Prisma, PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import type { ConfirmMarketImportDto } from './dto/confirm-market-import.dto.js';
import {
  resolveMarketImportOrigin,
  resolveMarketImportSelectionMethod,
  resolveMarketImportShortText,
} from './import/market-import-context.js';
import { hashMarketImportIdempotency, hashNormalizedMarketItems } from './import/market-import-fingerprint.js';
import { ingestMarketImportCells } from './import/market-import-ingestion.js';
import { MARKET_IMPORT_MAPPING_VERSION } from './import/market-import.constants.js';
import type { MarketImportQueryContext } from './import/market-import.types.js';
import { validateResolvedMapping } from './import/market-import-mapping.js';
import { toPublicMarketResearch, type MarketResearchPublic } from './market-research.mapper.js';
import type { NormalizedMarketItem } from './market.types.js';
import { ProductBriefsService } from './product-briefs.service.js';

@Injectable()
export class MarketImportConfirmService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly briefs: ProductBriefsService,
  ) {}

  async confirm(
    auth: AuthContext,
    projectId: string,
    dto: ConfirmMarketImportDto,
    meta: { idempotencyKey: string; workspaceHint?: string },
  ): Promise<MarketResearchPublic> {
    if (dto.mappingVersion !== MARKET_IMPORT_MAPPING_VERSION) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Unsupported mappingVersion');
    }
    const project = await this.requireProject(auth, projectId, meta.workspaceHint);
    const brief = await this.briefs.requireCurrentPayload(auth, projectId, dto.productBriefId, meta.workspaceHint);
    const origin = resolveMarketImportOrigin(dto.origin);
    const selectionMethod = resolveMarketImportSelectionMethod(dto.selectionMethod);
    const sampleScope = resolveMarketImportShortText(dto.sampleScope, 'sampleScope');
    const sourceContext = resolveMarketImportShortText(dto.sourceContext, 'sourceContext');
    const mapping = validateResolvedMapping({ kind: dto.kind, mapping: dto.resolvedMapping });
    const ingested = ingestMarketImportCells({
      kind: dto.kind,
      mapping,
      rows: dto.rows,
      collectedAtOverride: dto.collectedAt,
      fileFingerprint: dto.fileFingerprint,
      sourceContext,
    });
    if (ingested.items.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'no valid market import rows');
    }
    const normalizedItemsFingerprint = hashNormalizedMarketItems(ingested.items);
    const idempotencyFingerprint = hashMarketImportIdempotency({
      fileFingerprint: dto.fileFingerprint,
      mappingVersion: MARKET_IMPORT_MAPPING_VERSION,
      kind: dto.kind,
      normalizedItemsFingerprint,
      productBriefId: brief.id,
      productBriefVersion: brief.version,
      origin,
      selectionMethod,
      collectedAt: ingested.collectedAt,
    });
    const queryContext: MarketImportQueryContext = {
      source: 'IMPORT',
      kind: dto.kind,
      mappingVersion: MARKET_IMPORT_MAPPING_VERSION,
      fileFingerprint: dto.fileFingerprint,
      normalizedItemsFingerprint,
      origin,
      selectionMethod,
      ...(sampleScope ? { sampleScope } : {}),
      ...(sourceContext ? { sourceContext } : {}),
      collectedAt: ingested.collectedAt,
      collectedAtAssumed: ingested.collectedAtAssumed,
      itemCount: ingested.items.length,
      duplicateCount: ingested.duplicateCount,
      productBriefId: brief.id,
      productBriefVersion: brief.version,
      idempotencyKey: meta.idempotencyKey,
      idempotencyFingerprint,
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const created = await this.prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`market-import:${auth.tenantId}:${project.id}:${meta.idempotencyKey}`})::bigint)`;
            const existing = await tx.marketResearch.findFirst({
              where: {
                tenantId: auth.tenantId,
                projectId: project.id,
                queryContext: { path: ['idempotencyKey'], equals: meta.idempotencyKey },
              },
              include: { snapshot: true },
              orderBy: { version: 'desc' },
            });
            if (existing) {
              const previous = existing.queryContext as { idempotencyFingerprint?: string };
              if (previous.idempotencyFingerprint !== idempotencyFingerprint) {
                throw new AppError(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
              }
              return { research: existing, snapshot: existing.snapshot };
            }
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
                queryContext: queryContext as Prisma.InputJsonValue,
                sourceAgentRunId: null,
                sourceJobId: null,
              },
            });
            const buckets = bucketItems(ingested.items);
            const snapshot = await tx.marketResearchSnapshot.create({
              data: {
                tenantId: auth.tenantId,
                workspaceId: project.workspaceId,
                projectId: project.id,
                marketResearchId: research.id,
                collectedAt: new Date(ingested.collectedAt),
                sources: ['IMPORT'] as Prisma.InputJsonValue,
                keywords: buckets.keywords as Prisma.InputJsonValue,
                contents: buckets.contents as Prisma.InputJsonValue,
                competitors: buckets.competitors as Prisma.InputJsonValue,
                trends: buckets.trends as Prisma.InputJsonValue,
                audienceSignals: buckets.audienceSignals as Prisma.InputJsonValue,
                sampleStats: ingested.sampleStats as Prisma.InputJsonValue,
                dataQuality: ingested.dataQuality as Prisma.InputJsonValue,
              },
            });
            return { research, snapshot };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        if (!created.snapshot) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 'Imported market research is missing snapshot');
        }
        return toPublicMarketResearch(created.research, created.snapshot);
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
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
