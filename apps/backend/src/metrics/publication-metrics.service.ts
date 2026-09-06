import { Injectable } from '@nestjs/common';
import { MetricSource, Prisma, PrismaClient, PublicationStatus } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import type { CreateManualPublicationMetricsDto } from './dto/create-manual-metrics.dto.js';
import type { ListPublicationMetricsQueryDto } from './dto/list-publication-metrics.dto.js';
import {
  MANUAL_METRICS_DEFAULT_LIMIT,
  MANUAL_METRICS_PROVIDER,
  METRIC_FIELD_KEYS,
  OBSERVED_AT_CLOCK_SKEW_MS,
} from './publication-metrics.constants.js';
import {
  incomingObservedAtSemantic,
  manualCollectionKey,
  sameManualMetricsRequest,
  type ManualMetricsFingerprintInput,
  type ManualMetricsStored,
  type ManualMetricsValues,
} from './publication-metrics.fingerprint.js';
import { toPublicMetricSnapshot, type PublicationMetricSnapshotPublic } from './publication-metrics.mapper.js';
import { aggregatePublicationPerformance, type PublicationPerformanceSummary } from './publication-metrics-aggregator.js';
import { generatePerformanceInsights } from './performance-insight.engine.js';
import type { PublicationPerformanceInsightResult } from './performance-insight.types.js';
import { METRIC_SNAPSHOT_ORDER } from './snapshot-order.js';

@Injectable()
export class PublicationMetricsService {
  constructor(private readonly prisma: PrismaClient) {}

