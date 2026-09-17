import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AssetLinkRole, AssetType } from '@prisma/client';
import { pipelineAssetDefaults } from '../../../assets/asset-library.js';
import { AppError, ErrorCode } from '../../../common/errors/app-error.js';
import { parseResolution } from '../../../media/ffmpeg/ffmpeg-config.js';
import { IMAGE_PROVIDER } from '../../../media/providers/image.token.js';
import type { ImageProvider } from '../../../media/providers/media-provider.types.js';
import { buildStorageKey } from '../../../media/storage/storage-key.js';
import { filenameForImageMime } from '../../../media/visual/image-format.js';
import { isPaidImageProvider, visualMaxConcurrency } from '../../../media/visual/visual-config.js';
import { VISUAL_PROMPT_VERSION } from '../visual-prompt.builder.js';
import {
  findReusableVisualAsset,
  metadataString,
  visualClientRequestId,
} from '../visual-reuse.js';
import { asPipelineOutput, type StageContext } from '../stage-context.js';
import type {
  JobPipelineOutput,
  ProductionScene,
  VisualSceneCheckpoint,
} from '../production-plan.types.js';
import { isAssetProductionEligible } from '../../../assets/asset-library.js';
import type { ResolvedShotMaterial } from '../material-resolve.types.js';
import { UsageMeteringService } from '../../../usage/usage-metering.service.js';
import { getMeteringScope } from '../../../usage/metering-context.js';
import { usageIdempotencyKey } from '../../../usage/usage-idempotency.js';
import { withUsageMetering } from '../../../usage/with-usage-metering.js';
import { UsageOperationType, UsageResourceType, UsageUnitType } from '@prisma/client';

@Injectable()
export class VisualGenerationStage {
  constructor(
    @Inject(IMAGE_PROVIDER) private readonly images: ImageProvider,
    @Optional() private readonly metering?: UsageMeteringService,
  ) {}

