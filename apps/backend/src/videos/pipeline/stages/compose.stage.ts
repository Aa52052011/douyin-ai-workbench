import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AssetType } from '@prisma/client';
import { pipelineAssetDefaults } from '../../../assets/asset-library.js';
import { AppError, ErrorCode } from '../../../common/errors/app-error.js';
import { COMPOSE_PROVIDER } from '../../../media/providers/compose.token.js';
import type { ComposeProvider } from '../../../media/providers/media-provider.types.js';
import { buildStorageKey } from '../../../media/storage/storage-key.js';
import { reusableAssetIds } from '../asset-reuse.js';
import { asPipelineOutput, type StageContext } from '../stage-context.js';
import { metadataString } from '../visual-reuse.js';
import { UsageMeteringService } from '../../../usage/usage-metering.service.js';
import { getMeteringScope } from '../../../usage/metering-context.js';
import { usageIdempotencyKey } from '../../../usage/usage-idempotency.js';
import { withUsageMetering } from '../../../usage/with-usage-metering.js';
import { UsageOperationType, UsageResourceType, UsageUnitType } from '@prisma/client';

@Injectable()
export class CompositionStage {
  constructor(
    @Inject(COMPOSE_PROVIDER) private readonly compose: ComposeProvider,
    @Optional() private readonly metering?: UsageMeteringService,
  ) {}

  async run(
    ctx: StageContext,
    input: {
      voiceDuration: number;
      failToken?: string;
      force?: boolean;
      resolution?: string;
      aspectRatio?: string;
      composeRole?: 'vertical' | 'landscape';
    },
  ): Promise<{ assetId: string; duration: number; width: number; height: number }> {
    const composeRole = input.composeRole ?? 'vertical';
    const output = asPipelineOutput(ctx.job.output);
    const reused = input.force ? null : await reusableAssetIds(ctx, output.stages.compose?.assetIds);
    if (reused?.[0] && composeRole === 'vertical') {
      const asset = await ctx.prisma.asset.findFirst({
        where: { id: reused[0], tenantId: ctx.job.tenantId, workspaceId: ctx.job.workspaceId, projectId: ctx.job.projectId },
      });
      const role = metadataString(asset?.metadata, 'composeRole');
      if (asset && role !== 'landscape') {
        return {
          assetId: reused[0],
          duration: asset.duration ?? output.stages.compose?.duration ?? input.voiceDuration,
          width: asset.width ?? 1080,
          height: asset.height ?? 1920,
        };
      }
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
    const landscape = composeRole === 'landscape';
    const t0 = Date.now();
    const rendered = await withUsageMetering(
      this.metering,
      {
        tenantId: ctx.job.tenantId,
        workspaceId: ctx.job.workspaceId,
        projectId: ctx.job.projectId,
        videoId: ctx.plan.videoId,
        jobId: ctx.job.id,
        generationVersion: ctx.generationVersion,
        stage: getMeteringScope()?.stage ?? 'COMPOSE',
        repairAttempt: getMeteringScope()?.repairAttempt,
        operationType: UsageOperationType.FFMPEG_COMPOSE,
        provider: this.compose.id,
        resourceType: UsageResourceType.LOCAL_COMPUTE,
        idempotencyKey: usageIdempotencyKey([
          'ffmpeg',
          ctx.job.id,
          ctx.generationVersion,
          getMeteringScope()?.repairAttempt ?? 0,
          input.force ? 'force' : 'auto',
          composeRole,
        ]),
        metadata: {
          stage: 'COMPOSE',
          generationVersion: ctx.generationVersion,
          billable: false,
          reason: getMeteringScope()?.repairAttempt ? 'quality_repair' : 'production',
          repairAttempt: getMeteringScope()?.repairAttempt ?? 0,
          inputAssetCount: ctx.plan.scenes.length + 1,
        },
      },
      () =>
        this.compose.compose({
          storageKey: key,
          voiceDuration: input.voiceDuration,
          targetDuration: ctx.plan.targetDuration,
          sceneCount: ctx.plan.scenes.length,
          clientRequestId: `${ctx.job.id}:compose:${ctx.generationVersion}`,
          failToken: input.failToken,
          resolution: input.resolution ?? ctx.plan.resolution,
          aspectRatio: input.aspectRatio ?? ctx.plan.aspectRatio,
          fps: ctx.plan.fps,
          scenes: ctx.plan.scenes.map((scene, index) => {
            const visual = visuals[index]!;
            const clip = output.editingTimeline?.tracks.visual.find((item) => item.sequence === scene.sequence);
            const kind =
              clip?.assetType === 'VIDEO' ||
              clip?.assetType === 'SOURCE_VIDEO' ||
              clip?.assetType === 'BROLL' ||
              visual.type === 'VIDEO' ||
              visual.type === 'SOURCE_VIDEO' ||
              visual.type === 'BROLL'
                ? 'video'
                : 'image';
            return {
              storageKey: visual.storageKey,
              durationBudget: scene.durationBudget,
              mimeType: visual.mimeType ?? undefined,
              kind,
              sourceStartSec: clip?.sourceStartMs != null ? clip.sourceStartMs / 1000 : undefined,
              freezePadSec: clip?.freezePadMs != null ? clip.freezePadMs / 1000 : undefined,
              cropTopRatio: landscape
                ? 0
                : visual.width && visual.height && visual.width > visual.height
                  ? 0.14
                  : visual.type === 'VIDEO' || visual.type === 'SOURCE_VIDEO' || visual.type === 'BROLL'
                    ? 0.14
                    : visual.width && visual.height && visual.width <= visual.height
                      ? 0
                      : 0.14,
            };
          }),
          voiceStorageKey: voice.storageKey,
          voiceMimeType: voice.mimeType ?? undefined,
          subtitleStorageKey: subtitle.storageKey,
        }),
      (item) => {
        const computeMs = Date.now() - t0;
        return {
          durationSeconds: item.duration,
          computeMs,
          totalUnits: computeMs,
          unitType: UsageUnitType.MILLISECONDS,
        };
      },
    );
    try {
      const library = pipelineAssetDefaults('compose');
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
          originalFilename: landscape ? 'output-landscape.mp4' : 'output.mp4',
          mimeType: rendered.mimeType,
          size: rendered.size,
          duration: rendered.duration,
          width: rendered.width,
          height: rendered.height,
          sourceType: library.sourceType,
          ownerType: library.ownerType,
          referenceOnly: library.referenceOnly,
          reusable: library.reusable,
          rightsStatus: library.rightsStatus,
          consentStatus: library.consentStatus,
          libraryVisible: false,
          provider: this.compose.id,
          generatedFromJobId: ctx.job.id,
          metadata: {
            jobId: ctx.job.id,
            videoId: ctx.plan.videoId,
            stage: 'compose',
            composeRole: landscape ? 'landscape' : 'vertical',
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
