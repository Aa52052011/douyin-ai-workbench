import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { hashImportFile } from './import/file-fingerprint.js';
import { DOUYIN_EXPORT_MAPPING_VERSION } from './import/import-file.constants.js';
import { MetricsImportParser } from './import/metrics-import.parser.js';
import type { MetricsImportPreviewResult, ParsedMetricsImportRow } from './import/metrics-import.types.js';
import { parseImportDateTime } from './import/parse-import-datetime.js';
import { PublicationMatchKind, PublicationMetricsMatcher } from './publication-metrics-matcher.js';

@Injectable()
export class MetricsImportPreviewService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly parser: MetricsImportParser,
    private readonly matcher: PublicationMetricsMatcher,
  ) {}

  async preview(
    auth: AuthContext,
    input: {
      file: { buffer: Buffer; originalname: string };
      projectId?: string;
      observedAtOverride?: string;
      workspaceHint?: string;
    },
  ): Promise<MetricsImportPreviewResult> {
    const workspaceId = resolveWorkspaceId(auth, input.workspaceHint);
    const projectId = input.projectId?.trim();
    if (projectId) {
      await this.requireProject(auth.tenantId, workspaceId, projectId);
    }

    const parsed = await this.parser.parse({
      originalName: input.file.originalname,
      buffer: input.file.buffer,
    });
    const override = input.observedAtOverride ? parseImportDateTime(input.observedAtOverride) : null;
    if (input.observedAtOverride && !override) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'observedAtOverride is invalid');
    }

    const rows = [];
    for (const row of parsed.rows) {
      applyObservedAtOverride(row, override);
      const matchResult = projectId
        ? await this.matcher.match({
            tenantId: auth.tenantId,
            workspaceId,
            projectId,
            externalPostId: row.externalPostId,
            externalUrl: row.rawUrl,
            title: row.rawTitle,
            publishedAt: row.publishedAt,
          })
        : { kind: PublicationMatchKind.UNMATCHED, publicationIds: [], matchedBy: null };
      const invalid = row.errors.length > 0;
      rows.push({
        rowNumber: row.rowNumber,
        parsed: {
          title: row.rawTitle,
          url: row.rawUrl,
          externalPostId: row.externalPostId,
          publishedAt: row.publishedAt?.toISOString() ?? null,
          observedAt: row.observedAt?.toISOString() ?? null,
          providerCollectedAt: row.providerCollectedAt?.toISOString() ?? null,
          metrics: row.metrics,
        },
        matchResult,
        suggestedPublicationId:
          !invalid && matchResult.kind === PublicationMatchKind.EXACT ? (matchResult.publicationIds[0] ?? null) : null,
        warnings: [...parsed.warnings, ...row.warnings],
        errors: row.errors,
      });
    }

    return {
      fileName: parsed.fileName,
      format: parsed.format,
      mappingVersion: parsed.mappingVersion,
      fileFingerprint: hashImportFile(input.file.buffer, DOUYIN_EXPORT_MAPPING_VERSION),
      rows,
      summary: {
        totalRows: rows.length,
        exactMatches: rows.filter((row) => row.matchResult.kind === PublicationMatchKind.EXACT && row.errors.length === 0)
          .length,
        weakMatches: rows.filter((row) => row.matchResult.kind === PublicationMatchKind.WEAK && row.errors.length === 0)
          .length,
        ambiguous: rows.filter((row) => row.matchResult.kind === PublicationMatchKind.AMBIGUOUS && row.errors.length === 0)
          .length,
        unmatched: rows.filter((row) => row.matchResult.kind === PublicationMatchKind.UNMATCHED && row.errors.length === 0)
          .length,
        invalid: rows.filter((row) => row.errors.length > 0).length,
      },
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

function applyObservedAtOverride(row: ParsedMetricsImportRow, override: Date | null): void {
  if (row.observedAt || !override) {
    return;
  }
  row.observedAt = override;
  row.warnings.push('observedAt taken from preview override');
  row.errors = row.errors.filter((error) => error !== 'observedAt is required');
}
