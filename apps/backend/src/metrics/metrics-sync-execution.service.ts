import { Injectable } from '@nestjs/common';
import {
  JobKind,
  MetricSource,
  Prisma,
  PrismaClient,
  PublicationStatus,
  type Job,
  type Publication,
} from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { JobsService } from '../jobs/jobs.service.js';
import { readPublicationIdFromJobInput } from '../publishing/publish-job-input.js';
import { API_METRICS_PROVIDER, apiCollectionKey } from './api-metrics.constants.js';
import { PlatformMetricsProviderRegistry } from './metrics-provider.registry.js';
import type { GetPostMetricsInput, PostMetricsResult } from './metrics-provider.types.js';
import { normalizePostMetricsResult } from './normalize-post-metrics.js';
import { sanitizeMetricsProviderMetadata } from './sanitize-metrics-metadata.js';

export type MetricsSyncProcessResult = {
  status: 'completed' | 'failed' | 'skipped';
  reason?: string;
};

@Injectable()
export class MetricsSyncExecutionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobs: JobsService,
    private readonly providers: PlatformMetricsProviderRegistry,
  ) {}

  async run(tenantId: string, jobId: string): Promise<MetricsSyncProcessResult> {
    const claimed = await this.jobs.claim(tenantId, jobId);
    if (claimed.kind !== JobKind.PUBLICATION_METRICS_SYNC) {
      throw new AppError(ErrorCode.JOB_KIND_UNSUPPORTED);
    }
    const heartbeat = this.jobs.startHeartbeat(tenantId, jobId);
    try {
      const publicationId = readPublicationIdFromJobInput(claimed.input);
      if (!publicationId) {
        throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
      }
      const publication = await this.prisma.publication.findFirst({
        where: { id: publicationId, tenantId },
        include: { platformAccount: true },
      });
      if (!publication) {
        throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
      }
      this.assertIsolation(claimed, publication);
      if (publication.status !== PublicationStatus.PUBLISHED || publication.publishedAt == null) {
        throw new AppError(ErrorCode.PUBLICATION_METRICS_NOT_AVAILABLE);
      }
      if (!publication.externalPostId) {
        throw new AppError(ErrorCode.PUBLICATION_METRICS_EXTERNAL_ID_REQUIRED);
      }

      const collectionKey = apiCollectionKey(claimed.id);
      const existing = await this.prisma.publicationMetricSnapshot.findUnique({
        where: {
          tenantId_publicationId_source_collectionKey: {
            tenantId,
            publicationId: publication.id,
            source: MetricSource.API,
            collectionKey,
          },
        },
      });
      if (existing) {
        await this.jobs.complete(tenantId, claimed.id, metricsJobOutput({
          publicationId: publication.id,
          provider: API_METRICS_PROVIDER,
          providerCalled: false,
          snapshotId: existing.id,
          observedAt: existing.observedAt.toISOString(),
        }));
        return { status: 'completed' };
      }

      const provider = this.providers.resolve(publication.platform);
      const input: GetPostMetricsInput = {
        tenantId: publication.tenantId,
        workspaceId: publication.workspaceId,
        projectId: publication.projectId,
        publicationId: publication.id,
        videoId: publication.videoId,
        platform: publication.platform,
        externalPostId: publication.externalPostId,
        ...(publication.platformAccount
          ? {
              platformAccount: {
                id: publication.platformAccount.id,
                platform: publication.platformAccount.platform,
                status: publication.platformAccount.status,
                externalAccountId: publication.platformAccount.externalAccountId,
              },
            }
          : {}),
      };
      const raw = await provider.getPostMetrics(input);
      const result = normalizePostMetricsResult(raw);
      const observedAt = result.observedAt ?? new Date();
      await this.jobs.mergeOutput(
        tenantId,
        claimed.id,
        metricsJobOutput({
          publicationId: publication.id,
          provider: API_METRICS_PROVIDER,
          providerCalled: true,
          providerRequestId: result.providerRequestId,
          providerSnapshotId: result.providerSnapshotId,
          observedAt: observedAt.toISOString(),
        }),
        70,
      );
      const snapshot = await this.insertSnapshot(claimed, publication, collectionKey, result, observedAt);
      await this.jobs.complete(tenantId, claimed.id, metricsJobOutput({
        publicationId: publication.id,
        provider: API_METRICS_PROVIDER,
        providerCalled: true,
        providerRequestId: result.providerRequestId,
        providerSnapshotId: result.providerSnapshotId,
        snapshotId: snapshot.id,
        observedAt: observedAt.toISOString(),
      }));
      return { status: 'completed' };
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.JOB_CONFLICT) {
        throw error;
      }
      await this.failExecution(tenantId, jobId, error);
      throw error;
    } finally {
      heartbeat.stop();
    }
  }

  private assertIsolation(job: Job, publication: Publication): void {
    if (
      publication.tenantId !== job.tenantId ||
      publication.workspaceId !== job.workspaceId ||
      publication.projectId !== job.projectId ||
      publication.videoId !== job.videoId
    ) {
      throw new AppError(ErrorCode.JOB_ISOLATION_VIOLATION);
    }
  }

  private async insertSnapshot(
    job: Job,
    publication: Publication,
    collectionKey: string,
    result: PostMetricsResult,
    observedAt: Date,
  ) {
    const metadata = sanitizeMetricsProviderMetadata({
      ...result.metadata,
      providerRequestId: result.providerRequestId,
      providerSnapshotId: result.providerSnapshotId,
    });
    try {
      return await this.prisma.publicationMetricSnapshot.create({
        data: {
          tenantId: publication.tenantId,
          workspaceId: publication.workspaceId,
          projectId: publication.projectId,
          publicationId: publication.id,
          platform: publication.platform,
          source: MetricSource.API,
          collectionKey,
          observedAt,
          providerCollectedAt: result.providerCollectedAt,
          views: result.views,
          likes: result.likes,
          comments: result.comments,
          shares: result.shares,
          favorites: result.favorites,
          averageWatchTimeSeconds: toDecimalOrNull(result.averageWatchTimeSeconds),
          completionRate: toDecimalOrNull(result.completionRate),
          newFollowers: result.newFollowers,
          provider: API_METRICS_PROVIDER,
          providerMetadata: metadata as Prisma.InputJsonValue,
          sourceJobId: job.id,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.publicationMetricSnapshot.findUnique({
          where: {
            tenantId_publicationId_source_collectionKey: {
              tenantId: job.tenantId,
              publicationId: publication.id,
              source: MetricSource.API,
              collectionKey,
            },
          },
        });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  private async failExecution(tenantId: string, jobId: string, error: unknown): Promise<void> {
    const payload =
      error instanceof AppError
        ? (() => {
            const body = error.getResponse() as { code?: string; message?: string };
            return {
              code: error.code,
              message: typeof body.message === 'string' ? body.message : error.message,
            };
          })()
        : { code: ErrorCode.METRICS_PROVIDER_INVALID_RESPONSE, message: 'Metrics sync failed' };
    await this.jobs.fail(tenantId, jobId, payload);
  }
}

function toDecimalOrNull(value: number | null): Prisma.Decimal | null {
  return value == null ? null : new Prisma.Decimal(value);
}

function metricsJobOutput(value: {
  publicationId: string;
  provider: string;
  providerCalled: boolean;
  providerRequestId?: string | null;
  providerSnapshotId?: string | null;
  snapshotId?: string;
  observedAt?: string;
}): Prisma.InputJsonValue {
  return {
    metricsSync: {
      publicationId: value.publicationId,
      provider: value.provider,
      providerCalled: value.providerCalled,
      ...(value.providerRequestId != null ? { providerRequestId: value.providerRequestId } : {}),
      ...(value.providerSnapshotId != null ? { providerSnapshotId: value.providerSnapshotId } : {}),
      ...(value.snapshotId ? { snapshotId: value.snapshotId } : {}),
      ...(value.observedAt ? { observedAt: value.observedAt } : {}),
    },
  };
}
