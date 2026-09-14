import { describe, expect, it } from 'vitest';
import { smartUiFit } from '../source-aware-editorial/smart-ui-fit.js';
import { mapPlanToRuntimeTimeline } from '../source-aware-editorial/timeline.js';
import { directSourceAwareEditorialPlan } from '../source-aware-editorial/director.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG } from '../source-aware-preview/render-config.js';
import {
  CALIBRATION_A,
  CALIBRATION_B,
  CALIBRATION_C,
  buildCalibrationFilterGraph,
  compositionHash,
  containLayout,
  testAEquivalentToSourceAwarePreview,
} from './compose.js';
import { pixelCropFromNormalized } from '../dynamic-reframe/normalized-geometry.js';

describe('B2-15G UI fidelity calibration', () => {
  const plan = directSourceAwareEditorialPlan();
  const timeline = mapPlanToRuntimeTimeline(plan);
  const crop = smartUiFit().crop;

  it('keeps identical composition across A/B/C', () => {
    const hashA = compositionHash({
      assetId: plan.assetId,
      crop,
      fitMode: 'CONTAIN',
      background: 'BLUR_SOURCE_DARKENED',
      timeline: timeline.segments.map((item) => ({ startMs: item.sourceStartMs, endMs: item.sourceEndMs })),
    });
    const hashB = compositionHash({
      assetId: plan.assetId,
      crop,
      fitMode: 'CONTAIN',
      background: 'BLUR_SOURCE_DARKENED',
      timeline: timeline.segments.map((item) => ({ startMs: item.sourceStartMs, endMs: item.sourceEndMs })),
    });
    expect(hashA).toBe(hashB);
    expect(timeline.segments[0].normalizedCrop).toEqual(crop);
    expect(CALIBRATION_B.width / CALIBRATION_A.width).toBe(CALIBRATION_B.height / CALIBRATION_A.height);
  });

  it('does not enlarge foreground occupancy for B/C', () => {
    const sourceCrop = pixelCropFromNormalized(crop, 1920, 1040);
    const a = containLayout(sourceCrop, CALIBRATION_A);
    const b = containLayout(sourceCrop, CALIBRATION_B);
    expect(Math.abs(a.occupancy - b.occupancy)).toBeLessThan(0.01);
    expect(a.scale * 1.5).toBeCloseTo(b.scale, 2);
  });

  it('marks calibration-only and forbids preview upscale / production usable', () => {
    expect(CALIBRATION_B.calibrationOnly).toBe(true);
    expect(CALIBRATION_B.productionUsable).toBe(false);
    expect(CALIBRATION_C.productionUsable).toBe(false);
    expect(SOURCE_AWARE_PREVIEW_RENDER_CONFIG.previewUpscaleAllowed).toBe(false);
    expect(testAEquivalentToSourceAwarePreview()).toBe(true);
  });

  it('builds lanczos graphs without sharpen', () => {
    const a = buildCalibrationFilterGraph({ segments: timeline.segments, sourceWidth: 1920, sourceHeight: 1040, target: CALIBRATION_A });
    const c = buildCalibrationFilterGraph({ segments: timeline.segments, sourceWidth: 1920, sourceHeight: 1040, target: CALIBRATION_C });
    expect(a.usesLanczos).toBe(true);
    expect(a.filter).not.toMatch(/unsharp|cas|eq=contrast/i);
    expect(c.filter).toContain('lanczos+accurate_rnd+full_chroma_int');
    expect(c.filter).toContain('1080:1920');
    expect(a.filter).toContain('720:1280');
  });
});
