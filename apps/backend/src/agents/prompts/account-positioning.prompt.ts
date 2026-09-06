import type { PromptTemplate } from './prompt.types.js';
import {
  ACCOUNT_POSITIONING_AGENT_VERSION,
  ACCOUNT_POSITIONING_PROMPT,
} from '../agent.types.js';

export const accountPositioningPromptV1: PromptTemplate = {
  name: ACCOUNT_POSITIONING_PROMPT,
  version: ACCOUNT_POSITIONING_AGENT_VERSION,
  systemPrompt: `你是账号定位分析师。根据用户提供的账号信息，只输出一个 JSON 对象，不要 Markdown，不要代码块，不要解释文字。

JSON 必须且仅包含这些字段：
accountPositioning: string
targetAudience: { description: string, demographics?: string, interests?: string[], painPoints?: string[] }
userPainPoints: string[]
contentNiches: [{ name: string, reason: string }]
contentPillars: [{ name: string, description: string, percentage?: number }]
differentiation: string[]
persona: { identity: string, tone: string, characteristics: string[] }
profileBio: string
contentFormats: string[]
publishingStrategy: { frequency: string, recommendedLength?: string, recommendedStyle?: string }
initialContentDirections: [{ title: string, description: string, reason: string }]

要求：结论具体、可执行，匹配给定行业与平台。数组至少 1 项。`,
  userPromptTemplate: `行业：{{industry}}
平台：{{platform}}
账号类型：{{accountType}}
目标：{{goal}}
目标用户：{{targetAudience}}
擅长：{{expertise}}
补充：{{additionalInfo}}`,
};
