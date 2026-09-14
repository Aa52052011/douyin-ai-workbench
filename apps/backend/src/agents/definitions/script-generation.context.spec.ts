import { describe, expect, it } from 'vitest';
import { MOCK_CONTENT_PLAN_OUTPUT } from './content-planning.fixture.js';
import {
  buildCompactContentPlanContext,
  buildCompactPreviousScriptSummaries,
  buildCompactStrategyContext,
} from './script-generation.context.js';

describe('script.generation compact context (12.12P)', () => {
  it('marks CURRENT / PREVIOUS / UPCOMING without internal ids', () => {
    const topics = MOCK_CONTENT_PLAN_OUTPUT.topics;
    const current = topics[1] ?? topics[0];
    const ctx = buildCompactContentPlanContext({
      planTitle: MOCK_CONTENT_PLAN_OUTPUT.title,
      payload: MOCK_CONTENT_PLAN_OUTPUT,
      currentTopicId: current.id,
    });
    expect(ctx.planTitle).toBeTruthy();
    expect(ctx.topics.length).toBe(topics.length);
    expect(ctx.batchSize).toBe(topics.length);
    expect(ctx.topics.every((t) => typeof t.itemIndex === 'number' && t.itemIndex >= 1)).toBe(true);
    expect(ctx.topics.some((t) => t.role === 'CURRENT')).toBe(true);
    expect(JSON.stringify(ctx)).not.toMatch(/00000000-0000-4000-8000/);
    expect(ctx.topics.every((t) => !('id' in t))).toBe(true);
  });

  it('includes only confirmed previous scripts as compact summaries', () => {
    const topics = MOCK_CONTENT_PLAN_OUTPUT.topics;
    const summaries = buildCompactPreviousScriptSummaries({
      topics,
      currentTopicId: topics[1].id,
      scripts: [
        {
          topicId: topics[0].id,
          status: 'DRAFT',
          title: 'draft should ignore',
          payload: { hook: 'draft-hook', opening: 'd', cta: 'c', sections: [] },
        },
        {
          topicId: topics[0].id,
          status: 'CONFIRMED',
          title: 'Day1 script',
          payload: {
            title: 'Day1 script',
            hook: 'confirmed-hook',
            opening: 'opening text',
            sections: [{ sequence: 1, narration: 'section one', visualSuggestion: 'v', subtitle: 's', duration: 10 }],
            ending: 'e',
            cta: 'cta-1',
            totalDuration: 30,
            estimatedWordCount: 100,
            voiceStyle: 'v',
            visualStyle: 'v',
            productionNotes: ['n'],
          },
          topicSnapshot: topics[0],
        },
      ],
    });
    expect(summaries).toHaveLength(1);
    expect(summaries[0].hook).toBe('confirmed-hook');
    expect(summaries[0].scriptTitle).toBe('Day1 script');
    expect(JSON.stringify(summaries)).not.toContain(topics[0].id);
  });

  it('builds compact strategy without raw ids', () => {
    const strategy = buildCompactStrategyContext({
      version: 'v1',
      objective: { primaryObjective: '验证职场成长', businessGoal: '涨粉' },
      targetAudience: { primary: '职场新人' },
      positioning: { accountRole: '过来人', marketPosition: '方法拆解' },
      contentMix: [{ type: '认知纠偏', purpose: '建立信任' }],
    });
    expect(strategy?.primaryObjective).toBe('验证职场成长');
    expect(strategy?.goalCode).toBe('FOLLOW_GROWTH');
    expect(strategy?.contentDirections?.[0]).toContain('认知纠偏');
  });
});
