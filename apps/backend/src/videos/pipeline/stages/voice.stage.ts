import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AssetLinkRole, AssetType } from '@prisma/client';
import { AppError, ErrorCode } from '../../../common/errors/app-error.js';
import { filenameForAudioMime } from '../../../media/audio/audio-format.js';
import { TTS_PROVIDER } from '../../../media/providers/tts.token.js';
import type { TtsProvider } from '../../../media/providers/media-provider.types.js';
import { buildStorageKey } from '../../../media/storage/storage-key.js';
import { inferVoicePreset } from '../../../media/tts/tts-voice.js';
import { reusableAssetIds } from '../asset-reuse.js';
import { metadataNumber } from '../visual-reuse.js';
import { asPipelineOutput, type StageContext } from '../stage-context.js';

@Injectable()
export class VoiceGenerationStage {
  constructor(@Inject(TTS_PROVIDER) private readonly tts: TtsProvider) {}

  async run(ctx: StageContext): Promise<{
    assetId: string;
    duration: number;
    durationExact: number;
    provider: string;
    model?: string;
    usage?: { audioCharacters: number; audioSeconds: number; audioSecondsExact?: number };
  }> {
    const output = asPipelineOutput(ctx.job.output);
    const reused = await reusableAssetIds(ctx, output.stages.voice?.assetIds);
    if (reused?.[0]) {
      const asset = await ctx.prisma.asset.findFirst({
        where: { id: reused[0], tenantId: ctx.job.tenantId },
      });
      const reusedDuration = asset?.duration ?? output.stages.voice?.duration ?? 1;
      return {
        assetId: reused[0],
        duration: reusedDuration,
        durationExact: metadataNumber(asset?.metadata, 'durationExact') ?? reusedDuration,
        provider: output.stages.voice?.provider ?? this.tts.id,
        model: output.stages.voice?.model,
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
    const rendered = await this.tts.synthesize({
      text: ctx.plan.voice.text,
      storageKey: key,
      voice: ctx.plan.voice.style,
      language: ctx.plan.voice.language,
      speed: ctx.plan.voice.speed,
      clientRequestId: `${ctx.job.id}:voice:${ctx.generationVersion}`,
    });
    const originalFilename = filenameForAudioMime(rendered.mimeType);
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
      usage: {
        audioCharacters: rendered.usage?.inputCharacters ?? ctx.plan.voice.text.length,
        audioSeconds: rendered.duration,
        audioSecondsExact: rendered.usage?.audioSecondsExact ?? rendered.duration,
      },
    };
  }
}
