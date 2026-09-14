import { describe, expect, it } from 'vitest';
import { assembleContent01Clean } from '../visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { loadFrozenDynamicPlan } from './plan-io.js';
import { validateDynamicPlan } from './plan-validator.js';
import { expandRuntimeShots, textFocusLargerThanContext } from './shot-split.js';
import { compositionsMatch, profileFromSource } from './normalized-geometry.js';
import { buildDynamicFilterGraph, filterBlursOnlyBackground } from './filter-builder.js';
import { DYNAMIC_PREVIEW_RENDER_CONFIG } from './render-config.js';
import { isPreviewOfPreviewPath } from '../crop-approval-persistence/preview-config.js';
import type { DynamicReframePlanV1 } from './types.js';

describe('B2-15B dynamic preview runtime contracts', () => {
  const plan = loadFrozenDynamicPlan();
  const profile = profileFromSource(1920, 1040);
  const shots = expandRuntimeShots(plan, profile);

  it('keeps review 720x1280 and production target 1080x1920', () => {
    expect(DYNAMIC_PREVIEW_RENDER_CONFIG.reviewWidth).toBe(720);
    expect(DYNAMIC_PREVIEW_RENDER_CONFIG.reviewHeight).toBe(1280);
    expect(DYNAMIC_PREVIEW_RENDER_CONFIG.productionWidth).toBe(1080);
    expect(DYNAMIC_PREVIEW_RENDER_CONFIG.productionHeight).toBe(1920);
    expect(DYNAMIC_PREVIEW_RENDER_CONFIG.previewUpscaleAllowed).toBe(false);
    expect(DYNAMIC_PREVIEW_RENDER_CONFIG.productionUsable).toBe(false);
  });

  it('rejects review-preview paths as production/dynamic source', () => {
    expect(isPreviewOfPreviewPath('/x/dynamic-reframe-previews/a.mp4')).toBe(true);
    expect(isPreviewOfPreviewPath('/x/crop-review-previews/a.mp4')).toBe(true);
    expect(isPreviewOfPreviewPath('/media/v1/803fafd2.mp4')).toBe(false);
  });

  it('shares normalized composition across 720 and 1080 targets', () => {
    for (const segment of plan.segments) {
      expect(
        compositionsMatch(segment.cropRectNormalized, { width: 1920, height: 1040 }, { width: 720, height: 1280 }, { width: 1080, height: 1920 }),
      ).toBe(true);
    }
  });

  it('implements FOCUS_TEXT shot split instead of shrinking to context size', () => {
    expect(plan.segments.some((item) => item.requestShotSplit)).toBe(true);
    expect(shots.filter((item) => item.shotSplit).length).toBe(2);
    expect(textFocusLargerThanContext(plan, shots)).toBe(true);
    expect(shots.length).toBeGreaterThan(plan.segments.length);
  });

  it('rejects mechanical 0.5s plans', () => {
    const mechanical: DynamicReframePlanV1 = {
      ...plan,
      segments: plan.segments.map((item, index) => ({
        ...item,
        startMs: index * 500,
        endMs: index * 500 + 500,
        requestShotSplit: false,
      })),
      coverage: { startMs: 0, endMs: plan.segments.length * 500, fullSource: true, gaps: [] },
    };
    expect(validateDynamicPlan(mechanical).ok).toBe(false);
  });

  it('keeps blur/tint on background only', () => {
    const graph = buildDynamicFilterGraph({ shots, sourceWidth: 1920, sourceHeight: 1040 });
    expect(filterBlursOnlyBackground(graph.filter)).toBe(true);
    expect(graph.usesLanczos).toBe(true);
  });

  it('does not boost C5/C6', () => {
    expect(plan.segments.every((item) => !item.claimRefs.includes('C5') && !item.claimRefs.includes('C6'))).toBe(true);
    expect(validateDynamicPlan(plan).ok).toBe(true);
  });

  it('does not mutate frozen plan segment count', () => {
    expect(plan.segments).toHaveLength(5);
    expect(assembleContent01Clean().hybrid.assetId).toBe(plan.assetId);
  });
});