  async run(ctx: StageContext): Promise<string[]> {
    void visualMaxConcurrency();
    if (ctx.failStage === 'visual' && ctx.failVisualAfter == null) {
      throw new AppError(ErrorCode.VIDEO_PROVIDER_FAILED);
    }
    const { width, height } = parseResolution(ctx.plan.resolution);
    const output = asPipelineOutput(ctx.job.output);
    const scenes = [...(output.stages.visual?.scenes ?? [])];
    const assetIds: Array<string | undefined> = ctx.plan.scenes.map((scene) => {
      const hit = scenes.find((item) => item.sceneId === scene.sceneId);
      return hit?.assetId;
    });

    for (const [index, scene] of ctx.plan.scenes.entries()) {
      if (ctx.failVisualAfter != null && scene.sequence > ctx.failVisualAfter) {
        upsertScene(scenes, {
          sceneId: scene.sceneId,
          sequence: scene.sequence,
          status: 'failed',
          clientRequestId: visualClientRequestId(ctx.job.id, scene.sceneId, ctx.generationVersion),
          generationVersion: ctx.generationVersion,
          provider: this.images.id,
          error: { code: ErrorCode.VIDEO_PROVIDER_FAILED },
        });
        await this.persist(ctx, scenes, assetIds, 'failed');
        throw new AppError(ErrorCode.VIDEO_PROVIDER_FAILED);
      }
      const existing = scenes.find((item) => item.sceneId === scene.sceneId);
      const libraryHit = await this.reuseResolvedLibraryAsset(ctx, scene, index);
      if (libraryHit) {
        await this.ensureLink(ctx, libraryHit.id, scene);
        assetIds[index] = libraryHit.id;
        upsertScene(scenes, {
          sceneId: scene.sceneId,
          sequence: scene.sequence,
          status: 'ready',
          assetId: libraryHit.id,
          storageKey: libraryHit.storageKey,
          provider: 'library',
          model: 'existing-asset',
          clientRequestId: visualClientRequestId(ctx.job.id, scene.sceneId, ctx.generationVersion),
          generationVersion: ctx.generationVersion,
        });
        await this.persist(ctx, scenes, assetIds);
        continue;
      }
      const reused = await findReusableVisualAsset(ctx, scene, existing);
      if (reused) {
        await this.ensureLink(ctx, reused.id, scene);
        assetIds[index] = reused.id;
        upsertScene(scenes, {
          sceneId: scene.sceneId,
          sequence: scene.sequence,
          status: 'ready',
          assetId: reused.id,
          storageKey: reused.storageKey,
          provider: this.images.id,
          model: metadataModel(reused.metadata) ?? this.images.model ?? this.images.id,
          clientRequestId: visualClientRequestId(ctx.job.id, scene.sceneId, ctx.generationVersion),
          generationVersion: ctx.generationVersion,
        });
        await this.persist(ctx, scenes, assetIds);
        continue;
      }
      if (existing?.status === 'unknown_billing' || shouldBlockPaidResubmit(existing, this.images.id)) {
        upsertScene(scenes, {
          sceneId: scene.sceneId,
          sequence: scene.sequence,
          status: 'unknown_billing',
          clientRequestId: existing?.clientRequestId ?? visualClientRequestId(ctx.job.id, scene.sceneId, ctx.generationVersion),
          generationVersion: existing?.generationVersion ?? ctx.generationVersion,
          provider: existing?.provider ?? this.images.id,
          model: existing?.model,
          submittedAt: existing?.submittedAt,
          error: { code: ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING },
        });
        await this.persist(ctx, scenes, assetIds, 'failed');
        throw new AppError(ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING);
      }
      const clientRequestId = visualClientRequestId(ctx.job.id, scene.sceneId, ctx.generationVersion);
      const submittedAt = new Date().toISOString();
      upsertScene(scenes, {
        sceneId: scene.sceneId,
        sequence: scene.sequence,
        status: 'submitting',
        clientRequestId,
        generationVersion: ctx.generationVersion,
        provider: this.images.id,
        model: this.images.model ?? this.images.id,
        submittedAt,
      });
      await this.persist(ctx, scenes, assetIds);

      const assetId = randomUUID();
      const key = buildStorageKey({
        tenantId: ctx.job.tenantId,
        workspaceId: ctx.job.workspaceId,
        projectId: ctx.job.projectId,
        assetId,
      });
      let rendered;
      try {
        rendered = await withUsageMetering(
          this.metering,
          {
            tenantId: ctx.job.tenantId,
            workspaceId: ctx.job.workspaceId,
            projectId: ctx.job.projectId,
            videoId: ctx.plan.videoId,
            jobId: ctx.job.id,
            generationVersion: ctx.generationVersion,
            stage: getMeteringScope()?.stage ?? 'VISUAL',
            repairAttempt: getMeteringScope()?.repairAttempt,
            operationType: UsageOperationType.IMAGE_GENERATION,
            provider: this.images.id,
            model: this.images.model,
            resourceType: UsageResourceType.AI_IMAGE,
            idempotencyKey: usageIdempotencyKey([
              'ai_image',
              ctx.job.id,
              ctx.generationVersion,
              clientRequestId,
              getMeteringScope()?.repairAttempt ?? 0,
            ]),
            metadata: {
              stage: 'VISUAL',
              generationVersion: ctx.generationVersion,
              sceneSequence: scene.sequence,
              billable: !this.images.id.includes('mock') && this.images.id !== 'color-background',
              reason: getMeteringScope()?.repairAttempt ? 'quality_repair' : 'production',
              repairAttempt: getMeteringScope()?.repairAttempt ?? 0,
            },
          },
          () =>
            this.images.generate({
              sceneId: scene.sceneId,
              sequence: scene.sequence,
              prompt: scene.visualPrompt,
              negativePrompt: scene.visualNegativePrompt,
              aspectRatio: ctx.plan.aspectRatio,
              width,
              height,
              style: scene.visualSuggestion,
              clientRequestId,
              storageKey: key,
            }),
          (item) => ({
            imageCount: item.usage?.imageCount ?? 1,
            totalUnits: item.usage?.imageCount ?? 1,
            unitType: UsageUnitType.IMAGES,
            providerRequestId: item.providerTaskId ?? item.usage?.providerTaskId,
          }),
        );
      } catch (error) {
        const appError = error instanceof AppError ? error : new AppError(ErrorCode.VIDEO_PROVIDER_FAILED);
        const freeze = isPaidImageProvider(this.images.id) && isPaidVisualFreezeError(appError);
        upsertScene(scenes, {
          sceneId: scene.sceneId,
          sequence: scene.sequence,
          status: freeze ? 'unknown_billing' : 'failed',
          clientRequestId,
          generationVersion: ctx.generationVersion,
          provider: this.images.id,
          model: this.images.model ?? this.images.id,
          submittedAt,
          error: { code: appError.code },
        });
        await this.persist(ctx, scenes, assetIds, 'failed');
        throw freeze ? new AppError(ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING) : appError;
      }
      try {
        const library = pipelineAssetDefaults('visual');
        await ctx.prisma.asset.create({
          data: {
            id: assetId,
            tenantId: ctx.job.tenantId,
            workspaceId: ctx.job.workspaceId,
            projectId: ctx.job.projectId,
            type: AssetType.IMAGE,
            status: 'READY',
            storageProvider: 'local',
            storageKey: rendered.storageKey,
            originalFilename: filenameForImageMime(rendered.mimeType, scene.sourceKind),
            mimeType: rendered.mimeType,
            size: rendered.size,
            width: rendered.width,
            height: rendered.height,
            sourceType: library.sourceType,
            ownerType: library.ownerType,
            referenceOnly: library.referenceOnly,
            reusable: library.reusable,
            rightsStatus: library.rightsStatus,
            consentStatus: library.consentStatus,
            libraryVisible: library.libraryVisible,
            provider: rendered.provider,
            generatedFromJobId: ctx.job.id,
            metadata: {
              jobId: ctx.job.id,
              videoId: ctx.plan.videoId,
              stage: 'visual',
              generationVersion: ctx.generationVersion,
              sceneId: scene.sceneId,
              sequence: scene.sequence,
              sourceSectionSequence: scene.sourceSectionSequence,
              visualSourceType: scene.visualSourceType,
              provider: rendered.provider,
              model: rendered.model,
              width: rendered.width,
              height: rendered.height,
              promptVersion: VISUAL_PROMPT_VERSION,
              ...(rendered.providerTaskId ? { providerRequestId: rendered.providerTaskId } : {}),
            },
          },
        });
      } catch (error) {
        await ctx.storage.delete(rendered.storageKey).catch(() => undefined);
        throw error;
      }
      await this.ensureLink(ctx, assetId, scene);
      assetIds[index] = assetId;
      upsertScene(scenes, {
        sceneId: scene.sceneId,
        sequence: scene.sequence,
        status: 'ready',
        assetId,
        storageKey: rendered.storageKey,
        provider: rendered.provider,
        model: rendered.model,
        clientRequestId,
        generationVersion: ctx.generationVersion,
        submittedAt,
        providerRequestId: rendered.providerTaskId,
        providerTask: rendered.providerTaskId ? { providerTaskId: rendered.providerTaskId } : undefined,
      });
      await this.persist(ctx, scenes, assetIds);
    }

    const completed = assetIds.filter((id): id is string => Boolean(id));
    if (completed.length !== ctx.plan.scenes.length) {
      throw new AppError(ErrorCode.VIDEO_PROVIDER_FAILED);
    }
    await this.persist(ctx, scenes, completed, 'completed');
    return completed;
  }

