import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import type { ConfirmMetricsImportDto } from './dto/confirm-metrics-import.dto.js';
import { fileImportIdempotencyKey } from './import/file-fingerprint.js';
import { DOUYIN_EXPORT_MAPPING_VERSION } from './import/import-file.constants.js';
import { MetricsIngestionService } from './metrics-ingestion.service.js';
import {
  normalizePublicationMetrics,
  requireAtLeastOneNormalizedMetric,
} from './normalize-ingestion-metrics.js';
import type { PublicationMetricSnapshotPublic } from './publication-metrics.mapper.js';

export type MetricsImportConfirmRowResult = {
  rowNumber: number;
  status: 'imported' | 'rejected';
  snapshot?: PublicationMetricSnapshotPublic;
  error?: { code: string; message: string };
};

@Injectable()
export class MetricsImportConfirmService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ingestion: MetricsIngestionService,
  ) {}

  async confirm(
    auth: AuthContext,
    dto: ConfirmMetricsImportDto,
    workspaceHint?: string,
  ): Promise<{
    mappingVersion: string;
    fileFingerprint: string;
    format: 'CSV' | 'XLSX';
    results: MetricsImportConfirmRowResult[];
  }> {
    if (dto.mappingVersion !== DOUYIN_EXPORT_MAPPING_VERSION) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Unsupported mappingVersion');
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    await this.requireProject(auth.tenantId, workspaceId, dto.projectId);
    const provider = dto.format === 'CSV' ? 'CSV_IMPORT' : 'XLSX_IMPORT';

    const results: MetricsImportConfirmRowResult[] = [];
    for (const row of dto.rows) {
      try {
        if (!isUuid(row.publicationId)) {
          throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
        }
        const publication = await this.prisma.publication.findFirst({
          where: {
            id: row.publicationId,
            tenantId: auth.tenantId,
            workspaceId,
            projectId: dto.projectId,
          },
          select: { id: true },
        });
        if (!publication) {
          throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
        }
        const metrics = requireAtLeastOneNormalizedMetric(normalizePublicationMetrics(row.metrics));
        const observedAt = new Date(row.observedAt);
        const snapshot = await this.ingestion.ingestImport(
          auth,
          publication.id,
          {
            observedAt: row.observedAt,
            providerCollectedAt: row.providerCollectedAt,
            provider,
            metrics,
            providerMetadata: { mappingVersion: dto.mappingVersion },
          },
          {
            idempotencyKey: fileImportIdempotencyKey({
              mappingVersion: dto.mappingVersion,
              publicationId: publication.id,
              observedAt,
              metrics,
              provider,
            }),
            workspaceHint,
          },
        );
        results.push({ rowNumber: row.rowNumber, status: 'imported', snapshot });
      } catch (error) {
        if (error instanceof AppError) {
          const body = error.getResponse() as { code?: string; message?: string };
          results.push({
            rowNumber: row.rowNumber,
            status: 'rejected',
            error: {
              code: error.code,
              message: typeof body.message === 'string' ? body.message : error.message,
            },
          });
          continue;
        }
        throw error;
      }
    }

    return {
      mappingVersion: dto.mappingVersion,
      fileFingerprint: dto.fileFingerprint,
      format: dto.format,
      results,
    };
  }

  private async requireProject(tenantId: string, workspaceId: string, projectId: string) {
    if (!isUuid(projectId)) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId, workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
  }
}
