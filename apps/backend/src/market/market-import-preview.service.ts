import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import type { MarketItemKind } from './market.types.js';
import { MARKET_ITEM_KINDS } from './market.constants.js';
import {
  resolveMarketImportOrigin,
  resolveMarketImportSelectionMethod,
  resolveMarketImportShortText,
} from './import/market-import-context.js';
import { hashMarketImportFile, hashNormalizedMarketItems } from './import/market-import-fingerprint.js';
import { ingestParsedMarketImportRows } from './import/market-import-ingestion.js';
import { parseMarketImportFile } from './import/market-import.parser.js';
import { ProductBriefsService } from './product-briefs.service.js';

@Injectable()
export class MarketImportPreviewService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly briefs: ProductBriefsService,
  ) {}

  async preview(
    auth: AuthContext,
    projectId: string,
    input: {
      file: { buffer: Buffer; originalname: string };
      kind: string;
      productBriefId?: string;
      collectedAtOverride?: string;
      mapping?: Record<string, string> | null;
      origin?: string;
      selectionMethod?: string;
      sampleScope?: string;
      sourceContext?: string;
    },
    workspaceHint?: string,
  ) {
    await this.requireProject(auth, projectId, workspaceHint);
    const kind = requireKind(input.kind);
    const brief = await this.briefs.requireCurrentPayload(auth, projectId, input.productBriefId, workspaceHint);
    resolveMarketImportOrigin(input.origin);
    resolveMarketImportSelectionMethod(input.selectionMethod);
    const sampleScope = resolveMarketImportShortText(input.sampleScope, 'sampleScope');
    const sourceContext = resolveMarketImportShortText(input.sourceContext, 'sourceContext');

    const parsed = await parseMarketImportFile({
      originalName: input.file.originalname,
      buffer: input.file.buffer,
      kind,
      customMapping: input.mapping,
    });
    const ingested = ingestParsedMarketImportRows({
      kind,
      rows: parsed.rows,
      collectedAtOverride: input.collectedAtOverride,
      fileFingerprint: hashMarketImportFile(input.file.buffer),
      sourceContext,
      extraWarnings: parsed.warnings,
    });
    const fileFingerprint = hashMarketImportFile(input.file.buffer);
    return {
      fileName: parsed.fileName,
      format: parsed.format,
      kind,
      mappingVersion: parsed.mappingVersion,
      fileFingerprint,
      normalizedItemsFingerprint: hashNormalizedMarketItems(ingested.items),
      detectedColumns: parsed.detectedColumns,
      resolvedMapping: parsed.resolvedMapping.columns,
      ignoredColumns: parsed.resolvedMapping.ignoredColumns,
      rows: ingested.rows,
      summary: {
        totalRows: ingested.rows.length,
        validRows: ingested.items.length,
        invalidRows: ingested.rows.filter((row) => row.errors.length > 0).length,
        duplicateRows: ingested.duplicateCount,
        warningRows: ingested.rows.filter((row) => row.warnings.length > 0).length,
      },
      sampleStatsPreview: ingested.sampleStats,
      dataQualityPreview: ingested.dataQuality,
      collectedAt: ingested.collectedAt,
      collectedAtAssumed: ingested.collectedAtAssumed,
      warnings: ingested.warnings,
      productBriefId: brief.id,
      productBriefVersion: brief.version,
      sampleScope,
      sourceContext,
    };
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

export function requireKind(value: unknown): MarketItemKind {
  if (typeof value !== 'string' || !(MARKET_ITEM_KINDS as readonly string[]).includes(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'kind is invalid');
  }
  return value as MarketItemKind;
}
