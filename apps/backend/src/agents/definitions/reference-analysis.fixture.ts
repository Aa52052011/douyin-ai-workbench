import { buildDeterministicReferenceAnalysis } from '../../market/reference-intelligence.helpers.js';
import type { ReferenceAnalysisAgentInput } from '../../market/reference-intelligence.types.js';

export function buildMockReferenceAnalysisText(prompt: string): string {
  const input: ReferenceAnalysisAgentInput = {
    referenceContentId: '00000000-0000-7000-8000-000000000001',
    sourceType: 'UPLOAD_VIDEO',
    title: extract(prompt, /标题[：:]\s*(.+)/) || '参考内容',
    userNote:
      extract(prompt, /用户说明[：:]\s*([\s\S]+?)(?:\n资产|$)/) ||
      '提问开场，痛点到解决方案，快节奏，短句字幕，引导私信',
    reasonForReference: '学习结构和节奏',
    availableText: prompt.slice(0, 500),
  };
  return JSON.stringify(buildDeterministicReferenceAnalysis(input));
}

function extract(text: string, re: RegExp): string | undefined {
  const m = text.match(re);
  return m?.[1]?.trim() || undefined;
}
