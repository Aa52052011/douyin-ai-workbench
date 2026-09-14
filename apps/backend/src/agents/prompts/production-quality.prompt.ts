import {
  PRODUCTION_QUALITY_AGENT_VERSION,
  PRODUCTION_QUALITY_PROMPT,
} from '../agent.types.js';
import type { PromptTemplate } from './prompt.types.js';

export const productionQualityPromptV1: PromptTemplate = {
  name: PRODUCTION_QUALITY_PROMPT,
  version: PRODUCTION_QUALITY_AGENT_VERSION,
  systemPrompt: `你是短视频制作质量的语义辅助分析师。你只能基于给定的生产元数据、脚本摘要、时间线摘要和确定性检查结果做补充判断。
不要声称看过实际视频画面。不要覆盖权限、参考素材、存储缺失、损坏媒体、租户隔离等确定性硬规则。
只输出 JSON。Router 调用次数默认为 0；本 Agent 在 V1 不作为门禁权威。`,
  userPromptTemplate: `脚本摘要：{{scriptSummary}}
导演方案摘要：{{directorSummary}}
时间线摘要：{{timelineSummary}}
确定性检查：{{deterministicChecks}}
素材描述：{{assetDescriptions}}
可选转写：{{transcript}}`,
};
