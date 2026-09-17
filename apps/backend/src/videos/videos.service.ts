import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { AssetLinkRole, AssetStatus, AssetType, JobKind, PrismaClient, VideoStatus } from '@prisma/client';
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
import { ProductionDirectorService } from './director/production-director.service.js';
import type { ProductionPreferences } from './director/production-director.types.js';
import { ensureTimelineSnapshot, toTimelinePublicView } from './timeline-public.js';
import { asPipelineOutput } from './pipeline/stage-context.js';
import { toQualityPublicView } from './quality/quality-public.js';
import { toPublicFinalAcceptance, isIdempotentCurrentAccept } from './video-final-acceptance.js';
import { isScriptEligibleForProduction } from '../scripts/human-approval.js';
import { isScriptDomainMismatch } from './pipeline/script-domain-gate.js';
import { UsageMeteringService } from '../usage/usage-metering.service.js';
import type { VideoProductionPlan } from './pipeline/production-plan.types.js';
import type { ProductionDirectorOutput } from './director/production-director.types.js';

@Injectable()
export class VideosService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobs: JobsService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly storage: StorageService,
    private readonly director: ProductionDirectorService,
    @Optional() private readonly metering?: UsageMeteringService,
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

  async acceptFinal(auth: AuthContext, id: string, workspaceHint?: string): Promise<VideoPublic> {
    const video = await this.requireVideo(auth, id, workspaceHint);
    if (video.status !== VideoStatus.COMPLETED || !video.outputAssetId) {
      throw new AppError(ErrorCode.VIDEO_FINAL_ACCEPTANCE_NOT_AVAILABLE);
    }
    const assetId = video.outputAssetId;
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId: auth.tenantId, workspaceId: video.workspaceId, deletedAt: null },
    });
    if (!asset || asset.type !== AssetType.VIDEO || asset.status !== AssetStatus.READY) {
      throw new AppError(ErrorCode.VIDEO_FINAL_ACCEPTANCE_NOT_AVAILABLE);
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
      throw new AppError(ErrorCode.VIDEO_FINAL_ACCEPTANCE_NOT_AVAILABLE);
    }
    let exists = false;
    try {
      exists = await this.storage.exists(asset.storageKey);
    } catch {
      throw new AppError(ErrorCode.VIDEO_FINAL_ACCEPTANCE_NOT_AVAILABLE);
    }
    if (!exists) {
      throw new AppError(ErrorCode.VIDEO_FINAL_ACCEPTANCE_NOT_AVAILABLE);
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.videoFinalAcceptance.findFirst({
        where: { tenantId: auth.tenantId, videoId: video.id },
      });
      if (isIdempotentCurrentAccept(existing, asset.id)) {
        return;
      }
      await tx.videoFinalAcceptance.updateMany({
        where: {
          tenantId: auth.tenantId,
          projectId: video.projectId,
          scriptId: video.scriptId,
          current: true,
          videoId: { not: video.id },
        },
        data: { current: false, supersededAt: now },
      });
      if (existing) {
        await tx.videoFinalAcceptance.update({
          where: { id_tenantId: { id: existing.id, tenantId: auth.tenantId } },
          data: {
            acceptedArtifactId: asset.id,
            variant: 'VERTICAL',
            status: 'ACCEPTED',
            current: true,
            acceptedAt: now,
            acceptedByUserId: auth.userId,
            supersededAt: null,
            scriptId: video.scriptId,
          },
        });
        return;
      }
      await tx.videoFinalAcceptance.create({
        data: {
          tenantId: auth.tenantId,
          workspaceId: video.workspaceId,
          projectId: video.projectId,
          scriptId: video.scriptId,
          videoId: video.id,
          acceptedArtifactId: asset.id,
          variant: 'VERTICAL',
          status: 'ACCEPTED',
          current: true,
          acceptedAt: now,
          acceptedByUserId: auth.userId,
        },
      });
    });
    return this.toPublic(auth.tenantId, video);
  }

  async getUsageSummary(auth: AuthContext, id: string, workspaceHint?: string) {
    await this.requireVideo(auth, id, workspaceHint);
    if (!this.metering) {
      return {
        usageCount: 0,
        unpricedUsageCount: 0,
        totalsByCurrency: [],
        mixedCurrency: false,
        breakdownByResource: [],
        breakdownByProvider: [],
        breakdownByOperation: [],
      };
    }
    const summary = await this.metering.getVideoUsageSummary(auth.tenantId, id);
    return this.metering.toPublicSummary(summary);
  }

  async getQuality(auth: AuthContext, id: string, workspaceHint?: string) {
    const video = await this.requireVideo(auth, id, workspaceHint);
    const job = await this.loadGenerationJob(auth.tenantId, video.id, video.sourceJobId);
    const output = job ? asPipelineOutput(job.output) : asPipelineOutput({});
    return toQualityPublicView(output.qualityGate, video.status === VideoStatus.COMPLETED);
  }

  async export(
    auth: AuthContext,
    id: string,
    workspaceHint?: string,
    variant?: string,
  ): Promise<{ body: Buffer; mimeType: string; filename: string; contentDisposition: string }> {
    const video = await this.requireVideo(auth, id, workspaceHint);
    if (video.status !== VideoStatus.COMPLETED || !video.outputAssetId) {
      throw new AppError(ErrorCode.VIDEO_EXPORT_NOT_AVAILABLE);
    }
    const landscapeWanted = variant === 'landscape';
    const landscapeLink = landscapeWanted
      ? await this.prisma.assetLink.findFirst({
          where: {
            tenantId: auth.tenantId,
            videoId: video.id,
            role: AssetLinkRole.VIDEO_PREVIEW,
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    const assetId = landscapeWanted ? landscapeLink?.assetId : video.outputAssetId;
    if (!assetId) {
      throw new AppError(ErrorCode.VIDEO_EXPORT_NOT_AVAILABLE);
    }
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId: auth.tenantId, workspaceId: video.workspaceId, deletedAt: null },
    });
    if (!asset || asset.type !== AssetType.VIDEO || asset.status !== AssetStatus.READY) {
      throw new AppError(ErrorCode.VIDEO_EXPORT_NOT_AVAILABLE);
    }
    const outputLink = landscapeWanted
      ? landscapeLink
      : await this.prisma.assetLink.findFirst({
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
    const script = video.scriptId
      ? await this.prisma.script.findFirst({
          where: { id: video.scriptId, tenantId: auth.tenantId, deletedAt: null },
          select: { title: true },
        })
      : null;
    const filename = videoExportFilename(script?.title, landscapeWanted ? 'landscape' : 'vertical');
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
      preferences?: ProductionPreferences;
      preferredAssetIds?: string[];
      excludedAssetIds?: string[];
      referenceIds?: string[];
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
    await this.assertScriptDomain(auth.tenantId, workspaceId, script.projectId, script.payload);
    const videoId = randomUUID();
    // Director plans first (deterministic); executable pipeline plan remains buildProductionPlan.
    let directorPlan = null as Awaited<ReturnType<ProductionDirectorService['buildPlan']>>['directorPlan'] | null;
    try {
      const built = await this.director.buildPlan(
        auth,
        {
          scriptId: script.id,
          videoId,
          preferences: input.preferences,
          preferredAssetIds: input.preferredAssetIds,
          excludedAssetIds: input.excludedAssetIds,
          referenceIds: input.referenceIds,
          aspectRatio: input.aspectRatio,
          targetDuration: input.targetDuration,
        },
        meta.workspaceHint,
      );
      directorPlan = built.directorPlan;
    } catch {
      directorPlan = null;
    }
    const productionPlan = buildProductionPlan({
      scriptId: script.id,
      videoId,
      scriptVersion: script.version,
      payload: script.payload,
      config: {
        ...input,
        preferredVoiceId: input.preferences?.preferredVoiceId ?? directorPlan?.voiceId,
      },
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
        preferredAssetIds: input.preferredAssetIds,
        excludedAssetIds: input.excludedAssetIds,
        preferences: input.preferences,
        productionPlan,
        generationVersion: productionPlan.generationVersion,
        ...(directorPlan
          ? {
              directorPlan,
              directorContextHash: directorPlan.contextSnapshot.contextHash,
            }
          : {}),
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
    let directorPlan = null as Awaited<ReturnType<ProductionDirectorService['buildPlan']>>['directorPlan'] | null;
    try {
      const built = await this.director.buildPlan(
        auth,
        { scriptId: script.id, videoId: video.id },
        meta.workspaceHint,
      );
      directorPlan = built.directorPlan;
    } catch {
      directorPlan = null;
    }
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
        ...(directorPlan
          ? {
              directorPlan,
              directorContextHash: directorPlan.contextSnapshot.contextHash,
            }
          : {}),
      },
    });
    await this.prisma.video.update({
      where: { id_tenantId: { id: video.id, tenantId: auth.tenantId } },
      data: { sourceJobId: job.id, status: VideoStatus.PENDING },
    });
    await this.dispatch(auth.tenantId, job.id, video.id);
    return this.getById(auth, video.id, meta.workspaceHint);
  }

  async getProductionPlan(auth: AuthContext, id: string, workspaceHint?: string) {
    return this.director.ensurePlanForVideo(auth, id, workspaceHint);
  }

  async getTimeline(auth: AuthContext, id: string, workspaceHint?: string) {
    const video = await this.requireVideo(auth, id, workspaceHint);
    if (!video.scriptId) {
      throw new AppError(ErrorCode.VIDEO_CONFLICT);
    }
    const script = await this.prisma.script.findFirst({
      where: { id: video.scriptId, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!script) {
      throw new AppError(ErrorCode.SCRIPT_NOT_FOUND);
    }
    const job = video.sourceJobId
      ? await this.prisma.job.findFirst({ where: { id: video.sourceJobId, tenantId: auth.tenantId } })
      : null;
    const input = job?.input && typeof job.input === 'object' && !Array.isArray(job.input) ? (job.input as Record<string, unknown>) : {};
    const fromJob = input.productionPlan as VideoProductionPlan | undefined;
    const productionPlan =
      fromJob?.scenes?.length
        ? fromJob
        : buildProductionPlan({
            scriptId: script.id,
            videoId: video.id,
            scriptVersion: script.version,
            payload: script.payload,
          });
    const output = job ? asPipelineOutput(job.output) : asPipelineOutput({});
    if (output.editingTimeline && output.materialResolution) {
      return toTimelinePublicView(output.editingTimeline, output.materialResolution);
    }
    const built = await ensureTimelineSnapshot({
      prisma: this.prisma,
      tenantId: auth.tenantId,
      workspaceId: video.workspaceId,
      projectId: video.projectId,
      plan: productionPlan,
      directorPlan: (input.directorPlan as ProductionDirectorOutput | undefined) ?? null,
      directorHash: typeof input.directorContextHash === 'string' ? input.directorContextHash : undefined,
    });
    if (job) {
      output.materialResolution = built.materials;
      output.editingTimeline = built.timeline;
      await this.prisma.job.update({
        where: { id_tenantId: { id: job.id, tenantId: job.tenantId } },
        data: { output: output as never },
      });
    }
    return toTimelinePublicView(built.timeline, built.materials);
  }

  async rebuildProductionPlan(
    auth: AuthContext,
    id: string,
    input: { regenerate?: boolean; preferences?: ProductionPreferences } | undefined,
    workspaceHint?: string,
  ) {
    const video = await this.requireVideo(auth, id, workspaceHint);
    if (!video.scriptId) {
      throw new AppError(ErrorCode.VIDEO_CONFLICT);
    }
    let previousHash: string | undefined;
    if (video.sourceJobId) {
      const job = await this.prisma.job.findFirst({
        where: { id: video.sourceJobId, tenantId: auth.tenantId },
        select: { input: true },
      });
      const prev = job?.input;
      if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
        previousHash =
          typeof (prev as { directorContextHash?: unknown }).directorContextHash === 'string'
            ? (prev as { directorContextHash: string }).directorContextHash
            : undefined;
      }
    }
    const built = await this.director.buildPlan(
      auth,
      {
        scriptId: video.scriptId,
        videoId: video.id,
        regenerate: input?.regenerate === true,
        previousContextHash: previousHash,
        preferences: input?.preferences,
      },
      workspaceHint,
    );
    if (video.sourceJobId && (built.created || input?.regenerate)) {
      const job = await this.prisma.job.findFirst({
        where: { id: video.sourceJobId, tenantId: auth.tenantId },
      });
      if (job) {
        const prev =
          job.input && typeof job.input === 'object' && !Array.isArray(job.input)
            ? (job.input as Record<string, unknown>)
            : {};
        await this.prisma.job.update({
          where: { id_tenantId: { id: job.id, tenantId: auth.tenantId } },
          data: {
            input: {
              ...prev,
              directorPlan: built.directorPlan,
              directorContextHash: built.directorPlan.contextSnapshot.contextHash,
            },
          },
        });
      }
    }
    return {
      ...built.publicView,
      created: built.created,
    };
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
    const [script, generationJob, outputAsset, landscapeLink, acceptance] = await Promise.all([
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
      this.prisma.assetLink.findFirst({
        where: { tenantId, videoId: video.id, role: AssetLinkRole.VIDEO_PREVIEW },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.videoFinalAcceptance.findFirst({
        where: { tenantId, videoId: video.id },
      }),
    ]);
    const landscapeAsset = landscapeLink?.assetId
      ? await this.prisma.asset.findFirst({
          where: { id: landscapeLink.assetId, tenantId, deletedAt: null },
        })
      : null;
    return toPublicVideo(video, {
      scriptTitle: script?.title ?? null,
      job: generationJob,
      outputAsset,
      landscapeAsset,
      quality: toQualityPublicView(
        generationJob ? asPipelineOutput(generationJob.output).qualityGate : undefined,
        video.status === VideoStatus.COMPLETED,
      ),
      finalAcceptance: toPublicFinalAcceptance(acceptance),
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
    if (!isScriptEligibleForProduction(script.status)) {
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

  private async assertScriptDomain(
    tenantId: string,
    workspaceId: string,
    projectId: string,
    payload: unknown,
  ) {
    const [project, brief] = await Promise.all([
      this.prisma.project.findFirst({
        where: { id: projectId, tenantId, workspaceId, deletedAt: null },
        select: { name: true, industry: true, description: true },
      }),
      this.prisma.productBrief.findFirst({
        where: { tenantId, workspaceId, projectId },
        orderBy: { version: 'desc' },
        select: { payload: true },
      }),
    ]);
    const context = JSON.stringify({
      name: project?.name,
      industry: project?.industry,
      description: project?.description,
      brief: brief?.payload,
    });
    if (isScriptDomainMismatch(payload, context)) {
      throw new AppError(ErrorCode.VIDEO_PLAN_INVALID);
    }
  }
}
