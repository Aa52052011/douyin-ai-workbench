import { Injectable } from '@nestjs/common';
import { MetricSource, Prisma, PrismaClient, PublicationStatus, type Publication } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import type { NormalizedPublicationMetrics, RawPublicationMetrics } from './ingestion.types.js';
import {
  normalizePublicationMetrics,
  requireAtLeastOneNormalizedMetric,
} from './normalize-ingestion-metrics.js';
import { OBSERVED_AT_CLOCK_SKEW_MS } from './publication-metrics.constants.js';
import { toPublicMetricSnapshot, type PublicationMetricSnapshotPublic } from './publication-metrics.mapper.js';
import {
  assertNoSecretMetricsMetadata,
  sanitizeMetricsProviderMetadata,
} from './sanitize-metrics-metadata.js';

export type SnapshotWriteRequest = {
  publication: Publication;
  source: MetricSource;
  provider: string;
  collectionKey: string;
  sourceJobId: string | null;
  observedAt: Date;
  providerCollectedAt: Date | null;
  metrics: RawPublicationMetrics | NormalizedPublicationMetrics;
  providerMetadata?: unknown;
  sameRequest: (existing: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    favorites: number | null;
    averageWatchTimeSeconds: unknown;
    completionRate: unknown;
    newFollowers: number | null;
    observedAt: Date;
    createdAt: Date;
    providerCollectedAt: Date | null;
    provider: string | null;
    providerMetadata: Prisma.JsonValue;
  }) => boolean;
};

@Injectable()
export class PublicationMetricsSnapshotWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async write(request: SnapshotWriteRequest): Promise<PublicationMetricSnapshotPublic> {
    const publication = request.publication;
    if (publication.status !== PublicationStatus.PUBLISHED || publication.publishedAt == null) {
      throw new AppError(ErrorCode.PUBLICATION_METRICS_NOT_AVAILABLE);
    }
    assertValidObservedAt(request.observedAt, publication.publishedAt);
    assertValidOptionalDate(request.providerCollectedAt);
    const metrics = requireAtLeastOneNormalizedMetric(normalizePublicationMetrics(request.metrics));
    const providerMetadata = sanitizeMetricsProviderMetadata(request.providerMetadata);
    assertNoSecretMetricsMetadata(providerMetadata);

    try {
      const snapshot = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.publicationMetricSnapshot.findUnique({
          where: {
            tenantId_publicationId_source_collectionKey: {
              tenantId: publication.tenantId,
              publicationId: publication.id,
              source: request.source,
              collectionKey: request.collectionKey,
            },
          },
        });
        if (existing) {
          assertSameRequest(existing, request.sameRequest);
          return existing;
        }
        return tx.publicationMetricSnapshot.create({
          data: {
            tenantId: publication.tenantId,
            workspaceId: publication.workspaceId,
            projectId: publication.projectId,
            publicationId: publication.id,
            platform: publication.platform,
            source: request.source,
            collectionKey: request.collectionKey,
            observedAt: request.observedAt,
            providerCollectedAt: request.providerCollectedAt,
            views: metrics.views,
            likes: metrics.likes,
            comments: metrics.comments,
            shares: metrics.shares,
            favorites: metrics.favorites,
            averageWatchTimeSeconds: toDecimalOrNull(metrics.averageWatchTimeSeconds),
            completionRate: toDecimalOrNull(metrics.completionRate),
            newFollowers: metrics.newFollowers,
            provider: request.provider,
            providerMetadata: providerMetadata as Prisma.InputJsonValue,
            sourceJobId: request.sourceJobId,
          },
        });
      });
      return toPublicMetricSnapshot(snapshot);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.publicationMetricSnapshot.findUnique({
          where: {
            tenantId_publicationId_source_collectionKey: {
              tenantId: publication.tenantId,
              publicationId: publication.id,
              source: request.source,
              collectionKey: request.collectionKey,
            },
          },
        });
        if (!existing) {
          throw error;
        }
        assertSameRequest(existing, request.sameRequest);
        return toPublicMetricSnapshot(existing);
      }
      throw error;
    }
  }
}

function assertSameRequest(
  existing: Parameters<SnapshotWriteRequest['sameRequest']>[0],
  sameRequest: SnapshotWriteRequest['sameRequest'],
): void {
  if (!sameRequest(existing)) {
    throw new AppError(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
  }
}

function assertValidObservedAt(observedAt: Date, publishedAt: Date): void {
  if (Number.isNaN(observedAt.getTime())) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'observedAt is invalid');
  }
  const now = Date.now();
  if (observedAt.getTime() > now + OBSERVED_AT_CLOCK_SKEW_MS) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'observedAt cannot be far in the future');
  }
  if (observedAt.getTime() < publishedAt.getTime()) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'observedAt cannot be earlier than publishedAt');
  }
}

function assertValidOptionalDate(value: Date | null): void {
  if (value == null) {
    return;
  }
  if (Number.isNaN(value.getTime())) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'providerCollectedAt is invalid');
  }
  if (value.getTime() > Date.now() + OBSERVED_AT_CLOCK_SKEW_MS) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'providerCollectedAt cannot be far in the future');
  }
}

function toDecimalOrNull(value: number | null): Prisma.Decimal | null {
  return value == null ? null : new Prisma.Decimal(value);
}