  private async reuseResolvedLibraryAsset(
    ctx: StageContext,
    scene: ProductionScene,
    _index: number,
  ): Promise<{ id: string; storageKey: string } | null> {
    const resolved = readResolvedShot(ctx, scene.sequence);
    if (!resolved?.assetId || resolved.generationRequired) {
      return null;
    }
    const row = await ctx.prisma.asset.findFirst({
      where: {
        id: resolved.assetId,
        tenantId: ctx.job.tenantId,
        workspaceId: ctx.job.workspaceId,
        deletedAt: null,
      },
    });
    if (!row) {
      return null;
    }
    const eligibility = isAssetProductionEligible({ asset: row, callerTenantId: ctx.job.tenantId });
    if (!eligibility.eligible) {
      return null;
    }
    if (!(await ctx.storage.exists(row.storageKey))) {
      return null;
    }
    const fromVideo = metadataString(row.metadata, 'videoId');
    const stage = metadataString(row.metadata, 'stage');
    if ((row.provider === 'wanx' || stage === 'visual') && fromVideo && fromVideo !== ctx.plan.videoId) {
      return null;
    }
    return { id: row.id, storageKey: row.storageKey };
  }

  private async persist(
    ctx: StageContext,
    scenes: VisualSceneCheckpoint[],
    assetIds: Array<string | undefined>,
    status: 'completed' | 'failed' | 'running' = 'running',
  ) {
    const output = asPipelineOutput(ctx.job.output);
    const readyIds = ctx.plan.scenes
      .map((_, index) => assetIds[index])
      .filter((id): id is string => Boolean(id));
    const overall =
      status === 'completed' && readyIds.length === ctx.plan.scenes.length
        ? 'completed'
        : status === 'failed'
          ? 'failed'
          : 'running';
    output.currentStage = 'visual';
    output.stages.visual = {
      status: overall,
      assetIds: readyIds,
      provider: this.images.id,
      model: scenes.find((item) => item.model)?.model,
      startedAt: output.stages.visual?.startedAt ?? new Date().toISOString(),
      ...(overall === 'running' ? {} : { completedAt: new Date().toISOString() }),
      scenes: [...scenes],
    };
    output.usage = {
      ...output.usage,
      imageCount: readyIds.length,
      estimatedCost: 0,
      visual: {
        imageCount: readyIds.length,
        provider: this.images.id,
        model: scenes.find((item) => item.model)?.model,
      },
    };
    await ctx.jobs.mergeOutput(ctx.job.tenantId, ctx.job.id, output as never);
    ctx.job = await ctx.jobs.getById(ctx.job.tenantId, ctx.job.id);
  }

