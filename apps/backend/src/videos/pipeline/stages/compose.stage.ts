import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AssetType } from '@prisma/client';
import { AppError, ErrorCode } from '../../../common/errors/app-error.js';
import { COMPOSE_PROVIDER } from '../../../media/providers/compose.token.js';
import type { ComposeProvider } from '../../../media/providers/media-provider.types.js';
import { buildStorageKey } from '../../../media/storage/storage-key.js';
import { reusableAssetIds } from '../asset-reuse.js';
import { asPipelineOutput, type StageContext } from '../stage-context.js';

@Injectable()
export class CompositionStage {
  constructor(@Inject(COMPOSE_PROVIDER) private readonly compose: ComposeProvider) {}

  async run(
    ctx: StageContext,
    input: { voiceDuration: number; failToken?: string },
  ): Promise<{ assetId: string; duration: number; width: number; height: number }> {
    const output = asPipelineOutput(ctx.job.output);
    const reused = await reusableAssetIds(ctx, output.stages.compose?.assetIds);
    if (reused?.[0]) {
      const asset = await ctx.prisma.asset.findFirst({
        where: { id: reused[0], tenantId: ctx.job.tenantId, workspaceId: ctx.job.workspaceId, projectId: ctx.job.projectId },
      });
      return {
        assetId: reused[0],
        duration: asset?.duration ?? output.stages.compose?.duration ?? input.voiceDuration,
        width: asset?.width ?? 1080,
        height: asset?.height ?? 1920,
      };
    }
    if (ctx.failStage === 'compose') {
      throw new AppError(ErrorCode.VIDEO_PROVIDER_FAILED);
    }
    const visualIds = output.stages.visual?.assetIds ?? [];
    const voiceId = output.stages.voice?.assetIds?.[0];
    const subtitleId = output.stages.subtitle?.assetIds?.[0];
    if (visualIds.length !== ctx.plan.scenes.length || !voiceId || !subtitleId) {
      throw new AppError(ErrorCode.VIDEO_PLAN_INVALID);
    }
    const [visuals, voice, subtitle] = await Promise.all([
      Promise.all(
        visualIds.map((id) =>
          ctx.prisma.asset.findFirst({
            where: { id, tenantId: ctx.job.tenantId, workspaceId: ctx.job.workspaceId, projectId: ctx.job.projectId, deletedAt: null },
          }),
        ),
      ),
      ctx.prisma.asset.findFirst({
        where: { id: voiceId, tenantId: ctx.job.tenantId, workspaceId: ctx.job.workspaceId, projectId: ctx.job.projectId, deletedAt: null },
      }),
      ctx.prisma.asset.findFirst({
        where: { id: subtitleId, tenantId: ctx.job.tenantId, workspaceId: ctx.job.workspaceId, projectId: ctx.job.projectId, deletedAt: null },
      }),
    ]);
    if (visuals.some((item) => !item) || !voice || !subtitle) {
      throw new AppError(ErrorCode.ASSET_NOT_FOUND);
    }
    const assetId = randomUUID();
    const key = buildStorageKey({
      tenantId: ctx.job.tenantId,
      workspaceId: ctx.job.workspaceId,
      projectId: ctx.job.projectId,
      assetId,
    });
    const rendered = await this.compose.compose({
      storageKey: key,
      voiceDuration: input.voiceDuration,
      targetDuration: ctx.plan.targetDuration,
      sceneCount: ctx.plan.scenes.length,
      clientRequestId: `${ctx.job.id}:compose:${ctx.generationVersion}`,
      failToken: input.failToken,
      resolution: ctx.plan.resolution,
      aspectRatio: ctx.plan.aspectRatio,
      fps: ctx.plan.fps,
      scenes: ctx.plan.scenes.map((scene, index) => ({
        storageKey: visuals[index]!.storageKey,
        durationBudget: scene.durationBudget,
        mimeType: visuals[index]!.mimeType ?? undefined,
      })),
      voiceStorageKey: voice.storageKey,
      voiceMimeType: voice.mimeType ?? undefined,
      subtitleStorageKey: subtitle.storageKey,
    });
    try {
      await ctx.prisma.asset.create({
        data: {
          id: assetId,
          tenantId: ctx.job.tenantId,
          workspaceId: ctx.job.workspaceId,
          projectId: ctx.job.projectId,
          type: AssetType.VIDEO,
          status: 'READY',
          storageProvider: 'local',
          storageKey: rendered.storageKey,
          originalFilename: 'output.mp4',
          mimeType: rendered.mimeType,
          size: rendered.size,
          duration: rendered.duration,
          width: rendered.width,
          height: rendered.height,
          metadata: {
            jobId: ctx.job.id,
            videoId: ctx.plan.videoId,
            stage: 'compose',
            generationVersion: ctx.generationVersion,
            provider: this.compose.id,
            codec: this.compose.id === 'ffmpeg-compose' ? 'h264' : 'mock',
            fps: ctx.plan.fps,
          },
        },
      });
    } catch (error) {
      await ctx.storage.delete(rendered.storageKey).catch(() => undefined);
      throw error;
    }
    return {
      assetId,
      duration: rendered.duration,
      width: rendered.width,
      height: rendered.height,
    };
  }
}
