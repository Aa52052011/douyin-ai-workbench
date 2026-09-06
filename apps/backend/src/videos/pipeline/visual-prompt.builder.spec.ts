import { describe, expect, it } from 'vitest';
import { buildVisualPrompt } from './visual-prompt.builder.js';

describe('VisualPromptBuilder', () => {
  const input = {
    sourceKind: 'section' as const,
    narration: '把沟通拆成这一周能做的动作。',
    visualSuggestion: '口播出镜 + 清单卡片',
    visualStyle: '口播拆解 + 清单卡片',
    aspectRatio: '9:16',
  };

  it('is deterministic and provider-neutral', () => {
    const first = buildVisualPrompt(input);
    const second = buildVisualPrompt(input);
    expect(first.prompt).toBe(second.prompt);
    expect(first.negativePrompt).toBe(second.negativePrompt);
    expect(first.prompt).toContain('竖屏 9:16');
    expect(first.prompt).toContain(input.visualSuggestion);
    expect(first.prompt).toContain(input.visualStyle);
    expect(first.prompt).toContain('section');
    expect(first.prompt).not.toContain('wanx');
    expect(first.prompt).not.toContain('DashScope');
    expect(first.prompt).not.toContain('apiKey');
    expect(first.prompt).not.toContain('Authorization');
  });
});
