import { createHash } from 'node:crypto';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { deterministicUuid } from '../../common/ids.js';
import type { ScriptOutput } from '../../agents/definitions/script-generation.types.js';
import type {
  ProductionScene,
  SceneSourceKind,
  VideoGenerationConfig,
  VideoProductionPlan,
} from './production-plan.types.js';
import { buildVisualPrompt, DEFAULT_VISUAL_NEGATIVE_PROMPT } from './visual-prompt.builder.js';

const EXTRA_BUDGET: Record<Exclude<SceneSourceKind, 'section'>, number> = {
  hook: 2,
  opening: 2,
  ending: 2,
  cta: 2,
};

export function asScriptOutput(payload: unknown): ScriptOutput {
  if (!payload || typeof payload !== 'object') {
    throw new AppError(ErrorCode.VIDEO_PLAN_INVALID);
  }
  const value = payload as Partial<ScriptOutput>;
  if (typeof value.title !== 'string' || !Array.isArray(value.sections) || value.sections.length === 0) {
    throw new AppError(ErrorCode.VIDEO_PLAN_INVALID);
  }
  return value as ScriptOutput;
}

export function buildVoiceText(payload: ScriptOutput): string {
  return [payload.hook, payload.opening, ...payload.sections.map((item) => item.narration), payload.ending, payload.cta]
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n');
}

export function buildProductionPlan(input: {
  scriptId: string;
  videoId: string;
  scriptVersion: number;
  payload: unknown;
  config?: VideoGenerationConfig;
}): VideoProductionPlan {
  const payload = asScriptOutput(input.payload);
  const visualStyle = input.config?.visualStyle?.trim() || payload.visualStyle || 'default';
  const aspectRatio = input.config?.aspectRatio ?? '9:16';
  const scenes: ProductionScene[] = [];
  pushScene(scenes, input.videoId, {
    sourceKind: 'hook',
    sourceSectionSequence: -2,
    narration: payload.hook,
    subtitle: payload.hook,
    visualSuggestion: payload.visualStyle,
    durationBudget: EXTRA_BUDGET.hook,
    visualStyle,
    aspectRatio,
  });
  pushScene(scenes, input.videoId, {
    sourceKind: 'opening',
    sourceSectionSequence: -1,
    narration: payload.opening,
    subtitle: payload.opening,
    visualSuggestion: payload.visualStyle,
    durationBudget: EXTRA_BUDGET.opening,
    visualStyle,
    aspectRatio,
  });
  for (const section of [...payload.sections].sort((a, b) => a.sequence - b.sequence)) {
    pushScene(scenes, input.videoId, {
      sourceKind: 'section',
      sourceSectionSequence: section.sequence,
      narration: section.narration,
      subtitle: section.subtitle || section.narration,
      visualSuggestion: section.visualSuggestion,
      durationBudget: Math.max(1, section.duration),
      visualStyle,
      aspectRatio,
    });
  }
  pushScene(scenes, input.videoId, {
    sourceKind: 'ending',
    sourceSectionSequence: 10001,
    narration: payload.ending,
    subtitle: payload.ending,
    visualSuggestion: payload.visualStyle,
    durationBudget: EXTRA_BUDGET.ending,
    visualStyle,
    aspectRatio,
  });
  pushScene(scenes, input.videoId, {
    sourceKind: 'cta',
    sourceSectionSequence: 10002,
    narration: payload.cta,
    subtitle: payload.cta,
    visualSuggestion: payload.visualStyle,
    durationBudget: EXTRA_BUDGET.cta,
    visualStyle,
    aspectRatio,
  });
  if (scenes.length === 0 || scenes.every((item) => item.durationBudget <= 0)) {
    throw new AppError(ErrorCode.VIDEO_PLAN_INVALID);
  }
  const targetDuration = input.config?.targetDuration ?? payload.totalDuration;
  const voiceText = buildVoiceText(payload);
  const plan: VideoProductionPlan = {
    version: 1,
    scriptId: input.scriptId,
    videoId: input.videoId,
    scriptVersion: input.scriptVersion,
    generationVersion: '',
    aspectRatio,
    resolution: input.config?.resolution ?? '1080x1920',
    fps: 30,
    targetDuration,
    voice: {
      style: input.config?.voiceStyle?.trim() || payload.voiceStyle || 'default',
      language: 'zh-CN',
      speed: 1,
      text: voiceText,
    },
    scenes,
    audio: { backgroundMusic: 'none', volume: 0.15 },
    subtitle: { style: 'default', position: 'bottom', format: 'srt' },
    output: { format: 'mp4', codec: 'h264' },
  };
  plan.generationVersion = fingerprintPlan(plan);
  return plan;
}

function pushScene(
  scenes: ProductionScene[],
  videoId: string,
  input: {
    sourceKind: SceneSourceKind;
    sourceSectionSequence: number;
    narration: string;
    subtitle: string;
    visualSuggestion: string;
    durationBudget: number;
    visualStyle: string;
    aspectRatio: string;
  },
): void {
  const narration = input.narration.trim();
  if (!narration) {
    return;
  }
  const sequence = scenes.length + 1;
  const sceneId = deterministicUuid(videoId, `v1:${input.sourceKind}:${input.sourceSectionSequence}:${sequence}`);
  const visual = buildVisualPrompt({
    sceneId,
    sequence,
    sourceKind: input.sourceKind,
    narration,
    visualSuggestion: input.visualSuggestion,
    visualStyle: input.visualStyle,
    aspectRatio: input.aspectRatio,
  });
  scenes.push({
    sceneId,
    sourceSectionSequence: input.sourceSectionSequence,
    sourceKind: input.sourceKind,
    sequence,
    narration,
    subtitle: input.subtitle.trim() || narration,
    visualSuggestion: input.visualSuggestion,
    visualPrompt: visual.prompt,
    visualNegativePrompt: visual.negativePrompt || DEFAULT_VISUAL_NEGATIVE_PROMPT,
    visualSourceType: 'COLOR_BACKGROUND',
    durationBudget: input.durationBudget,
    transition: 'cut',
  });
}

function fingerprintPlan(plan: VideoProductionPlan): string {
  return createHash('sha256')
    .update(
      [
        plan.scriptId,
        String(plan.scriptVersion),
        plan.videoId,
        plan.voice.text,
        plan.voice.style,
        String(plan.targetDuration),
        plan.aspectRatio,
        plan.resolution,
        plan.scenes.map((item) => `${item.visualSourceType}:${item.visualPrompt}:${item.visualNegativePrompt ?? ''}`).join('||'),
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 16);
}
