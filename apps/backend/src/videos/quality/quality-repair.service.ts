import { Inject, Injectable } from '@nestjs/common';
import { hashEditingTimeline, repairVisualGaps, type EditingTimelineV1 } from '../pipeline/editing-timeline.js';
import { asPipelineOutput, type StageContext } from '../pipeline/stage-context.js';
import { parseSrt, reflowOverflowCues } from '../pipeline/srt.js';
import { reresolveAffectedShots } from '../pipeline/material-runtime.js';
import { hashQualityInput } from './quality-hash.js';
import type { RepairPlan } from './quality.types.js';
import type { CompositionStage } from '../pipeline/stages/compose.stage.js';
import type { SubtitleGenerationStage } from '../pipeline/stages/subtitle.stage.js';
import type { VisualGenerationStage } from '../pipeline/stages/visual.stage.js';
import type { VoiceGenerationStage } from '../pipeline/stages/voice.stage.js';
import {
  COMPOSITION_STAGE,
  SUBTITLE_GENERATION_STAGE,
  VISUAL_GENERATION_STAGE,
  VOICE_GENERATION_STAGE,
} from '../pipeline/stage-providers.js';

export type RepairExecuteResult = {
  composeAssetId: string;
  duration: number;
  width: number;
  height: number;
  providerCalls: number;
  afterHash: string;
  reusedVoice: boolean;
  reusedVisualExcept?: number[];
};

@Injectable()
export class QualityRepairService {
  constructor(
    @Inject(VISUAL_GENERATION_STAGE) private readonly visual: VisualGenerationStage,
    @Inject(VOICE_GENERATION_STAGE) private readonly voice: VoiceGenerationStage,
    @Inject(SUBTITLE_GENERATION_STAGE) private readonly subtitle: SubtitleGenerationStage,
    @Inject(COMPOSITION_STAGE) private readonly compose: CompositionStage,
  ) {}

