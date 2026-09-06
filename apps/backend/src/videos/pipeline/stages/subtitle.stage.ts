import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AssetLinkRole, AssetType } from '@prisma/client';
import { AppError, ErrorCode } from '../../../common/errors/app-error.js';
import { MockSubtitleProvider } from '../../../media/providers/mock-subtitle.provider.js';
import { buildStorageKey } from '../../../media/storage/storage-key.js';
import { reusableAssetIds } from '../asset-reuse.js';
import { buildSubtitleCues } from '../srt.js';
import { asPipelineOutput, type StageContext } from '../stage-context.js';

@Injectable()
export class SubtitleGenerationStage {
  constructor(private readonly subtitles: MockSubtitleProvider) {}

  async run(ctx: StageContext, voiceDuration: number): Promise<string> {
    const output = asPipelineOutput(ctx.job.output);
    const reused = await reusableAssetIds(ctx, output.stages.subtitle?.assetIds);
    if (reused?.[0]) {
      return reused[0];
    }
    if (ctx.failStage === 'subtitle') {
      throw new AppError(ErrorCode.VIDEO_PROVIDER_FAILED);
    }
    const cues = buildSubtitleCues(ctx.plan.voice.text, voiceDuration);
    const assetId = randomUUID();
    const key = buildStorageKey({
      tenantId: ctx.job.tenantId,
      workspaceId: ctx.job.workspaceId,
      projectId: ctx.job.projectId,
      assetId,
    });
    const rendered = await this.subtitles.render({
      cues,
      storageKey: key,
      clientRequestId: `${ctx.job.id}:subtitle:${ctx.generationVersion}`,
    });
    await ctx.prisma.asset.create({
      data: {
        id: assetId,
        tenantId: ctx.job.tenantId,
        workspaceId: ctx.job.workspaceId,
        projectId: ctx.job.projectId,
        type: AssetType.SUBTITLE,
        status: 'READY',
        storageProvider: 'local',
        storageKey: rendered.storageKey,
        originalFilename: 'captions.srt',
        mimeType: rendered.mimeType,
        size: rendered.size,
        metadata: {
          jobId: ctx.job.id,
          videoId: ctx.plan.videoId,
          stage: 'subtitle',
          generationVersion: ctx.generationVersion,
          format: 'srt',
        },
      },
    });
    await ctx.prisma.assetLink.create({
      data: {
        tenantId: ctx.job.tenantId,
        workspaceId: ctx.job.workspaceId,
        projectId: ctx.job.projectId,
        assetId,
        videoId: ctx.plan.videoId,
        jobId: ctx.job.id,
        role: AssetLinkRole.VIDEO_SUBTITLE,
      },
    });
    return assetId;
  }
}
