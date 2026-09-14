import { describe, expect, it } from 'vitest';
import { FRAME_ANALYSIS_CONFIG } from './frame-analysis-config.js';
import { computeLumaStatistics, computeSharpnessProxy, lumaSimilarity } from './luma-stats.js';

function fill(width: number, height: number, value: number) {
  return { width, height, pixels: Buffer.alloc(width * height, value) };
}

describe('luma statistics', () => {
  it('measures black white gray', () => {
    const dark = FRAME_ANALYSIS_CONFIG.darkLumaMax;
    const bright = FRAME_ANALYSIS_CONFIG.brightLumaMin;
    const black = computeLumaStatistics(fill(8, 8, 0), dark, bright);
    const white = computeLumaStatistics(fill(8, 8, 255), dark, bright);
    const gray = computeLumaStatistics(fill(8, 8, 128), dark, bright);
    expect(black.averageLuma).toBe(0);
    expect(black.darkPixelRatio).toBe(1);
    expect(white.averageLuma).toBe(255);
    expect(white.brightPixelRatio).toBe(1);
    expect(gray.averageLuma).toBe(128);
    expect(gray.lumaStdDev).toBe(0);
  });

  it('measures gradient stddev > 0', () => {
    const pixels = Buffer.alloc(16);
    for (let i = 0; i < 16; i += 1) {
      pixels[i] = i * 16;
    }
    const stats = computeLumaStatistics({ width: 4, height: 4, pixels }, 16, 239);
    expect(stats.lumaStdDev).toBeGreaterThan(20);
    expect(stats.minLuma).toBe(0);
    expect(stats.maxLuma).toBe(240);
  });
});

describe('sharpness and similarity', () => {
  it('ranks checkerboard sharper than blur-like uniform', () => {
    const sharp = Buffer.alloc(64);
    for (let i = 0; i < 64; i += 1) {
      sharp[i] = i % 2 === 0 ? 0 : 255;
    }
    const blur = fill(8, 8, 128);
    expect(computeSharpnessProxy({ width: 8, height: 8, pixels: sharp })).toBeGreaterThan(
      computeSharpnessProxy(blur),
    );
  });

  it('orders identical > minor > major', () => {
    const a = fill(4, 4, 100);
    const minor = fill(4, 4, 102);
    const major = fill(4, 4, 200);
    const ident = lumaSimilarity(a, fill(4, 4, 100));
    const slight = lumaSimilarity(a, minor);
    const big = lumaSimilarity(a, major);
    expect(ident).toBe(1);
    expect(ident).toBeGreaterThan(slight);
    expect(slight).toBeGreaterThan(big);
  });
});
