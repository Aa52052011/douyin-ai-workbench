import { describe, expect, it } from 'vitest';
import { MOCK_SCRIPT_OUTPUT } from '../../agents/definitions/script-generation.fixture.js';
import { buildProductionPlan, buildVoiceText } from './production-plan.builder.js';
import { REAL_VISUAL_PIPELINE_SCRIPT } from './real-visual-pipeline.fixture.js';
import { visualClientRequestId } from './visual-reuse.js';

const SCRIPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VIDEO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('ProductionPlanBuilder', () => {
  it('reads Script.payload and keeps hook/opening/sections/ending/cta', () => {
    const plan = buildProductionPlan({
      scriptId: SCRIPT_ID,
      videoId: VIDEO_ID,
      scriptVersion: 1,
      payload: MOCK_SCRIPT_OUTPUT,
    });
    const voice = buildVoiceText(MOCK_SCRIPT_OUTPUT);
    expect(voice).toContain(MOCK_SCRIPT_OUTPUT.hook);
    expect(voice).toContain(MOCK_SCRIPT_OUTPUT.opening);
    expect(voice).toContain(MOCK_SCRIPT_OUTPUT.ending);
    expect(voice).toContain(MOCK_SCRIPT_OUTPUT.cta);
    for (const section of MOCK_SCRIPT_OUTPUT.sections) {
      expect(voice).toContain(section.narration);
    }
    expect(plan.voice.text).toBe(voice);
    expect(plan.scenes.some((item) => item.sourceKind === 'hook')).toBe(true);
    expect(plan.scenes.some((item) => item.sourceKind === 'opening')).toBe(true);
    expect(plan.scenes.some((item) => item.sourceKind === 'ending')).toBe(true);
    expect(plan.scenes.some((item) => item.sourceKind === 'cta')).toBe(true);
    expect(plan.scenes.filter((item) => item.sourceKind === 'section')).toHaveLength(
      MOCK_SCRIPT_OUTPUT.sections.length,
    );
    expect(plan.targetDuration).toBe(MOCK_SCRIPT_OUTPUT.totalDuration);
    expect(plan.scenes.every((item) => item.visualSourceType === 'COLOR_BACKGROUND')).toBe(true);
    expect(plan.scenes.every((item) => item.visualPrompt.length > 0)).toBe(true);
    expect(plan.scenes.every((item) => (item.visualNegativePrompt ?? '').length > 0)).toBe(true);
    expect(JSON.stringify(plan.scenes)).not.toContain('Authorization');
  });

  it('normalizes AI pronunciation without rewriting claims', () => {
    const payload = {
      ...MOCK_SCRIPT_OUTPUT,
      hook: '如果你以为它只是一个会写文案的AI',
      opening: MOCK_SCRIPT_OUTPUT.opening,
    };
    expect(buildVoiceText(payload)).toContain('A I');
    expect(buildVoiceText(payload)).not.toContain('爆款保证');
    expect(buildVoiceText(payload)).toContain(payload.opening);
  });

  it('uses deterministic scene ids and is stable for the same input', () => {
    const first = buildProductionPlan({
      scriptId: SCRIPT_ID,
      videoId: VIDEO_ID,
      scriptVersion: 1,
      payload: MOCK_SCRIPT_OUTPUT,
    });
    const second = buildProductionPlan({
      scriptId: SCRIPT_ID,
      videoId: VIDEO_ID,
      scriptVersion: 1,
      payload: MOCK_SCRIPT_OUTPUT,
    });
    expect(first.scenes.map((item) => item.sceneId)).toEqual(second.scenes.map((item) => item.sceneId));
    expect(first.generationVersion).toBe(second.generationVersion);
    expect(new Set(first.scenes.map((item) => item.sceneId)).size).toBe(first.scenes.length);
  });

  it('freezes visual prompts into generationVersion', () => {
    const first = buildProductionPlan({
      scriptId: SCRIPT_ID,
      videoId: VIDEO_ID,
      scriptVersion: 1,
      payload: MOCK_SCRIPT_OUTPUT,
      config: { visualStyle: '口播清单' },
    });
    const second = buildProductionPlan({
      scriptId: SCRIPT_ID,
      videoId: VIDEO_ID,
      scriptVersion: 1,
      payload: MOCK_SCRIPT_OUTPUT,
      config: { visualStyle: '电影感夜景' },
    });
    expect(first.generationVersion).not.toBe(second.generationVersion);
    expect(first.scenes[0]?.visualPrompt).toContain('口播清单');
    expect(second.scenes[0]?.visualPrompt).toContain('电影感夜景');
  });

  it('Step 7.5 fixture yields exactly 4 visual scenes', () => {
    expect(REAL_VISUAL_PIPELINE_SCRIPT).toHaveProperty('hook');
    expect(REAL_VISUAL_PIPELINE_SCRIPT).toHaveProperty('opening');
    expect(REAL_VISUAL_PIPELINE_SCRIPT).toHaveProperty('sections');
    expect(REAL_VISUAL_PIPELINE_SCRIPT).toHaveProperty('ending');
    expect(REAL_VISUAL_PIPELINE_SCRIPT).toHaveProperty('cta');
    expect(REAL_VISUAL_PIPELINE_SCRIPT.sections).toHaveLength(4);
    const plan = buildProductionPlan({
      scriptId: SCRIPT_ID,
      videoId: VIDEO_ID,
      scriptVersion: 1,
      payload: REAL_VISUAL_PIPELINE_SCRIPT,
      config: { targetDuration: 30 },
    });
    expect(plan.scenes).toHaveLength(4);
    expect(plan.targetDuration).toBe(30);
    expect(new Set(plan.scenes.map((item) => item.sceneId)).size).toBe(4);
    expect(plan.generationVersion.length).toBeGreaterThan(0);
    expect(plan.scenes.every((item) => item.visualPrompt.length > 0)).toBe(true);
    expect(plan.scenes.every((item) => item.sourceKind === 'section')).toBe(true);
    const firstIds = plan.scenes.map((item) =>
      visualClientRequestId('job-fixed', item.sceneId, plan.generationVersion),
    );
    const secondIds = plan.scenes.map((item) =>
      visualClientRequestId('job-fixed', item.sceneId, plan.generationVersion),
    );
    expect(firstIds).toEqual(secondIds);
    expect(new Set(firstIds).size).toBe(4);
    expect(firstIds.every((id) => id.startsWith('job-fixed:visual:'))).toBe(true);
    const voice = buildVoiceText(REAL_VISUAL_PIPELINE_SCRIPT);
    expect(voice.length).toBeGreaterThan(0);
    expect(voice.length).toBeLessThanOrEqual(10_000);
  });
});
