import { Injectable } from '@nestjs/common';
import { JobKind, JobStatus, Prisma, PrismaClient } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { jobLeaseConfig } from './job-lease.js';
import { toPublicJob, type JobPublic } from './jobs.mapper.js';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    tenantId: string;
    workspaceId: string;
    projectId: string;
    kind: JobKind;
    requestId: string;
    provider?: string;
    model?: string;
    input?: Prisma.InputJsonValue;
    scriptId?: string;
    videoId?: string;
    agentRunId?: string;
  }): Promise<JobPublic> {
    const created = await this.prisma.job.create({
      data: {
        tenantId: data.tenantId,
        workspaceId: data.workspaceId,
        projectId: data.projectId,
        kind: data.kind,
        status: JobStatus.PENDING,
        requestId: data.requestId,
        provider: data.provider,
        model: data.model,
        input: data.input ?? {},
        scriptId: data.scriptId,
        videoId: data.videoId,
        agentRunId: data.agentRunId,
      },
    });
    return toPublicJob(created);
  }

  async getById(tenantId: string, id: string) {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.JOB_NOT_FOUND);
    }
    const job = await this.prisma.job.findFirst({
      where: { id, tenantId },
    });
    if (!job) {
      throw new AppError(ErrorCode.JOB_NOT_FOUND);
    }
    return job;
  }

  async claim(tenantId: string, id: string) {
    const { leaseMs } = jobLeaseConfig();
    const now = new Date();
    const expired = new Date(now.getTime() - leaseMs);
    const count = await this.prisma.$executeRaw`
      UPDATE "jobs"
      SET
        "status" = 'RUNNING'::"JobStatus",
        "locked_at" = ${now},
        "last_heartbeat_at" = ${now},
        "attempt" = "attempt" + 1,
        "started_at" = COALESCE("started_at", ${now}),
        "progress" = CASE WHEN "progress" < 5 THEN 5 ELSE "progress" END
      WHERE "id" = ${id}::uuid
        AND "tenant_id" = ${tenantId}::uuid
        AND (
          "status" = 'PENDING'::"JobStatus"
          OR (
            "status" = 'RUNNING'::"JobStatus"
            AND COALESCE("last_heartbeat_at", "locked_at", TIMESTAMPTZ '1970-01-01') < ${expired}
          )
        )
    `;
    if (count !== 1) {
      throw new AppError(ErrorCode.JOB_CONFLICT);
    }
    return this.getById(tenantId, id);
  }

  async heartbeat(tenantId: string, id: string) {
    const updated = await this.prisma.job.updateMany({
      where: { id, tenantId, status: JobStatus.RUNNING },
      data: { lastHeartbeatAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new AppError(ErrorCode.JOB_CONFLICT);
    }
  }

  startHeartbeat(tenantId: string, id: string): { stop: () => void; failed: () => boolean } {
    const { heartbeatMs } = jobLeaseConfig();
    let failed = false;
    const timer = setInterval(() => {
      void this.heartbeat(tenantId, id).catch(() => {
        failed = true;
      });
    }, heartbeatMs);
    timer.unref?.();
    return {
      stop: () => clearInterval(timer),
      failed: () => failed,
    };
  }

  async setProgress(tenantId: string, id: string, progress: number) {
    await this.prisma.job.updateMany({
      where: { id, tenantId, status: JobStatus.RUNNING },
      data: { progress },
    });
  }

  async mergeOutput(tenantId: string, id: string, output: Prisma.InputJsonValue, progress?: number) {
    await this.prisma.job.updateMany({
      where: { id, tenantId, status: JobStatus.RUNNING },
      data: {
        output,
        ...(progress != null ? { progress } : {}),
      },
    });
  }

  async complete(tenantId: string, id: string, output: Prisma.InputJsonValue) {
    const updated = await this.prisma.job.updateMany({
      where: { id, tenantId, status: JobStatus.RUNNING },
      data: {
        status: JobStatus.COMPLETED,
        progress: 100,
        output,
        completedAt: new Date(),
        lockedAt: null,
        lastHeartbeatAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw new AppError(ErrorCode.JOB_CONFLICT);
    }
    return this.getById(tenantId, id);
  }

  async fail(tenantId: string, id: string, error: Prisma.InputJsonValue) {
    await this.prisma.job.updateMany({
      where: {
        id,
        tenantId,
        status: { in: [JobStatus.PENDING, JobStatus.RUNNING] },
      },
      data: {
        status: JobStatus.FAILED,
        error,
        completedAt: new Date(),
        lockedAt: null,
      },
    });
    return this.getById(tenantId, id);
  }

  async findLatestForVideo(tenantId: string, videoId: string, kind: JobKind = JobKind.VIDEO_GENERATION) {
    return this.prisma.job.findFirst({
      where: { tenantId, videoId, kind },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findIdempotent(input: {
    tenantId: string;
    workspaceId: string;
    scriptId: string;
    requestId: string;
  }) {
    return this.prisma.job.findFirst({
      where: {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        scriptId: input.scriptId,
        requestId: input.requestId,
        kind: JobKind.VIDEO_GENERATION,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
