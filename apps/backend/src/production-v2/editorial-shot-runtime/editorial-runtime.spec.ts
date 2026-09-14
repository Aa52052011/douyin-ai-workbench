import { describe, expect, it } from 'vitest';
import { loadFrozenEditorialPlan } from './plan-io.js';
import { occupancyHierarchy } from './occupancy.js';
import { buildEditorialFilterGraph, editorialFilterBlursOnlyBackground, mechanicalEasedMotion } from './filter-builder.js';
import { EDITORIAL_PREVIEW_RENDER_CONFIG } from './render-config.js';
import { isPreviewOfPreviewPath } from '../crop-approval-persistence/preview-config.js';
import { compositionsMatch } from '../dynamic-reframe/normalized-geometry.js';
import { validateEditorialPlan } from '../editorial-shot-director/validator.js';

describe('B2-15D editorial shot runtime contracts', () => {
  const plan = loadFrozenEditorialPlan();

  it('keeps review 720x1280 and production 1080x1920 without upscale', () => {
    expect(EDITORIAL_PREVIEW_RENDER_CONFIG.reviewWidth).toBe(720);
    expect(EDITORIAL_PREVIEW_RENDER_CONFIG.reviewHeight).toBe(1280);
    expect(EDITORIAL_PREVIEW_RENDER_CONFIG.productionWidth).toBe(1080);
    expect(EDITORIAL_PREVIEW_RENDER_CONFIG.productionHeight).toBe(1920);
    expect(EDITORIAL_PREVIEW_RENDER_CONFIG.previewUpscaleAllowed).toBe(false);
    expect(EDITORIAL_PREVIEW_RENDER_CONFIG.productionUsable).toBe(false);
  });

  it('rejects preview-of-preview including editorial and dynamic dirs', () => {
    expect(isPreviewOfPreviewPath('/x/editorial-shot-previews/a.mp4')).toBe(true);
    expect(isPreviewOfPreviewPath('/x/dynamic-reframe-previews/a.mp4')).toBe(true);
    expect(isPreviewOfPreviewPath('/media/v1/803fafd2.mp4')).toBe(false);
  });

  it('enforces WIDE < MEDIUM < DETAIL occupancy', () => {
    const audit = occupancyHierarchy(plan.shots);
    expect(audit.ok).toBe(true);
    expect(audit.wide).toBeLessThan(audit.medium);
    expect(audit.medium).toBeLessThan(audit.detail);
  });

  it('keeps medium as the body and a single detail punch-in', () => {
    expect(plan.shots.filter((item) => item.shotScale === 'MEDIUM_FOCUS')).toHaveLength(6);
    expect(plan.shots.filter((item) => item.shotScale === 'DETAIL_READABLE')).toHaveLength(1);
    expect(plan.shots.filter((item) => item.shotScale === 'WIDE_CONTEXT')).toHaveLength(3);
    expect(validateEditorialPlan(plan).ok).toBe(true);
  });

  it('preserves context recovery shots from the frozen plan', () => {
    expect(plan.shots.filter((item) => item.contextRecoveryReason).length).toBe(3);
  });

  it('binds every shot to narration and claims', () => {
    expect(plan.shots).toHaveLength(10);
    expect(plan.shots.every((item) => item.narrationUnitRefs.length > 0 && item.claimRefs.length > 0 && item.shotPurpose)).toBe(true);
    expect(plan.shots.every((item) => !item.claimRefs.includes('C5') && !item.claimRefs.includes('C6'))).toBe(true);
  });

  it('implements limited short eased zoom and rejects mechanical motion', () => {
    expect(plan.shots.filter((item) => item.transitionIn === 'SHORT_EASED_ZOOM')).toHaveLength(1);
    expect(mechanicalEasedMotion(plan.shots)).toBe(false);
    const graph = buildEditorialFilterGraph({ shots: plan.shots, sourceWidth: 1920, sourceHeight: 1040 });
    expect(graph.easedShots).toBe(1);
    expect(graph.filter).not.toContain('zoompan');
    expect(graph.usesLanczos).toBe(true);
  });

  it('keeps blur on background only and allows DETAIL without background', () => {
    const graph = buildEditorialFilterGraph({ shots: plan.shots, sourceWidth: 1920, sourceHeight: 1040 });
    expect(editorialFilterBlursOnlyBackground(graph.filter)).toBe(true);
    expect(plan.shots.filter((item) => item.shotScale === 'WIDE_CONTEXT').every((item) => item.backgroundTreatment === 'BLUR_SOURCE_DARKENED')).toBe(true);
    expect(plan.shots.filter((item) => item.shotScale === 'DETAIL_READABLE').every((item) => item.backgroundTreatment === 'OPTIONAL_NONE')).toBe(true);
  });

  it('concatenates all planned shots including context recovery', () => {
    const graph = buildEditorialFilterGraph({ shots: plan.shots, sourceWidth: 1920, sourceHeight: 1040 });
    expect(graph.filter).toContain(`concat=n=${plan.shots.length}:v=1:a=0`);
    expect(graph.filter).toContain('eof_action=repeat');
  });

  it('rejects preview-of-preview as runtime source and keeps production boundary', () => {
    expect(isPreviewOfPreviewPath('C:/x/dynamic-reframe-previews/dynamic-preview_runtime-1.mp4')).toBe(true);
    expect(EDITORIAL_PREVIEW_RENDER_CONFIG.previewUpscaleAllowed).toBe(false);
    expect(EDITORIAL_PREVIEW_RENDER_CONFIG.productionUsable).toBe(false);
  });

  it('does not auto-approve humans', () => {
    expect(EDITORIAL_PREVIEW_RENDER_CONFIG.productionUsable).toBe(false);
  });

  it('shares normalized composition across 720 and 1080', () => {
    for (const shot of plan.shots) {
      expect(compositionsMatch(shot.normalizedCrop, { width: 1920, height: 1040 }, { width: 720, height: 1280 }, { width: 1080, height: 1920 })).toBe(true);
    }
  });
});
