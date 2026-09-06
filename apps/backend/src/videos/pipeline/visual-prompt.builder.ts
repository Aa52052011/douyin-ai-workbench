import type { SceneSourceKind } from './production-plan.types.js';

export const VISUAL_PROMPT_VERSION = 'v1';
export const DEFAULT_VISUAL_NEGATIVE_PROMPT = '字幕, 水印, 二维码, 变形手指, 文字, logo';

export type VisualPrompt = {
  sceneId?: string;
  sequence?: number;
  sourceKind: SceneSourceKind;
  prompt: string;
  negativePrompt: string;
  style: string;
  aspectRatio: string;
  language: 'zh-CN';
};

export function buildVisualPrompt(input: {
  sourceKind: SceneSourceKind;
  narration: string;
  visualSuggestion: string;
  visualStyle: string;
  aspectRatio: string;
  negativePrompt?: string;
  sceneId?: string;
  sequence?: number;
}): VisualPrompt {
  const style = input.visualStyle.trim() || 'default';
  const suggestion = input.visualSuggestion.trim() || style;
  const narration = clipText(input.narration.trim(), 80);
  const aspectRatio = input.aspectRatio.trim() || '9:16';
  const prompt = [
    `竖屏 ${aspectRatio} 静帧，不要字幕、不要水印、不要界面文字。`,
    `风格：${style}`,
    `画面：${suggestion}`,
    `内容要点：${narration}`,
    `镜头：${input.sourceKind}`,
  ].join('\n');
  return {
    sceneId: input.sceneId,
    sequence: input.sequence,
    sourceKind: input.sourceKind,
    prompt,
    negativePrompt: input.negativePrompt?.trim() || DEFAULT_VISUAL_NEGATIVE_PROMPT,
    style,
    aspectRatio,
    language: 'zh-CN',
  };
}

function clipText(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max).trim()}…`;
}
