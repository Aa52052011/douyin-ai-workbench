import { describe, expect, it } from 'vitest';
import {
  calculateCenteredCoverRect,
  calculateContainScale,
  calculateCoverScale,
  classifyOrientation,
  clampNormalizedRect,
  getAspectRatio,
  simulateFit,
  validateNormalizedRect,
} from './index.js';

describe('aspect and orientation', () => {
  it('classifies orientations', () => {
    expect(classifyOrientation(1920, 1040)).toBe('LANDSCAPE');
    expect(classifyOrientation(1080, 1920)).toBe('PORTRAIT');
    expect(classifyOrientation(1080, 1080)).toBe('SQUARE');
    expect(classifyOrientation(0, 10)).toBe('OTHER');
  });

  it('simplifies aspect ratio', () => {
    expect(getAspectRatio(1920, 1080)?.simplified).toBe('16:9');
    expect(getAspectRatio(1920, 1040)?.simplified).toBe('24:13');
  });
});

describe('NormalizedRect', () => {
  it('validates bounds without clamping', () => {
    expect(validateNormalizedRect({ x: 0, y: 0, width: 1, height: 1 }).ok).toBe(true);
    expect(validateNormalizedRect({ x: 0.9, y: 0, width: 0.2, height: 1 }).ok).toBe(false);
  });

  it('clamps only when asked', () => {
    const clamped = clampNormalizedRect({ x: -0.1, y: 0.9, width: 2, height: 0.2 });
    expect(clamped.x).toBe(0);
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('simulateFit', () => {
  const target = { targetWidth: 1080, targetHeight: 1920 };

  it('CONTAIN keeps all pixels for 16:9 into 9:16', () => {
    const result = simulateFit({ sourceWidth: 1920, sourceHeight: 1080, ...target, fitMode: 'CONTAIN' });
    expect(result.retainedAreaRatio).toBe(1);
    expect(result.letterbox).toBe(true);
    expect(result.pillarbox).toBe(false);
    expect(result.visibleSourceRect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(result.outputOccupancy).toBeCloseTo((1080 * 607.5) / (1080 * 1920), 5);
  });

  it('COVER fills 16:9 into 9:16 and reports visible source', () => {
    const result = simulateFit({ sourceWidth: 1920, sourceHeight: 1080, ...target, fitMode: 'COVER' });
    expect(result.outputOccupancy).toBe(1);
    expect(result.letterbox).toBe(false);
    expect(result.retainedAreaRatio).toBeCloseTo(607.5 / 1920, 5);
    expect(result.visibleSourceRect.width).toBeCloseTo(607.5, 5);
    expect(result.visibleSourceRect.height).toBeCloseTo(1080, 5);
  });

  it('portrait to portrait CONTAIN and COVER occupy full canvas', () => {
    const contain = simulateFit({ sourceWidth: 1080, sourceHeight: 1920, ...target, fitMode: 'CONTAIN' });
    const cover = simulateFit({ sourceWidth: 1080, sourceHeight: 1920, ...target, fitMode: 'COVER' });
    expect(contain.outputOccupancy).toBeCloseTo(1);
    expect(cover.retainedAreaRatio).toBeCloseTo(1);
  });

  it('square CONTAIN letterboxes into 9:16', () => {
    const result = simulateFit({ sourceWidth: 1080, sourceHeight: 1080, ...target, fitMode: 'CONTAIN' });
    expect(result.retainedAreaRatio).toBe(1);
    expect(result.letterbox).toBe(true);
    expect(result.renderedWidth).toBe(1080);
    expect(result.renderedHeight).toBe(1080);
  });

  it('ultrawide COVER discards more horizontal source', () => {
    const result = simulateFit({ sourceWidth: 2560, sourceHeight: 1080, ...target, fitMode: 'COVER' });
    expect(result.outputOccupancy).toBe(1);
    expect(result.retainedAreaRatio).toBeCloseTo(607.5 / 2560, 5);
  });

  it('CUSTOM uses normalized source-space crop then COVER math', () => {
    const cropRect = { x: 0.1, y: 0.1, width: 0.5, height: 0.8 };
    const result = simulateFit({
      sourceWidth: 1920,
      sourceHeight: 1080,
      ...target,
      fitMode: 'CUSTOM',
      cropRect,
    });
    expect(result.visibleSourceNormalized).toEqual(cropRect);
    expect(result.retainedAreaRatio).toBeCloseTo(0.4);
    expect(() =>
      simulateFit({ sourceWidth: 100, sourceHeight: 100, ...target, fitMode: 'CUSTOM', cropRect: { x: 0.9, y: 0, width: 0.2, height: 1 } }),
    ).toThrow(/INVALID_ASPECT_RATIO/);
  });

  it('centered cover helper is geometry only', () => {
    const rect = calculateCenteredCoverRect(1920, 1080, 1080, 1920);
    expect(rect.x).toBeCloseTo(656.25, 5);
    expect(rect.width).toBeCloseTo(607.5, 5);
    expect(calculateContainScale(1920, 1080, 1080, 1920)).toBeCloseTo(1080 / 1920);
    expect(calculateCoverScale(1920, 1080, 1080, 1920)).toBeCloseTo(1920 / 1080);
  });
});

describe('Content #1 1920×1040 geometry', () => {
  const source = { sourceWidth: 1920, sourceHeight: 1040, targetWidth: 1080, targetHeight: 1920 };

  it('records CONTAIN vs COVER math without ranking', () => {
    const contain = simulateFit({ ...source, fitMode: 'CONTAIN' });
    const cover = simulateFit({ ...source, fitMode: 'COVER' });
    expect(contain.retainedAreaRatio).toBe(1);
    expect(contain.outputOccupancy).toBeCloseTo(585 / 1920, 5);
    expect(contain.letterbox).toBe(true);
    expect(contain.renderedWidth).toBeCloseTo(1080);
    expect(contain.renderedHeight).toBeCloseTo(585);
    expect(cover.outputOccupancy).toBe(1);
    expect(cover.retainedAreaRatio).toBeCloseTo(585 / 1920, 5);
    expect(cover.visibleSourceRect.width).toBeCloseTo(585, 5);
    expect(cover.visibleSourceRect.height).toBeCloseTo(1040, 5);
    expect(cover.visibleSourceRect.x).toBeCloseTo((1920 - 585) / 2, 5);
  });
});
