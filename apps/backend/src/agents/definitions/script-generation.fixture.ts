import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from './account-positioning.fixture.js';
import { MOCK_CONTENT_PLAN_OUTPUT } from './content-planning.fixture.js';
import type { ScriptGenerationInput, ScriptOutput, ScriptTargetDuration } from './script-generation.types.js';

export type MockScriptDomain = 'coffee' | 'workplace';

export function inferMockScriptDomain(text = ''): MockScriptDomain {
  if (/咖啡|手冲|拿铁|到店|cafe|coffee/i.test(text)) {
    return 'coffee';
  }
  return 'workplace';
}

export function buildMockScriptOutput(
  targetDuration: ScriptTargetDuration = 30,
  hint?: string,
): ScriptOutput {
  const domain = inferMockScriptDomain(hint);
  const copy = domain === 'coffee' ? coffeeCopy() : workplaceCopy();
  const sectionCount = targetDuration <= 15 ? 2 : targetDuration <= 30 ? 3 : 4;
  const each = Math.floor(targetDuration / sectionCount);
  const remainder = targetDuration - each * sectionCount;
  const sections = Array.from({ length: sectionCount }, (_, index) => {
    const duration = each + (index === sectionCount - 1 ? remainder : 0);
    const narration = repeatToLength(copy.sectionNarration(index), Math.max(20, Math.round(duration * 4.5)));
    return {
      sequence: index + 1,
      narration,
      visualSuggestion: copy.visual(index),
      subtitle: copy.subtitle(index),
      duration,
    };
  });
  const all = [copy.hook, copy.opening, ...sections.map((item) => item.narration), copy.ending, copy.cta].join('');
  return {
    title: copy.title(targetDuration),
    hook: copy.hook,
    opening: copy.opening,
    sections,
    ending: copy.ending,
    cta: copy.cta,
    totalDuration: targetDuration,
    estimatedWordCount: countWords(all),
    voiceStyle: copy.voiceStyle,
    visualStyle: copy.visualStyle,
    productionNotes: copy.notes,
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

function workplaceCopy() {
  return {
    title: (duration: number) => `${duration}秒沟通清单脚本`,
    hook: '新人最容易踩的坑，不是不会说话，是开口太晚。',
    opening: '今天只给你一个能在下班前用上的沟通清单。',
    ending: '先改一件事，比收藏十条方法论更有用。',
    cta: '评论区留下你这周要改的一件事。',
    voiceStyle: '冷静、中速、不鸡血',
    visualStyle: '口播拆解 + 清单卡片',
    notes: ['字幕压在安全区', '不要出现具体公司名'],
    sectionNarration: (index: number) => `第${index + 1}段：用清单把职场沟通拆成这一周就能做的动作。`,
    visual: (index: number) => `口播出镜 + 第${index + 1}步清单卡片`,
    subtitle: (index: number) => `第${index + 1}步，先改一件事`,
  };
}

function coffeeCopy() {
  return {
    title: (duration: number) => `${duration}秒手冲到店脚本`,
    hook: '手冲不好喝，常常不是豆子的问题，是水温节奏乱了。',
    opening: '今天只用一杯手冲，把到店体验讲清楚。',
    ending: '先把注水节奏稳住，比囤一堆器具更有用。',
    cta: '下班路过就来店里坐坐，今天把这杯手冲喝了再走。',
    voiceStyle: '温暖、中速、不夸张',
    visualStyle: '手冲特写 + 到店座位',
    notes: ['字幕压在安全区', '画面围绕咖啡店而不是职场'],
    sectionNarration: (index: number) =>
      `第${index + 1}段：把这杯手冲的风味层次和到店理由讲明白。`,
    visual: (index: number) => `手冲注水特写 + 第${index + 1}步到店引导`,
    subtitle: (index: number) =>
      index === 0 ? '今天就把这杯手冲的风味层次讲清楚给你听' : `第${index + 1}步，周末到店试手冲`,
  };
}

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
