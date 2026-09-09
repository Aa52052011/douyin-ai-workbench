import { Injectable } from '@nestjs/common';
import { JobStatus, PrismaClient, VideoStatus } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { JobsService } from '../jobs/jobs.service.js';
import { StorageService } from '../media/storage/storage.service.js';
import { finalizeJob } from './finalize-video-job.js';
import { asPipelineOutput, mockFailStage, mockFailVisualAfter, type StageContext } from './pipeline/stage-context.js';
import type { JobPipelineOutput, PipelineStageName, VideoProductionPlan } from './pipeline/production-plan.types.js';
import { CompositionStage } from './pipeline/stages/compose.stage.js';
import { SubtitleGenerationStage } from './pipeline/stages/subtitle.stage.js';
import { VisualGenerationStage } from './pipeline/stages/visual.stage.js';
import { VoiceGenerationStage } from './pipeline/stages/voice.stage.js';

const PROGRESS: Record<PipelineStageName | 'finalize', number> = {
  visual: 30,
  voice: 55,
  subtitle: 70,
  compose: 95,
  finalize: 100,
};

@Injectable()
export class VideoGenerationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobs: JobsService,
    private readonly storage: StorageService,
    private readonly visual: VisualGenerationStage,
    private readonly voice: VoiceGenerationStage,
    private readonly subtitle: SubtitleGenerationStage,
    private readonly compose: CompositionStage,
  ) {}

  async run(tenantId: string, jobId: string): Promise<void> {
    const job = await this.jobs.claim(tenantId, jobId);
    const heartbeat = this.jobs.startHeartbeat(tenantId, jobId);
    try {
      if (!job.videoId || !job.scriptId) {
        throw new AppError(ErrorCode.JOB_CONFLICT);
      }
      const plan = readPlan(job.input);
      if (!plan || plan.videoId !== job.videoId || plan.scriptId !== job.scriptId) {
        throw new AppError(ErrorCode.VIDEO_PLAN_INVALID);
      }
      const video = await this.prisma.video.findFirst({
        where: { id: job.videoId, tenantId, deletedAt: null },
      });
      if (!video || video.tenantId !== job.tenantId || video.workspaceId !== job.workspaceId || video.projectId !== job.projectId) {
        throw new AppError(ErrorCode.VIDEO_NOT_FOUND);
      }
      const ctx: StageContext = {
        prisma: this.prisma,
        jobs: this.jobs,
        storage: this.storage,
        job,
        plan,
        generationVersion: plan.generationVersion,
        failStage: mockFailStage(readRequirements(job.input)),
        failVisualAfter: mockFailVisualAfter(readRequirements(job.input)),
      };
      await this.beginStage(ctx, 'visual');
      const visualIds = await this.visual.run(ctx);
      await this.checkpoint(ctx, 'visual', { assetIds: visualIds }, PROGRESS.visual);
      this.assertHeartbeat(heartbeat);

      await this.beginStage(ctx, 'voice');
      const voice = await this.voice.run(ctx);
      await this.checkpoint(
        ctx,
        'voice',
        {
          assetIds: [voice.assetId],
          duration: voice.duration,
          provider: voice.provider,
          model: voice.model,
        },
        PROGRESS.voice,
        {
          audioCharacters: voice.usage?.audioCharacters ?? plan.voice.text.length,
          audioSeconds: voice.duration,
        },
      );
      this.assertHeartbeat(heartbeat);

      await this.beginStage(ctx, 'subtitle');
      const subtitleId = await this.subtitle.run(
        ctx,
        voice.durationExact ?? voice.duration,
        voice.assetId,
      );
      await this.checkpoint(ctx, 'subtitle', { assetIds: [subtitleId] }, PROGRESS.subtitle);
      this.assertHeartbeat(heartbeat);

      await this.beginStage(ctx, 'compose');
      const composed = await this.compose.run(ctx, {
        voiceDuration: voice.duration,
        failToken: readRequirements(job.input),
      });
      await this.checkpoint(
        ctx,
        'compose',
        { assetIds: [composed.assetId], duration: composed.duration },
        PROGRESS.compose,
        { videoSeconds: composed.duration, imageCount: visualIds.length },
      );
      this.assertHeartbeat(heartbeat);

      await this.beginStage(ctx, 'finalize');
      if (ctx.failStage === 'finalize') {
        throw new AppError(ErrorCode.VIDEO_PROVIDER_FAILED);
      }

      const output = asPipelineOutput(ctx.job.output);
      output.currentStage = 'finalize';
      output.timeline = {
        targetDuration: plan.targetDuration,
        voiceDuration: voice.duration,
        composeDuration: composed.duration,
      };
      output.usage.estimatedCost = 0;
      await this.jobs.mergeOutput(tenantId, jobId, output as never, PROGRESS.compose);
      ctx.job = await this.jobs.getById(tenantId, jobId);

      await finalizeJob(this.prisma, {
        tenantId,
        jobId,
        outputAssetId: composed.assetId,
        duration: composed.duration,
        width: composed.width,
        height: composed.height,
      });
    } catch (error) {
      const latest = await this.jobs.getById(tenantId, jobId).catch(() => job);
      if (latest.status === JobStatus.COMPLETED) {
        return;
      }
      const payload = publicError(error);
      await this.jobs.fail(tenantId, jobId, payload);
      if (job.videoId) {
        await this.prisma.video.updateMany({
          where: { id: job.videoId, tenantId, outputAssetId: null, deletedAt: null },
          data: { status: VideoStatus.FAILED },
        });
      }
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(ErrorCode.VIDEO_PROVIDER_FAILED);
    } finally {
      heartbeat.stop();
    }
  }

  private async beginStage(ctx: StageContext, stage: PipelineStageName | 'finalize') {
    const output = asPipelineOutput(ctx.job.output);
    output.currentStage = stage;
    if (stage !== 'finalize') {
      const existing = output.stages[stage];
      if (!existing || existing.status !== 'completed') {
        output.stages[stage] = {
          status: 'running',
          assetIds: existing?.assetIds ?? [],
          startedAt: existing?.startedAt ?? new Date().toISOString(),
          provider: existing?.provider,
          model: existing?.model,
          scenes: existing?.scenes,
        };
      }
    }
    const progress =
      stage === 'visual'
        ? 5
        : stage === 'voice'
          ? PROGRESS.visual
          : stage === 'subtitle'
            ? PROGRESS.voice
            : stage === 'compose'
              ? PROGRESS.subtitle
              : PROGRESS.compose;
    await this.jobs.mergeOutput(ctx.job.tenantId, ctx.job.id, output as never, progress);
    ctx.job = await this.jobs.getById(ctx.job.tenantId, ctx.job.id);
  }

  private async checkpoint(
    ctx: StageContext,
    stage: PipelineStageName,
    data: { assetIds: string[]; duration?: number; provider?: string; model?: string },
    progress: number,
    usage?: Partial<JobPipelineOutput['usage']>,
  ) {
    const output = asPipelineOutput(ctx.job.output);
    const existing = output.stages[stage];
    output.currentStage = stage;
    output.stages[stage] = {
      status: 'completed',
      assetIds: data.assetIds,
      duration: data.duration ?? existing?.duration,
      startedAt: existing?.startedAt,
      completedAt: new Date().toISOString(),
      provider: data.provider ?? existing?.provider,
      model: data.model ?? existing?.model,
      scenes: existing?.scenes,
    };
    output.usage = { ...output.usage, ...usage, estimatedCost: 0 };
    await this.jobs.mergeOutput(ctx.job.tenantId, ctx.job.id, output as never, progress);
    ctx.job = await this.jobs.getById(ctx.job.tenantId, ctx.job.id);
  }

  private assertHeartbeat(heartbeat: { failed: () => boolean }) {
    if (heartbeat.failed()) {
      throw new AppError(ErrorCode.JOB_CONFLICT);
    }
  }
}

function readPlan(input: unknown): VideoProductionPlan | null {
  if (!input || typeof input !== 'object' || !('productionPlan' in input)) {
    return null;
  }
  return (input as { productionPlan: VideoProductionPlan }).productionPlan;
}

function readRequirements(input: unknown): string | undefined {
  if (!input || typeof input !== 'object' || !('requirements' in input)) {
    return undefined;
  }
  const value = (input as { requirements?: unknown }).requirements;
  return typeof value === 'string' ? value : undefined;
}

function publicError(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) {
    const body = error.getResponse() as { code: string; message: string };
    return { code: body.code, message: body.message };
  }
  return { code: ErrorCode.VIDEO_PROVIDER_FAILED, message: 'Video provider failed' };
}
