import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AssetLinkRole, AssetStatus, AssetType, JobKind, PrismaClient, ScriptStatus, VideoStatus } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import type { JobQueue } from '../jobs/queue/job-queue.js';
import { JOB_QUEUE } from '../jobs/queue/queue.constants.js';
import { JobsService } from '../jobs/jobs.service.js';
import { StorageService } from '../media/storage/storage.service.js';
import { SCRIPT_TARGET_DURATIONS } from '../agents/agent.types.js';
import { buildProductionPlan } from './pipeline/production-plan.builder.js';
import { attachmentContentDisposition, videoExportFilename } from './video-export.js';
import { toPublicVideo, type VideoPublic } from './videos.mapper.js';

@Injectable()
export class VideosService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobs: JobsService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly storage: StorageService,
  ) {}

  async list(
    auth: AuthContext,
    query: { projectId: string; scriptId?: string; status?: VideoStatus },
    workspaceHint?: string,
  ): Promise<VideoPublic[]> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    await this.requireProject(auth.tenantId, workspaceId, query.projectId);
    const rows = await this.prisma.video.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId: query.projectId,
        scriptId: query.scriptId,
        status: query.status,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((row) => this.toPublic(auth.tenantId, row)));
  }

  async getById(auth: AuthContext, id: string, workspaceHint?: string): Promise<VideoPublic> {
    const video = await this.requireVideo(auth, id, workspaceHint);
    return this.toPublic(auth.tenantId, video);
  }

  async export(
    auth: AuthContext,
    id: string,
    workspaceHint?: string,
  ): Promise<{ body: Buffer; mimeType: string; filename: string; contentDisposition: string }> {
    const video = await this.requireVideo(auth, id, workspaceHint);
    if (video.status !== VideoStatus.COMPLETED || !video.outputAssetId) {
      throw new AppError(ErrorCode.VIDEO_EXPORT_NOT_AVAILABLE);
    }
    const asset = await this.prisma.asset.findFirst({
      where: { id: video.outputAssetId, tenantId: auth.tenantId, workspaceId: video.workspaceId, deletedAt: null },
    });
    if (!asset || asset.type !== AssetType.VIDEO || asset.status !== AssetStatus.READY) {
      throw new AppError(ErrorCode.VIDEO_EXPORT_NOT_AVAILABLE);
    }
    const outputLink = await this.prisma.assetLink.findFirst({
      where: {
        tenantId: auth.tenantId,
        videoId: video.id,
        assetId: asset.id,
        role: AssetLinkRole.VIDEO_OUTPUT,
      },
    });
    if (!outputLink) {
      throw new AppError(ErrorCode.VIDEO_EXPORT_NOT_AVAILABLE);
    }
    let exists = false;
    try {
      exists = await this.storage.exists(asset.storageKey);
    } catch {
      throw new AppError(ErrorCode.VIDEO_EXPORT_NOT_AVAILABLE);
    }
    if (!exists) {
      throw new AppError(ErrorCode.VIDEO_EXPORT_NOT_AVAILABLE);
    }
    const body = await this.storage.get(asset.storageKey);
    const filename = videoExportFilename(video.id);
    return {
      body,
      mimeType: asset.mimeType || 'video/mp4',
      filename,
      contentDisposition: attachmentContentDisposition(filename),
    };
  }

  async create(
    auth: AuthContext,
    input: {
      scriptId: string;
      voiceStyle?: string;
      visualStyle?: string;
      aspectRatio?: string;
      resolution?: string;
      targetDuration?: number;
      requirements?: string;
    },
    meta: { requestId: string; workspaceHint?: string },
  ): Promise<VideoPublic> {
    const workspaceId = resolveWorkspaceId(auth, meta.workspaceHint);
    const script = await this.requireConfirmedScript(auth.tenantId, workspaceId, input.scriptId);
    if (
      input.targetDuration != null &&
      !(SCRIPT_TARGET_DURATIONS as readonly number[]).includes(input.targetDuration)
    ) {
      throw new AppError(ErrorCode.SCRIPT_DURATION_NOT_AVAILABLE);
    }
    const existing = await this.jobs.findIdempotent({
      tenantId: auth.tenantId,
      workspaceId,
      scriptId: script.id,
      requestId: meta.requestId,
    });
    if (existing?.videoId) {
      const video = await this.prisma.video.findFirst({
        where: { id: existing.videoId, tenantId: auth.tenantId, workspaceId, deletedAt: null },
      });
      if (video) {
        return this.toPublic(auth.tenantId, video);
      }
    }
    const videoId = randomUUID();
    const productionPlan = buildProductionPlan({
      scriptId: script.id,
      videoId,
      scriptVersion: script.version,
      payload: script.payload,
      config: input,
    });
    const video = await this.prisma.video.create({
      data: {
        id: videoId,
        tenantId: auth.tenantId,
        workspaceId,
        projectId: script.projectId,
        scriptId: script.id,
        status: VideoStatus.PENDING,
      },
    });
    const job = await this.jobs.create({
      tenantId: auth.tenantId,
      workspaceId,
      projectId: script.projectId,
      kind: JobKind.VIDEO_GENERATION,
      requestId: meta.requestId,
      provider: 'mock-pipeline',
      scriptId: script.id,
      videoId: video.id,
      input: {
        voiceStyle: input.voiceStyle,
        visualStyle: input.visualStyle,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        targetDuration: input.targetDuration,
        requirements: input.requirements,
        productionPlan,
        generationVersion: productionPlan.generationVersion,
      },
    });
    await this.prisma.video.update({
      where: { id_tenantId: { id: video.id, tenantId: auth.tenantId } },
      data: { sourceJobId: job.id },
    });
    await this.dispatch(auth.tenantId, job.id, video.id);
    return this.getById(auth, video.id, meta.workspaceHint);
  }

  async retry(auth: AuthContext, id: string, meta: { requestId: string; workspaceHint?: string }) {
    const video = await this.requireVideo(auth, id, meta.workspaceHint);
    if (video.status === VideoStatus.COMPLETED && video.outputAssetId) {
      throw new AppError(ErrorCode.VIDEO_CONFLICT);
    }
    if (!video.scriptId) {
      throw new AppError(ErrorCode.VIDEO_CONFLICT);
    }
    const script = await this.requireConfirmedScript(auth.tenantId, video.workspaceId, video.scriptId);
    const productionPlan = buildProductionPlan({
      scriptId: script.id,
      videoId: video.id,
      scriptVersion: script.version,
      payload: script.payload,
    });
    const job = await this.jobs.create({
      tenantId: auth.tenantId,
      workspaceId: video.workspaceId,
      projectId: video.projectId,
      kind: JobKind.VIDEO_GENERATION,
      requestId: meta.requestId,
      provider: 'mock-pipeline',
      scriptId: video.scriptId,
      videoId: video.id,
      input: {
        retryOf: video.sourceJobId,
        productionPlan,
        generationVersion: productionPlan.generationVersion,
      },
    });
    await this.prisma.video.update({
      where: { id_tenantId: { id: video.id, tenantId: auth.tenantId } },
      data: { sourceJobId: job.id, status: VideoStatus.PENDING },
    });
    await this.dispatch(auth.tenantId, job.id, video.id);
    return this.getById(auth, video.id, meta.workspaceHint);
  }

  private async dispatch(tenantId: string, jobId: string, videoId: string): Promise<void> {
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
      await this.prisma.video.updateMany({
        where: { id: videoId, tenantId, outputAssetId: null, deletedAt: null },
        data: { status: VideoStatus.FAILED },
      });
      throw error instanceof AppError ? error : new AppError(ErrorCode.JOB_ENQUEUE_FAILED);
    }
  }

  private async toPublic(tenantId: string, video: {
    id: string;
    tenantId: string;
    workspaceId: string;
    projectId: string;
    scriptId: string | null;
    outputAssetId: string | null;
    sourceJobId: string | null;
    duration: number | null;
    width: number | null;
    height: number | null;
    status: VideoStatus;
    createdAt: Date;
    updatedAt: Date;
    filePath?: string | null;
    deletedAt?: Date | null;
  }): Promise<VideoPublic> {
    const [script, generationJob, outputAsset] = await Promise.all([
      video.scriptId
        ? this.prisma.script.findFirst({
            where: { id: video.scriptId, tenantId, deletedAt: null },
            select: { title: true },
          })
        : Promise.resolve(null),
      this.loadGenerationJob(tenantId, video.id, video.sourceJobId),
      video.outputAssetId
        ? this.prisma.asset.findFirst({
            where: { id: video.outputAssetId, tenantId, deletedAt: null },
          })
        : Promise.resolve(null),
    ]);
    return toPublicVideo(video, {
      scriptTitle: script?.title ?? null,
      job: generationJob,
      outputAsset,
    });
  }

  private async loadGenerationJob(tenantId: string, videoId: string, sourceJobId: string | null) {
    if (sourceJobId) {
      const bySource = await this.prisma.job.findFirst({
        where: { id: sourceJobId, tenantId, kind: JobKind.VIDEO_GENERATION },
      });
      if (bySource) {
        return bySource;
      }
    }
    return this.jobs.findLatestForVideo(tenantId, videoId, JobKind.VIDEO_GENERATION);
  }

  private async requireConfirmedScript(tenantId: string, workspaceId: string, scriptId: string) {
    if (!isUuid(scriptId)) {
      throw new AppError(ErrorCode.SCRIPT_NOT_FOUND);
    }
    const script = await this.prisma.script.findFirst({
      where: { id: scriptId, tenantId, workspaceId, deletedAt: null },
    });
    if (!script) {
      throw new AppError(ErrorCode.SCRIPT_NOT_FOUND);
    }
    if (script.status !== ScriptStatus.CONFIRMED) {
      throw new AppError(ErrorCode.VIDEO_SCRIPT_NOT_CONFIRMED);
    }
    await this.requireProject(tenantId, workspaceId, script.projectId);
    return script;
  }

  private async requireVideo(auth: AuthContext, id: string, workspaceHint?: string) {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.VIDEO_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const video = await this.prisma.video.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId, deletedAt: null },
    });
    if (!video) {
      throw new AppError(ErrorCode.VIDEO_NOT_FOUND);
    }
    return video;
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
    return project;
  }
}