  async createManual(
    auth: AuthContext,
    publicationId: string,
    dto: CreateManualPublicationMetricsDto,
    meta: { idempotencyKey: string; workspaceHint?: string },
  ): Promise<PublicationMetricSnapshotPublic> {
    const publication = await this.requirePublication(auth, publicationId, meta.workspaceHint);
    if (publication.status !== PublicationStatus.PUBLISHED || publication.publishedAt == null) {
      throw new AppError(ErrorCode.PUBLICATION_METRICS_NOT_AVAILABLE);
    }

    const metrics = requireAtLeastOneMetric(dto);
    const observedAt = resolveObservedAt(dto.observedAt, publication.publishedAt);
    const collectionKey = manualCollectionKey(meta.idempotencyKey);
    const incoming: ManualMetricsFingerprintInput = {
      publicationId: publication.id,
      ...metrics,
      observedAtSemantic: incomingObservedAtSemantic(dto.observedAt),
    };

    try {
      const snapshot = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.publicationMetricSnapshot.findUnique({
          where: {
            tenantId_publicationId_source_collectionKey: {
              tenantId: auth.tenantId,
              publicationId: publication.id,
              source: MetricSource.MANUAL,
              collectionKey,
            },
          },
        });
        if (existing) {
          assertSameSemanticRequest(publication.id, existing, incoming);
          return existing;
        }
        return tx.publicationMetricSnapshot.create({
          data: {
            tenantId: publication.tenantId,
            workspaceId: publication.workspaceId,
            projectId: publication.projectId,
            publicationId: publication.id,
            platform: publication.platform,
            source: MetricSource.MANUAL,
            collectionKey,
            observedAt,
            providerCollectedAt: null,
            views: metrics.views,
            likes: metrics.likes,
            comments: metrics.comments,
            shares: metrics.shares,
            favorites: metrics.favorites,
            averageWatchTimeSeconds: toDecimalOrNull(metrics.averageWatchTimeSeconds),
            completionRate: toDecimalOrNull(metrics.completionRate),
            newFollowers: metrics.newFollowers,
            provider: MANUAL_METRICS_PROVIDER,
            providerMetadata: {},
            sourceJobId: null,
          },
        });
      });
      return toPublicMetricSnapshot(snapshot);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.publicationMetricSnapshot.findUnique({
          where: {
            tenantId_publicationId_source_collectionKey: {
              tenantId: auth.tenantId,
              publicationId: publication.id,
              source: MetricSource.MANUAL,
              collectionKey,
            },
          },
        });
        if (!existing) {
          throw error;
        }
        assertSameSemanticRequest(publication.id, existing, incoming);
        return toPublicMetricSnapshot(existing);
      }
      throw error;
    }
  }

  async list(
    auth: AuthContext,
    publicationId: string,
    query: ListPublicationMetricsQueryDto,
    workspaceHint?: string,
  ): Promise<{ items: PublicationMetricSnapshotPublic[]; limit: number }> {
    const publication = await this.requirePublication(auth, publicationId, workspaceHint);
    const limit = query.limit ?? MANUAL_METRICS_DEFAULT_LIMIT;
    const before = query.before ? new Date(query.before) : undefined;
    const rows = await this.prisma.publicationMetricSnapshot.findMany({
      where: {
        tenantId: auth.tenantId,
        publicationId: publication.id,
        ...(before && !Number.isNaN(before.getTime()) ? { observedAt: { lt: before } } : {}),
      },
      orderBy: METRIC_SNAPSHOT_ORDER,
      take: limit,
    });
    return { items: rows.map(toPublicMetricSnapshot), limit };
  }

  async latest(
    auth: AuthContext,
    publicationId: string,
    workspaceHint?: string,
  ): Promise<{ snapshot: PublicationMetricSnapshotPublic | null }> {
    const publication = await this.requirePublication(auth, publicationId, workspaceHint);
    const row = await this.prisma.publicationMetricSnapshot.findFirst({
      where: { tenantId: auth.tenantId, publicationId: publication.id },
      orderBy: METRIC_SNAPSHOT_ORDER,
    });
    return { snapshot: row ? toPublicMetricSnapshot(row) : null };
  }

  async summary(
    auth: AuthContext,
    publicationId: string,
    workspaceHint?: string,
  ): Promise<PublicationPerformanceSummary> {
    const publication = await this.requirePublication(auth, publicationId, workspaceHint);
    const rows = await this.prisma.publicationMetricSnapshot.findMany({
      where: { tenantId: auth.tenantId, publicationId: publication.id },
      orderBy: METRIC_SNAPSHOT_ORDER,
    });
    return aggregatePublicationPerformance({
      publication: {
        id: publication.id,
        videoId: publication.videoId,
        platform: publication.platform,
        publishedAt: publication.publishedAt,
      },
      snapshots: rows.map((row) => {
        const mapped = toPublicMetricSnapshot(row);
        return {
          id: mapped.id,
          source: mapped.source,
          observedAt: mapped.observedAt,
          createdAt: mapped.createdAt,
          views: mapped.views,
          likes: mapped.likes,
          comments: mapped.comments,
          shares: mapped.shares,
          favorites: mapped.favorites,
          averageWatchTimeSeconds: mapped.averageWatchTimeSeconds,
          completionRate: mapped.completionRate,
          newFollowers: mapped.newFollowers,
        };
      }),
    });
  }

  async insights(
    auth: AuthContext,
    publicationId: string,
    workspaceHint?: string,
  ): Promise<PublicationPerformanceInsightResult> {
    const summary = await this.summary(auth, publicationId, workspaceHint);
    return generatePerformanceInsights(summary);
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

function requireAtLeastOneMetric(dto: CreateManualPublicationMetricsDto): ManualMetricsValues {
  const metrics: ManualMetricsValues = {
    views: optionalMetric(dto.views),
    likes: optionalMetric(dto.likes),
    comments: optionalMetric(dto.comments),
    shares: optionalMetric(dto.shares),
    favorites: optionalMetric(dto.favorites),
    averageWatchTimeSeconds: optionalMetric(dto.averageWatchTimeSeconds),
    completionRate: optionalMetric(dto.completionRate),
    newFollowers: optionalMetric(dto.newFollowers),
  };
  const present = METRIC_FIELD_KEYS.some((key) => metrics[key] !== null);
  if (!present) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'At least one metric is required');
  }
  return metrics;
}

function optionalMetric(value: number | null | undefined): number | null {
  return value === undefined || value === null ? null : value;
}

function resolveObservedAt(raw: string | undefined, publishedAt: Date): Date {
  const now = new Date();
  const observedAt = raw ? new Date(raw) : now;
  if (Number.isNaN(observedAt.getTime())) {
    throw new AppError(ErrorCode.VALIDATION_ERROR);
  }
  if (observedAt.getTime() > now.getTime() + OBSERVED_AT_CLOCK_SKEW_MS) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'observedAt cannot be far in the future');
  }
  if (observedAt.getTime() < publishedAt.getTime()) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'observedAt cannot be earlier than publishedAt');
  }
  return observedAt;
}

function toDecimalOrNull(value: number | null): Prisma.Decimal | null {
  return value == null ? null : new Prisma.Decimal(value);
}

function assertSameSemanticRequest(
  publicationId: string,
  existing: ManualMetricsStored,
  incoming: ManualMetricsFingerprintInput,
): void {
  if (!sameManualMetricsRequest(publicationId, existing, incoming)) {
    throw new AppError(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
  }
}