  async execute(
    ctx: StageContext,
    plan: RepairPlan,
    composed: { assetId: string; duration: number; width: number; height: number },
  ): Promise<RepairExecuteResult> {
    let current = { ...composed };
    let providerCalls = 0;
    const output = asPipelineOutput(ctx.job.output);
    const visualKeep = [...(output.stages.visual?.assetIds ?? [])];
    const voiceBefore = output.stages.voice?.assetIds?.[0];
    const replacedSequences: number[] = [];
    let voiceForced = false;
    let subtitleForced = false;

    for (const action of plan.actions) {
      if (action.type === 'MARK_BEST_AVAILABLE') {
        continue;
      }
      if (action.type === 'REBUILD_TIMELINE' || action.type === 'ADJUST_SHOT_DURATION') {
        this.patchTimeline(output, ctx);
      }
      if (action.type === 'REPLACE_SHOT_ASSET' || action.type === 'REGENERATE_AI_IMAGE') {
        const seq = action.shotSequence;
        if (seq != null) {
          replacedSequences.push(seq);
          const exclude = action.assetId ? [action.assetId] : [];
          const snapshot = await reresolveAffectedShots(ctx, [seq], exclude);
          output.materialResolution = snapshot;
          const shot = snapshot.shots.find((item) => item.sequence === seq);
          const timeline = output.editingTimeline;
          const clip = timeline?.tracks.visual.find((item) => item.sequence === seq);
          if (clip && shot?.assetId) {
            clip.assetId = shot.assetId;
            clip.assetType = shot.assetType ?? clip.assetType;
          }
          const index = ctx.plan.scenes.findIndex((scene) => scene.sequence === seq);
          if (index >= 0 && shot?.assetId) {
            visualKeep[index] = shot.assetId;
          }
          if (shot?.generationRequired || action.type === 'REGENERATE_AI_IMAGE') {
            if (output.stages.visual?.scenes) {
              const scene = ctx.plan.scenes[index];
              output.stages.visual.scenes = output.stages.visual.scenes.map((item) =>
                item.sequence === seq ? { ...item, assetId: undefined, status: 'pending' } : item,
              );
              if (scene) {
                void scene;
              }
            }
            await ctx.jobs.mergeOutput(ctx.job.tenantId, ctx.job.id, output as never);
            ctx.job = await ctx.jobs.getById(ctx.job.tenantId, ctx.job.id);
            const ids = await this.visual.run(ctx);
            visualKeep.splice(0, visualKeep.length, ...ids);
            providerCalls += 1;
          }
        }
      }
      if (action.type === 'REBUILD_SUBTITLE') {
        subtitleForced = true;
        const subtitleId = output.stages.subtitle?.assetIds?.[0];
        const asset = subtitleId
          ? await ctx.prisma.asset.findFirst({ where: { id: subtitleId, tenantId: ctx.job.tenantId } })
          : null;
        let cues = asset?.storageKey && (await ctx.storage.exists(asset.storageKey))
          ? parseSrt((await ctx.storage.get(asset.storageKey)).toString('utf8'))
          : [];
        cues = reflowOverflowCues(cues);
        const voiceId = output.stages.voice?.assetIds?.[0];
        const duration = output.stages.voice?.duration ?? current.duration;
        const newId = await this.subtitle.run(ctx, duration, voiceId, { force: true, cues });
        output.stages.subtitle = {
          status: 'completed',
          assetIds: [newId],
          completedAt: new Date().toISOString(),
        };
        if (output.editingTimeline) {
          output.editingTimeline.metadata.subtitleAssetId = newId;
          output.editingTimeline.tracks.subtitle = [{ assetId: newId, timingMode: 'VOICE_ALIGNED', styleHint: ctx.plan.subtitle.style }];
        }
      }
      if (action.type === 'REGENERATE_VOICE') {
        voiceForced = true;
        const voice = await this.voice.run(ctx, { force: true });
        providerCalls += 1;
        output.stages.voice = {
          status: 'completed',
          assetIds: [voice.assetId],
          duration: voice.duration,
          provider: voice.provider,
          model: voice.model,
          completedAt: new Date().toISOString(),
        };
      }
    }

    if (output.editingTimeline) {
      this.rehashTimeline(output.editingTimeline);
    }
    output.stages.visual = {
      ...(output.stages.visual ?? { status: 'completed', assetIds: visualKeep }),
      assetIds: visualKeep,
      status: 'completed',
    };
    await ctx.jobs.mergeOutput(ctx.job.tenantId, ctx.job.id, output as never);
    ctx.job = await ctx.jobs.getById(ctx.job.tenantId, ctx.job.id);

    if (plan.requiresRecompose || plan.actions.some((item) => item.type === 'RECOMPOSE')) {
      const voiceDuration = asPipelineOutput(ctx.job.output).stages.voice?.duration ?? current.duration;
      current = await this.compose.run(ctx, { voiceDuration, force: true });
    }

    const latest = asPipelineOutput(ctx.job.output);
    const afterHash = hashQualityInput({
      composeAssetId: current.assetId,
      timelineHash: latest.editingTimeline?.timelineHash,
      voiceAssetId: latest.stages.voice?.assetIds?.[0],
      subtitleAssetId: latest.stages.subtitle?.assetIds?.[0],
    });
    return {
      composeAssetId: current.assetId,
      duration: current.duration,
      width: current.width,
      height: current.height,
      providerCalls,
      afterHash,
      reusedVoice: !voiceForced && latest.stages.voice?.assetIds?.[0] === voiceBefore,
      reusedVisualExcept: replacedSequences,
      subtitleRebuilt: subtitleForced,
    } as RepairExecuteResult & { subtitleRebuilt: boolean };
  }

  private patchTimeline(output: ReturnType<typeof asPipelineOutput>, ctx: StageContext) {
    const timeline = output.editingTimeline;
    if (!timeline) {
      return;
    }
    repairVisualGaps(timeline.tracks.visual, timeline.durationMs);
    const materials = output.materialResolution;
    if (materials && ctx.plan.scenes.some((scene) => scene.sourceKind === 'cta')) {
      const last = materials.shots.at(-1);
      if (last && last.shotPurpose !== 'CTA') {
        last.shotPurpose = 'CTA';
      }
    }
    this.rehashTimeline(timeline);
  }

  private rehashTimeline(timeline: EditingTimelineV1) {
    timeline.timelineHash = hashEditingTimeline({
      visual: timeline.tracks.visual,
      voiceAssetId: timeline.metadata.voiceAssetId,
      subtitleAssetId: timeline.metadata.subtitleAssetId,
      durationMs: timeline.durationMs,
      originalAudio: timeline.tracks.originalAudio.map((item) => item.mode ?? 'MUTE'),
      aspectRatio: timeline.aspectRatio,
    });
  }
}