  private async ensureLink(ctx: StageContext, assetId: string, scene: ProductionScene) {
    const existing = await ctx.prisma.assetLink.findFirst({
      where: {
        tenantId: ctx.job.tenantId,
        jobId: ctx.job.id,
        assetId,
        role: AssetLinkRole.VIDEO_SOURCE,
      },
      select: { id: true },
    });
    if (existing) {
      return;
    }
    await ctx.prisma.assetLink.create({
      data: {
        tenantId: ctx.job.tenantId,
        workspaceId: ctx.job.workspaceId,
        projectId: ctx.job.projectId,
        assetId,
        videoId: ctx.plan.videoId,
        jobId: ctx.job.id,
        role: AssetLinkRole.VIDEO_SOURCE,
        sortOrder: scene.sequence,
      },
    });
  }
}

function upsertScene(scenes: VisualSceneCheckpoint[], next: VisualSceneCheckpoint) {
  const index = scenes.findIndex((item) => item.sceneId === next.sceneId);
  if (index >= 0) {
    scenes[index] = { ...scenes[index], ...next };
    return;
  }
  scenes.push(next);
}

function metadataModel(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const value = (metadata as Record<string, unknown>).model;
  return typeof value === 'string' ? value : undefined;
}

function shouldBlockPaidResubmit(checkpoint: VisualSceneCheckpoint | undefined, providerId: string): boolean {
  if (!checkpoint || checkpoint.status !== 'submitting') {
    return false;
  }
  return isPaidImageProvider(checkpoint.provider) || isPaidImageProvider(providerId);
}

function isPaidVisualFreezeError(error: AppError): boolean {
  return (
    error.code === ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING ||
    error.code === ErrorCode.VISUAL_PROVIDER_TIMEOUT ||
    error.code === ErrorCode.VISUAL_PROVIDER_DOWNLOAD ||
    error.code === ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE
  );
}

function readResolvedShot(ctx: StageContext, sequence: number): ResolvedShotMaterial | undefined {
  const fromOutput = asPipelineOutput(ctx.job.output).materialResolution?.shots.find((item) => item.sequence === sequence);
  if (fromOutput) {
    return fromOutput;
  }
  const input = ctx.job.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  const snapshot = (input as { materialResolution?: { shots?: ResolvedShotMaterial[] } }).materialResolution;
  return snapshot?.shots?.find((item) => item.sequence === sequence);
}

export type { JobPipelineOutput };
