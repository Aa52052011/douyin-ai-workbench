import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AssetLinkRole, AssetType } from '@prisma/client';
import { AppError, ErrorCode } from '../../../common/errors/app-error.js';
import { filenameForAudioMime } from '../../../media/audio/audio-format.js';
import { TTS_PROVIDER } from '../../../media/providers/tts.token.js';
import type { TtsProvider } from '../../../media/providers/media-provider.types.js';
import { buildStorageKey } from '../../../media/storage/storage-key.js';
import { inferVoicePreset } from '../../../media/tts/tts-voice.js';
import { resolveVoiceConfig } from '../../../voice/voice-resolve.js';
import { pipelineAssetDefaults } from '../../../assets/asset-library.js';
import { reusableAssetIds } from '../asset-reuse.js';
import { metadataNumber, metadataString } from '../visual-reuse.js';
import { findReusableVoiceAsset, voiceTextFingerprint } from '../voice-reuse.js';
import { speechMarksFromMetadata } from '../srt.js';
import { asPipelineOutput, type StageContext } from '../stage-context.js';
import { UsageMeteringService } from '../../../usage/usage-metering.service.js';
import { getMeteringScope } from '../../../usage/metering-context.js';
import { usageIdempotencyKey } from '../../../usage/usage-idempotency.js';
import { withUsageMetering } from '../../../usage/with-usage-metering.js';
import { UsageOperationType, UsageResourceType, UsageUnitType } from '@prisma/client';

@Injectable()
export class VoiceGenerationStage {
  constructor(
    @Inject(TTS_PROVIDER) private readonly tts: TtsProvider,
    @Optional() private readonly metering?: UsageMeteringService,
  ) {}

