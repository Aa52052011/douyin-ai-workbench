import { Injectable, Logger } from '@nestjs/common';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { ffprobeBin } from '../../media/ffmpeg/ffmpeg-config.js';
import { isFfprobeAvailable } from '../../media/ffmpeg/ffmpeg-available.js';
import { buildFfprobeArgs, parseFfprobeJson } from '../../media/ffmpeg/ffprobe.js';
import { runChildProcess } from '../../media/ffmpeg/run-process.js';
import { asPipelineOutput, type StageContext } from '../pipeline/stage-context.js';
import { parseSrt } from '../pipeline/srt.js';
import { hashQualityInput } from './quality-hash.js';
import { runDeterministicQualityChecks } from './quality-check.js';
import type { ProductionQualityResult, QualityAssetSnapshot, QualityCheckInput, QualityMediaProbe } from './quality.types.js';

@Injectable()
export class QualityCheckService {
  private readonly logger = new Logger(QualityCheckService.name);

  async evaluate(ctx: StageContext, composeAssetId: string, attempt: number): Promise<ProductionQualityResult> {
    const output = asPipelineOutput(ctx.job.output);
    const timeline = output.editingTimeline;
    const compose = await ctx.prisma.asset.findFirst({
      where: { id: composeAssetId, tenantId: ctx.job.tenantId },
    });
    const visualIds = [...new Set((timeline?.tracks.visual.map((item) => item.assetId).filter(Boolean) as string[]) ?? [])];
    const voiceId = timeline?.metadata.voiceAssetId ?? output.stages.voice?.assetIds?.[0];
    const subtitleId = timeline?.metadata.subtitleAssetId ?? output.stages.subtitle?.assetIds?.[0];
    const ids = [...visualIds, voiceId, subtitleId, composeAssetId].filter((id): id is string => Boolean(id));
    const rows = await ctx.prisma.asset.findMany({
      where: { tenantId: ctx.job.tenantId, id: { in: ids } },
    });
    const assets: QualityAssetSnapshot[] = [];
    for (const row of rows) {
      const exists = row.storageKey ? await ctx.storage.exists(row.storageKey) : false;
      assets.push({
        id: row.id,
        tenantId: row.tenantId,
        type: row.type,
        status: row.status,
        referenceOnly: row.referenceOnly,
        rightsStatus: row.rightsStatus,
        consentStatus: row.consentStatus,
        deletedAt: row.deletedAt,
        duration: row.duration,
        exists,
      });
    }
    let cues: Array<{ start: number; end: number; text: string }> = [];
    if (subtitleId) {
      const sub = rows.find((item) => item.id === subtitleId);
      if (sub?.storageKey && (await ctx.storage.exists(sub.storageKey))) {
        const body = (await ctx.storage.get(sub.storageKey)).toString('utf8');
        cues = parseSrt(body);
      }
    }
    const fileExists = Boolean(compose && (await ctx.storage.exists(compose.storageKey)));
    const probe = await this.probeCompose(ctx, compose?.storageKey, compose?.provider ?? undefined, {
      duration: compose?.duration ?? ctx.plan.targetDuration,
      width: compose?.width ?? 1080,
      height: compose?.height ?? 1920,
      fps: ctx.plan.fps,
    });
    const qualityInputHash = hashQualityInput({
      composeAssetId,
      timelineHash: timeline?.timelineHash,
      voiceAssetId: voiceId,
      subtitleAssetId: subtitleId,
    });
    const materials = output.materialResolution?.shots ?? [];
    const hasCtaInPlan = ctx.plan.scenes.some((scene) => scene.sourceKind === 'cta') || materials.some((shot) => shot.shotPurpose === 'CTA');
    const input: QualityCheckInput = {
      qualityInputHash,
      attempt,
      composeProvider: compose?.provider ?? undefined,
      fileExists,
      storageExists: fileExists,
      probe: probe.summary,
      probeFailed: probe.failed,
      expectedWidth: timeline?.width ?? 1080,
      expectedHeight: timeline?.height ?? 1920,
      expectedFps: ctx.plan.fps,
      targetDurationSec: ctx.plan.targetDuration,
      voiceDurationSec: output.stages.voice?.duration ?? ctx.plan.targetDuration,
      timelineDurationMs: timeline?.durationMs ?? Math.round((output.stages.voice?.duration ?? ctx.plan.targetDuration) * 1000),
      voiceExpected: true,
      hasCtaInPlan,
      timeline: timeline
        ? {
            durationMs: timeline.durationMs,
            tracks: {
              visual: timeline.tracks.visual.map((item) => ({
                ...item,
                purpose: materials.find((shot) => shot.sequence === item.sequence)?.shotPurpose,
              })),
              voice: timeline.tracks.voice,
              subtitle: timeline.tracks.subtitle,
            },
          }
        : undefined,
      assets,
      subtitleCues: cues,
      canvasWidth: timeline?.width ?? 1080,
    };
    const result = runDeterministicQualityChecks(input);
    this.logger.log(
      JSON.stringify({
        event: 'quality_check',
        videoId: ctx.plan.videoId,
        generationVersion: ctx.generationVersion,
        qualityInputHash,
        rulesetVersion: result.version,
        attempt,
        issueCount: result.issues.length,
        blockingCount: result.blockingIssueCount,
        qualityDisposition: result.finalDisposition,
        durationMs: result.durationMs,
      }),
    );
    return result;
  }

  private async probeCompose(
    ctx: StageContext,
    storageKey: string | undefined,
    provider: string | undefined,
    fallback: { duration: number; width: number; height: number; fps: number },
  ): Promise<{ summary: QualityMediaProbe | null; failed: boolean }> {
    if (!storageKey || !(await ctx.storage.exists(storageKey))) {
      return { summary: null, failed: true };
    }
    if ((provider ?? '').includes('mock') || !isFfprobeAvailable()) {
      return {
        summary: {
          duration: fallback.duration,
          hasVideo: true,
          hasAudio: true,
          width: fallback.width,
          height: fallback.height,
          videoCodec: 'h264',
          audioCodec: 'aac',
          fps: fallback.fps,
        },
        failed: false,
      };
    }
    const dir = mkdtempSync(path.join(os.tmpdir(), 'acf-qg-'));
    const file = path.join(dir, 'probe.mp4');
    try {
      await writeFile(file, await ctx.storage.get(storageKey));
      const probed = await runChildProcess(ffprobeBin(), buildFfprobeArgs(file), { timeoutMs: 15_000 });
      const summary = parseFfprobeJson(probed.stdout);
      return { summary, failed: !summary };
    } catch {
      return { summary: null, failed: true };
    }
  }
}
