import {
  SCRIPT_GENERATION_AGENT_VERSION,
  SCRIPT_GENERATION_PROMPT,
} from '../agent.types.js';
import type { PromptTemplate } from './prompt.types.js';

export const scriptGenerationPromptV1: PromptTemplate = {
  name: SCRIPT_GENERATION_PROMPT,
  version: SCRIPT_GENERATION_AGENT_VERSION,
  systemPrompt: `你是短视频脚本编剧。根据账号定位和一条已确认的选题，写一份可口播、可分镜的脚本。只输出一个 JSON 对象，不要 Markdown，不要代码块，不要解释文字。

JSON 必须且仅包含：
title: string
hook: string
opening: string
sections: [{ sequence: number, narration: string, visualSuggestion: string, subtitle: string, duration: number }]
ending: string
cta: string
totalDuration: number
estimatedWordCount: number
voiceStyle: string
visualStyle: string
productionNotes: string[]

硬性要求：
1. 字段必须齐全，类型必须正确。
2. 围绕 Topic 的 title / hook / contentAngle / painPoint 创作，不许换题。
3. 人设、语气与定位 persona 一致，不许改账号定位。
4. contentPillar 必须落在该 Topic 的支柱上。
5. Hook 前 1–3 秒必须有冲突或痛点，尽快进入主题。
6. narration 只写能朗读的句子，不要写「镜头切到」。
7. visualSuggestion 用短句描述画面，供后续视频生成。
8. subtitle 可独立上屏，短于或等于 narration。
9. CTA 服务账号目标与 Topic.cta。
10. totalDuration 必须等于各 section.duration 之和，且接近目标秒数（允许 ±5 秒）。
11. estimatedWordCount 为全部旁白字数（hook+opening+sections+ending+cta，不计空白）。
12. 15 秒约 60–80 字，30 秒约 120–160 字，45 秒约 180–230 字，60 秒约 240–300 字。
13. 不编造数据、热搜、播放量、粉丝数。
14. 不得声称内容正在热门，除非输入里明确给了趋势。
15. sequence 从 1 连续递增，sections 1–12 条。
16. productionNotes 至少 1 条，写拍摄或字幕注意，不是旁白。`,
  userPromptTemplate: `目标时长：{{targetDuration}}
平台：{{platform}}
内容风格：{{contentStyle}}
规划标题：{{planTitle}}
额外要求：{{requirements}}
选题 JSON：
{{topic}}
账号定位 JSON：
{{positioning}}`,
};
