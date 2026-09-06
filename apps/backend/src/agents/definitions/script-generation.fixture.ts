import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from './account-positioning.fixture.js';
import { MOCK_CONTENT_PLAN_OUTPUT } from './content-planning.fixture.js';
import type { ScriptGenerationInput, ScriptOutput, ScriptTargetDuration } from './script-generation.types.js';

export function buildMockScriptOutput(targetDuration: ScriptTargetDuration = 30): ScriptOutput {
  const sectionCount = targetDuration <= 15 ? 2 : targetDuration <= 30 ? 3 : 4;
  const each = Math.floor(targetDuration / sectionCount);
  const remainder = targetDuration - each * sectionCount;
  const sections = Array.from({ length: sectionCount }, (_, index) => {
    const duration = each + (index === sectionCount - 1 ? remainder : 0);
    const narration = repeatToLength(
      `第${index + 1}段：用清单把职场沟通拆成这一周就能做的动作。`,
      Math.max(20, Math.round(duration * 4.5)),
    );
    return {
      sequence: index + 1,
      narration,
      visualSuggestion: `口播出镜 + 第${index + 1}步清单卡片`,
      subtitle: `第${index + 1}步，先改一件事`,
      duration,
    };
  });
  const hook = '新人最容易踩的坑，不是不会说话，是开口太晚。';
  const opening = '今天只给你一个能在下班前用上的沟通清单。';
  const ending = '先改一件事，比收藏十条方法论更有用。';
  const cta = '评论区留下你这周要改的一件事。';
  const all = [hook, opening, ...sections.map((item) => item.narration), ending, cta].join('');
  return {
    title: `${targetDuration}秒沟通清单脚本`,
    hook,
    opening,
    sections,
    ending,
    cta,
    totalDuration: targetDuration,
    estimatedWordCount: countWords(all),
    voiceStyle: '冷静、中速、不鸡血',
    visualStyle: '口播拆解 + 清单卡片',
    productionNotes: ['字幕压在安全区', '不要出现具体公司名'],
  };
}

export function buildMockScriptInput(
  overrides?: Partial<ScriptGenerationInput>,
): ScriptGenerationInput {
  const topic = MOCK_CONTENT_PLAN_OUTPUT.topics[0];
  return {
    contentPlanId: '00000000-0000-4000-8000-000000000001',
    topicId: topic.id,
    topic,
    positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
    platform: 'douyin',
    contentStyle: '冷静具体',
    planTitle: MOCK_CONTENT_PLAN_OUTPUT.title,
    targetDuration: 30,
    ...overrides,
  };
}

export const MOCK_SCRIPT_OUTPUT = buildMockScriptOutput(30);

function repeatToLength(seed: string, length: number): string {
  let text = seed;
  while (countWords(text) < length) {
    text += '下一步只做能检查的动作。';
  }
  return text;
}

function countWords(text: string): number {
  return text.replace(/\s+/g, '').length;
}
