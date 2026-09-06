import { Injectable } from '@nestjs/common';
import { MetricSource, PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import type { CreateImportPublicationMetricsDto } from './dto/create-import-metrics.dto.js';
import {
  importCollectionKey,
  isAllowedImportMetricsProvider,
  isApiSpoofImportProvider,
} from './import-metrics.constants.js';
import { sameImportMetricsRequest } from './import-metrics.fingerprint.js';
import { normalizePublicationMetrics, requireAtLeastOneNormalizedMetric } from './normalize-ingestion-metrics.js';
import { OBSERVED_AT_CLOCK_SKEW_MS } from './publication-metrics.constants.js';
import { PublicationMetricsSnapshotWriter } from './publication-metrics-snapshot.writer.js';
import type { PublicationMetricSnapshotPublic } from './publication-metrics.mapper.js';
import {
  metricsMetadataContainsSecrets,
  sanitizeMetricsProviderMetadata,
} from './sanitize-metrics-metadata.js';

@Injectable()
export class MetricsIngestionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly writer: PublicationMetricsSnapshotWriter,
  ) {}

  async ingestImport(
    auth: AuthContext,
    publicationId: string,
    dto: CreateImportPublicationMetricsDto,
    meta: { idempotencyKey: string; workspaceHint?: string },
  ): Promise<PublicationMetricSnapshotPublic> {
    assertImportProvider(dto.provider);
    if (metricsMetadataContainsSecrets(dto.providerMetadata)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'providerMetadata contains forbidden fields');
    }

    const publication = await this.requirePublication(auth, publicationId, meta.workspaceHint);
    const metrics = requireAtLeastOneNormalizedMetric(normalizePublicationMetrics(dto.metrics));
    const observedAt = parseRequiredDate(dto.observedAt, 'observedAt');
    const providerCollectedAt = parseOptionalDate(dto.providerCollectedAt, 'providerCollectedAt');
    const providerMetadata = sanitizeMetricsProviderMetadata(dto.providerMetadata);
    const collectionKey = importCollectionKey(meta.idempotencyKey);

    return this.writer.write({
      publication,
      source: MetricSource.IMPORT,
      provider: dto.provider,
      collectionKey,
      sourceJobId: null,
      observedAt,
      providerCollectedAt,
      metrics,
      providerMetadata,
      sameRequest: (existing) =>
        sameImportMetricsRequest(publication.id, existing, {
          publicationId: publication.id,
          ...metrics,
          observedAt,
          providerCollectedAt,
          provider: dto.provider,
          providerMetadata,
        }),
    });
  }

  private async requirePublication(auth: AuthContext, id: string, workspaceHint?: string) {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const publication = await this.prisma.publication.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId },
    });
    if (!publication) {
      throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
    }
    return publication;
  }
}

function assertImportProvider(provider: string): void {
  if (isAllowedImportMetricsProvider(provider)) {
    return;
  }
  if (isApiSpoofImportProvider(provider)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'provider cannot spoof a platform API');
  }
  throw new AppError(ErrorCode.VALIDATION_ERROR, 'Unsupported import provider');
}

function parseRequiredDate(raw: string, field: string): Date {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} is invalid`);
  }
  if (parsed.getTime() > Date.now() + OBSERVED_AT_CLOCK_SKEW_MS) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} cannot be far in the future`);
  }
  return parsed;
}

function parseOptionalDate(raw: string | null | undefined, field: string): Date | null {
  if (raw == null || raw === '') {
    return null;
  }
  return parseRequiredDate(raw, field);
}
