import type { SceneSourceKind } from './production-plan.types.js';

export const VISUAL_PROMPT_VERSION = 'v2';
export const DEFAULT_VISUAL_NEGATIVE_PROMPT =
  '字幕, 水印, 二维码, 变形手指, 真人模特, 餐饮店外景, 霓虹科幻, 乱码招牌, 无关风景';

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
  const narration = clipText(input.narration.trim(), 160);
  const aspectRatio = input.aspectRatio.trim() || '9:16';
  const prompt = [
    `竖屏 ${aspectRatio} 产品工作台界面静帧。`,
    `视觉意图：${narration}`,
    `必须出现的证据：${suggestion}`,
    `风格：${style}；扁平中文 SaaS 后台/工作流界面，字段、列表或结果面板清晰。`,
    `禁止：真人模特、餐饮店外景、霓虹科幻、夸张手部、乱码招牌、与旁白无关的装饰场景。`,
    `不要字幕、不要水印、不要二维码。镜头：${input.sourceKind}`,
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
