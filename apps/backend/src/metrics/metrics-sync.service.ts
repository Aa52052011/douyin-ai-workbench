import { Inject, Injectable } from '@nestjs/common';
import { JobKind, JobStatus, PrismaClient, PublicationStatus } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { JobsService } from '../jobs/jobs.service.js';
import { toPublicJob, type JobPublic } from '../jobs/jobs.mapper.js';
import type { JobQueue } from '../jobs/queue/job-queue.js';
import { JOB_QUEUE } from '../jobs/queue/queue.constants.js';
import { MOCK_METRICS_JOB_PROVIDER } from './api-metrics.constants.js';
import { PlatformMetricsProviderRegistry } from './metrics-provider.registry.js';
import { readPublicationIdFromJobInput } from '../publishing/publish-job-input.js';

@Injectable()
export class MetricsSyncService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobs: JobsService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly providers: PlatformMetricsProviderRegistry,
  ) {}

  async requestSync(
    auth: AuthContext,
    publicationId: string,
    meta: { idempotencyKey: string; workspaceHint?: string },
  ): Promise<{ job: JobPublic }> {
    const workspaceId = resolveWorkspaceId(auth, meta.workspaceHint);
    const publication = await this.requirePublishedPublication(auth.tenantId, workspaceId, publicationId);
    this.providers.resolve(publication.platform);
    if (!publication.externalPostId) {
      throw new AppError(ErrorCode.PUBLICATION_METRICS_EXTERNAL_ID_REQUIRED);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`metrics-sync:${auth.tenantId}:${meta.idempotencyKey}`})::bigint)`;
      const existing = await tx.job.findFirst({
        where: {
          tenantId: auth.tenantId,
          requestId: meta.idempotencyKey,
          kind: JobKind.PUBLICATION_METRICS_SYNC,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        const existingPublicationId = readPublicationIdFromJobInput(existing.input);
        if (existingPublicationId !== publication.id || existing.workspaceId !== workspaceId) {
          throw new AppError(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
        }
        return { job: existing, enqueued: false };
      }
      const job = await tx.job.create({
        data: {
          tenantId: auth.tenantId,
          workspaceId,
          projectId: publication.projectId,
          kind: JobKind.PUBLICATION_METRICS_SYNC,
          status: JobStatus.PENDING,
          requestId: meta.idempotencyKey,
          provider: MOCK_METRICS_JOB_PROVIDER,
          videoId: publication.videoId,
          input: { publicationId: publication.id },
        },
      });
      return { job, enqueued: true };
    });

    if (created.enqueued) {
      await this.dispatch(auth.tenantId, created.job.id);
    }
    return { job: toPublicJob(created.job) };
  }

  private async dispatch(tenantId: string, jobId: string): Promise<void> {
    try {
      await this.queue.enqueue(jobId);
    } catch (error) {
      const payload =
        error instanceof AppError
          ? (() => {
              const body = error.getResponse() as { code?: string; message?: string };
              return {
                code: error.code,
                message: typeof body.message === 'string' ? body.message : 'Job queue is unavailable',
              };
            })()
          : { code: ErrorCode.JOB_ENQUEUE_FAILED, message: 'Job queue is unavailable' };
      await this.jobs.fail(tenantId, jobId, payload);
      throw error instanceof AppError ? error : new AppError(ErrorCode.JOB_ENQUEUE_FAILED);
    }
  }

  private async requirePublishedPublication(tenantId: string, workspaceId: string, id: string) {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
    }
    const publication = await this.prisma.publication.findFirst({
      where: { id, tenantId, workspaceId },
    });
    if (!publication) {
      throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
    }
    if (publication.status !== PublicationStatus.PUBLISHED || publication.publishedAt == null) {
      throw new AppError(ErrorCode.PUBLICATION_METRICS_NOT_AVAILABLE);
    }
    return publication;
  }
}
