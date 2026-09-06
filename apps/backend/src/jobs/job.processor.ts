import { Injectable } from '@nestjs/common';
import { JobKind, JobStatus, PrismaClient } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { VideoGenerationService } from '../videos/video-generation.service.js';
import { PublishExecutionService } from '../publishing/publish-execution.service.js';
import { MetricsSyncExecutionService } from '../metrics/metrics-sync-execution.service.js';
import { isLeaseExpired } from './job-lease.js';
import { JobsService } from './jobs.service.js';

export type JobProcessResult = {
  status: 'completed' | 'failed' | 'skipped';
  reason?: string;
};

const TERMINAL: readonly JobStatus[] = [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED];

@Injectable()
export class JobProcessor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobs: JobsService,
    private readonly generation: VideoGenerationService,
    private readonly publish: PublishExecutionService,
    private readonly metricsSync: MetricsSyncExecutionService,
  ) {}

  async process(jobId: string): Promise<JobProcessResult> {
    if (!isUuid(jobId)) {
      return { status: 'skipped', reason: 'invalid' };
    }
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      return { status: 'skipped', reason: 'missing' };
    }
    if (TERMINAL.includes(job.status)) {
      return { status: 'skipped', reason: 'terminal' };
    }
    if (job.status === JobStatus.RUNNING && !isLeaseExpired(job)) {
      return { status: 'skipped', reason: 'running' };
    }
    if (job.status !== JobStatus.PENDING && job.status !== JobStatus.RUNNING) {
      return { status: 'skipped', reason: 'status' };
    }

    const isolated = await this.assertIsolation(job);
    if (!isolated) {
      await this.jobs.fail(job.tenantId, job.id, {
        code: ErrorCode.JOB_ISOLATION_VIOLATION,
        message: 'Job tenant isolation check failed',
      });
      if (job.kind === JobKind.VIDEO_GENERATION && job.videoId) {
        await this.prisma.video.updateMany({
          where: { id: job.videoId, tenantId: job.tenantId, outputAssetId: null, deletedAt: null },
          data: { status: 'FAILED' },
        });
      }
      return { status: 'failed', reason: 'isolation' };
    }

    try {
      return await this.dispatch(job);
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.JOB_CONFLICT) {
        return { status: 'skipped', reason: 'conflict' };
      }
      return { status: 'failed', reason: 'provider' };
    }
  }

  private async dispatch(job: { id: string; tenantId: string; kind: JobKind }): Promise<JobProcessResult> {
    switch (job.kind) {
      case JobKind.VIDEO_GENERATION:
        await this.generation.run(job.tenantId, job.id);
        return { status: 'completed' };
      case JobKind.VIDEO_PUBLISH:
        return this.publish.run(job.tenantId, job.id);
      case JobKind.PUBLICATION_METRICS_SYNC:
        return this.metricsSync.run(job.tenantId, job.id);
      case JobKind.MOVIE_EDITING:
      case JobKind.TTS_GENERATION:
      case JobKind.SUBTITLE_GENERATION:
      case JobKind.VIDEO_COMPOSE:
      default:
        await this.jobs.fail(job.tenantId, job.id, {
          code: ErrorCode.JOB_KIND_UNSUPPORTED,
          message: 'Job kind has no handler',
        });
        return { status: 'failed', reason: 'unsupported' };
    }
  }

  private async assertIsolation(job: {
    tenantId: string;
    workspaceId: string;
    projectId: string;
    videoId: string | null;
    scriptId: string | null;
  }): Promise<boolean> {
    const [workspace, project] = await Promise.all([
      this.prisma.workspace.findFirst({
        where: { id: job.workspaceId, tenantId: job.tenantId, deletedAt: null },
        select: { id: true, tenantId: true },
      }),
      this.prisma.project.findFirst({
        where: {
          id: job.projectId,
          tenantId: job.tenantId,
          workspaceId: job.workspaceId,
          deletedAt: null,
        },
        select: { id: true, tenantId: true, workspaceId: true },
      }),
    ]);
    if (!workspace || !project) {
      return false;
    }
    if (job.videoId) {
      const video = await this.prisma.video.findFirst({
        where: {
          id: job.videoId,
          tenantId: job.tenantId,
          workspaceId: job.workspaceId,
          projectId: job.projectId,
          deletedAt: null,
        },
        select: { scriptId: true },
      });
      if (!video) {
        return false;
      }
      if (job.scriptId && video.scriptId && video.scriptId !== job.scriptId) {
        return false;
      }
    }
    if (job.scriptId) {
      const script = await this.prisma.script.findFirst({
        where: {
          id: job.scriptId,
          tenantId: job.tenantId,
          workspaceId: job.workspaceId,
          projectId: job.projectId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!script) {
        return false;
      }
    }
    return true;
  }
}