  async run(
    ctx: StageContext,
    opts?: { force?: boolean },
  ): Promise<{
    assetId: string;
    duration: number;
    durationExact: number;
    provider: string;
    model?: string;
    speechCues?: Array<{ text: string; start: number; end: number }>;
    timingSource?: string;
    usage?: { audioCharacters: number; audioSeconds: number; audioSecondsExact?: number };
  }> {
    const output = asPipelineOutput(ctx.job.output);
    const reusedIds = opts?.force ? null : await reusableAssetIds(ctx, output.stages.voice?.assetIds);
    if (reusedIds?.[0]) {
      const asset = await ctx.prisma.asset.findFirst({
        where: { id: reusedIds[0], tenantId: ctx.job.tenantId },
      });
      const reusedDuration = asset?.duration ?? output.stages.voice?.duration ?? 1;
      return {
        assetId: reusedIds[0],
        duration: reusedDuration,
        durationExact: metadataNumber(asset?.metadata, 'durationExact') ?? reusedDuration,
        provider: output.stages.voice?.provider ?? this.tts.id,
        model: output.stages.voice?.model,
        speechCues: speechMarksFromMetadata(asset?.metadata),
        timingSource: metadataString(asset?.metadata, 'timingSource'),
      };
    }

    const crossJob = opts?.force ? null : await findReusableVoiceAsset(ctx);
    if (crossJob) {
      await ctx.prisma.assetLink.create({
        data: {
          tenantId: ctx.job.tenantId,
          workspaceId: ctx.job.workspaceId,
          projectId: ctx.job.projectId,
          assetId: crossJob.id,
          videoId: ctx.plan.videoId,
          jobId: ctx.job.id,
          role: AssetLinkRole.VIDEO_AUDIO,
        },
      });
      const reusedDuration = crossJob.duration ?? 1;
      return {
        assetId: crossJob.id,
        duration: reusedDuration,
        durationExact: metadataNumber(crossJob.metadata, 'durationExact') ?? reusedDuration,
        provider: metadataString(crossJob.metadata, 'provider') ?? this.tts.id,
        model: metadataString(crossJob.metadata, 'model'),
        speechCues: speechMarksFromMetadata(crossJob.metadata),
        timingSource: metadataString(crossJob.metadata, 'timingSource'),
      };
    }

    if (ctx.failStage === 'voice') {
      throw new AppError(ErrorCode.VIDEO_PROVIDER_FAILED);
    }
    const assetId = randomUUID();
    const key = buildStorageKey({
      tenantId: ctx.job.tenantId,
      workspaceId: ctx.job.workspaceId,
      projectId: ctx.job.projectId,
      assetId,
    });
    const resolved = resolveVoiceConfig({
      preferredVoiceId: ctx.plan.voice.resolvedVoiceId,
      voiceType: ctx.plan.voice.voiceType,
      voiceProfileId: ctx.plan.voice.voiceProfileId,
    });
    const rendered = await withUsageMetering(
      this.metering,
      {
        tenantId: ctx.job.tenantId,
        workspaceId: ctx.job.workspaceId,
        projectId: ctx.job.projectId,
        videoId: ctx.plan.videoId,
        jobId: ctx.job.id,
        generationVersion: ctx.generationVersion,
        stage: getMeteringScope()?.stage ?? 'VOICE',
        repairAttempt: getMeteringScope()?.repairAttempt,
        operationType: UsageOperationType.VOICE_SYNTHESIS,
        provider: this.tts.id,
        model: 'model' in this.tts ? (this.tts as { model?: string }).model : undefined,
        resourceType: UsageResourceType.TTS,
        idempotencyKey: usageIdempotencyKey([
          'tts',
          ctx.job.id,
          ctx.generationVersion,
          `${ctx.job.id}:voice:${ctx.generationVersion}`,
          getMeteringScope()?.repairAttempt ?? 0,
        ]),
        metadata: {
          stage: 'VOICE',
          generationVersion: ctx.generationVersion,
          billable: this.tts.id !== 'mock-tts',
          reason: getMeteringScope()?.repairAttempt ? 'quality_repair' : 'production',
          repairAttempt: getMeteringScope()?.repairAttempt ?? 0,
        },
      },
      () =>
        this.tts.synthesize({
          text: ctx.plan.voice.text,
          storageKey: key,
          voice: resolved.providerVoiceId,
          language: ctx.plan.voice.language,
          speed: ctx.plan.voice.speed,
          clientRequestId: `${ctx.job.id}:voice:${ctx.generationVersion}`,
        }),
      (item) => ({
        characterCount: item.usage?.inputCharacters ?? ctx.plan.voice.text.length,
        durationSeconds: item.usage?.audioSecondsExact ?? item.duration,
        totalUnits: item.usage?.inputCharacters ?? ctx.plan.voice.text.length,
        unitType: UsageUnitType.CHARACTERS,
        computeMs: item.usage?.providerDurationMs,
      }),
    );
    const originalFilename = filenameForAudioMime(rendered.mimeType);
    const library = pipelineAssetDefaults('voice');
    try {
      await ctx.prisma.asset.create({
        data: {
          id: assetId,
          tenantId: ctx.job.tenantId,
          workspaceId: ctx.job.workspaceId,
          projectId: ctx.job.projectId,
          type: AssetType.AUDIO,
          status: 'READY',
          storageProvider: 'local',
          storageKey: rendered.storageKey,
          originalFilename,
          mimeType: rendered.mimeType,
          size: rendered.size,
          duration: rendered.duration,
          sourceType: library.sourceType,
          ownerType: library.ownerType,
          referenceOnly: library.referenceOnly,
          reusable: library.reusable,
          rightsStatus: library.rightsStatus,
          consentStatus: library.consentStatus,
          libraryVisible: library.libraryVisible,
          provider: this.tts.id,
          generatedFromJobId: ctx.job.id,
          metadata: {
            jobId: ctx.job.id,
            videoId: ctx.plan.videoId,
            stage: 'voice',
            generationVersion: ctx.generationVersion,
            provider: this.tts.id,
            model: rendered.usage?.model,
            voicePreset: inferVoicePreset(ctx.plan.voice.style),
            language: ctx.plan.voice.language,
            format: originalFilename.endsWith('.mp3') ? 'mp3' : 'wav',
            duration: rendered.duration,
            durationExact: rendered.usage?.audioSecondsExact ?? rendered.duration,
            voiceTextHash: voiceTextFingerprint(ctx.plan.voice.text),
            voiceType: ctx.plan.voice.voiceType ?? 'SYSTEM',
            resolvedVoiceId: ctx.plan.voice.resolvedVoiceId ?? 'sys.default',
            timingSource: rendered.timingSource ?? 'none',
            ...(rendered.speechCues?.length ? { speechCues: rendered.speechCues } : {}),
            ...(ctx.plan.voice.voiceProfileId ? { voiceProfileId: ctx.plan.voice.voiceProfileId } : {}),
            ...(rendered.usage?.providerDurationMs != null
              ? { providerDuration: rendered.usage.providerDurationMs }
              : {}),
          },
        },
      });
    } catch (error) {
      await ctx.storage.delete(rendered.storageKey).catch(() => undefined);
      throw error;
    }
    await ctx.prisma.assetLink.create({
      data: {
        tenantId: ctx.job.tenantId,
        workspaceId: ctx.job.workspaceId,
        projectId: ctx.job.projectId,
        assetId,
        videoId: ctx.plan.videoId,
        jobId: ctx.job.id,
        role: AssetLinkRole.VIDEO_AUDIO,
      },
    });
    return {
      assetId,
      duration: rendered.duration,
      durationExact: rendered.usage?.audioSecondsExact ?? rendered.duration,
      provider: this.tts.id,
      model: rendered.usage?.model,
      speechCues: rendered.speechCues,
      timingSource: rendered.timingSource,
      usage: {
        audioCharacters: rendered.usage?.inputCharacters ?? ctx.plan.voice.text.length,
        audioSeconds: rendered.duration,
        audioSecondsExact: rendered.usage?.audioSecondsExact ?? rendered.duration,
      },
    };
  }
}
