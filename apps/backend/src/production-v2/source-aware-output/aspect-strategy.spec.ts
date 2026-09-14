import { describe, expect, it } from 'vitest';
import { auditCropIntegrity } from '../source-aware-editorial/integrity.js';
import { smartUiFit } from '../source-aware-editorial/smart-ui-fit.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG } from '../source-aware-preview/render-config.js';
import {
  LANDSCAPE_UI_DEMO_PROFILE,
  SOURCE_AWARE_OUTPUT_PROFILES,
  VERTICAL_DOUYIN_PROFILE,
  buildLandscapeCalibrationFilter,
  landscapeFillStrategy,
  recommendOutputForSourceType,
} from './profiles.js';

describe('B2-15H source-aware output aspect', () => {
  it('removes universal 1080x1920 hard rule and defines vertical + landscape profiles', () => {
    expect(SOURCE_AWARE_OUTPUT_PROFILES.universalHardResolution).toBe(false);
    expect(VERTICAL_DOUYIN_PROFILE.width).toBe(1080);
    expect(VERTICAL_DOUYIN_PROFILE.height).toBe(1920);
    expect(LANDSCAPE_UI_DEMO_PROFILE.width).toBe(1920);
    expect(LANDSCAPE_UI_DEMO_PROFILE.height).toBe(1080);
    expect(VERTICAL_DOUYIN_PROFILE.productionUsable).toBe(false);
    expect(LANDSCAPE_UI_DEMO_PROFILE.productionUsable).toBe(false);
  });

  it('does not stretch 1920x1040 into 1920x1080', () => {
    const fill = landscapeFillStrategy(1920, 1040);
    expect(fill.stretch).toBe(false);
    expect(fill.scale).toBe(1);
    expect(fill.fgWidth).toBe(1920);
    expect(fill.fgHeight).toBe(1040);
    expect(fill.padY).toBeGreaterThan(0);
    const graph = buildLandscapeCalibrationFilter(35.107);
    expect(graph.stretch).toBe(false);
    expect(graph.filter).toContain('force_original_aspect_ratio=decrease');
    expect(graph.filter).toContain('pad=1920:1080');
    expect(graph.filter).not.toMatch(/scale=1920:1080(?!:flags)/);
  });

  it('keeps semantic integrity for full-frame landscape and SMART_UI_FIT vertical', () => {
    expect(auditCropIntegrity({ x: 0, y: 0, width: 1, height: 1 }).ok).toBe(true);
    expect(auditCropIntegrity(smartUiFit().crop).ok).toBe(true);
  });

  it('implements dual-output contract without auto-locking', () => {
    const rec = recommendOutputForSourceType({
      sourceVisualType: 'SCREEN_RECORDING_UI_DEMO',
      sourceWidth: 1920,
      sourceHeight: 1040,
    });
    expect(rec.preferredEvaluation).toBe('DUAL_VERTICAL_AND_LANDSCAPE');
    expect(rec.autoRecommendation).toBe('DUAL_RECOMMENDED');
    expect(rec.locked).toBe(false);
  });

  it('keeps production boundary: no upscale, not production usable', () => {
    expect(SOURCE_AWARE_PREVIEW_RENDER_CONFIG.previewUpscaleAllowed).toBe(false);
    expect(SOURCE_AWARE_PREVIEW_RENDER_CONFIG.productionUsable).toBe(false);
    expect(SOURCE_AWARE_PREVIEW_RENDER_CONFIG.universalHardResolution).toBe(false);
  });
});
