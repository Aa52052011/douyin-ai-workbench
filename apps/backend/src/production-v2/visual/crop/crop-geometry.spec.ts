import { describe, expect, it } from 'vitest';
import { buildMediaMetadata } from '../deterministic-metadata-analyzer.js';
import { validateNormalizedRect } from '../geometry/normalized-rect.js';
import type { BorderCandidate, EmptyRegionCandidate, TopStructuredStripCandidate } from '../region/region-heuristic.types.js';
import { generateCropGeometryCandidates } from './build-crop-candidates.js';
import { CROP_GEOMETRY_CONFIG } from './crop-config.js';
import { simulateContainWindow } from './simulate-window.js';

const FORBIDDEN = /bestCrop|recommendedFinalCrop|UI_FOCUS|SUBJECT|PAN_SCAN|RECOMMENDED/;

function meta(width: number, height: number) {
  return buildMediaMetadata({ width, height, hasAudio: false, mimeType: 'video/mp4' })!;
}

function border(side: BorderCandidate['side'], size: number, extra: Partial<BorderCandidate> = {}): BorderCandidate {
  const rect =
    side === 'TOP'
      ? { x: 0, y: 0, width: 1, height: size }
      : side === 'BOTTOM'
        ? { x: 0, y: 1 - size, width: 1, height: size }
        : side === 'LEFT'
          ? { x: 0, y: 0, width: size, height: 1 }
          : { x: 1 - size, y: 0, width: size, height: 1 };
  return {
    side,
    rect,
    normalizedSize: size,
    meanLuma: 8,
    lumaVariance: 2,
    uniformityScore: 0.9,
    darknessScore: 0.95,
    persistenceRatio: 1,
    persistenceRatioAllSamples: 1,
    persistenceRatioDedupWeighted: 1,
    uniqueSampleCount: 4,
    confidence: 0.8,
    source: 'AGGREGATED_HEURISTIC',
    classification: 'DARK_UNIFORM',
    ...extra,
  };
}

function emptyRight(width: number): EmptyRegionCandidate {
  return {
    rect: { x: 1 - width, y: 0, width, height: 1 },
    textureProxy: 0.01,
    lumaVariance: 4,
    occupancyRatio: width,
    edgeBiased: true,
    persistenceRatio: 1,
    persistenceRatioAllSamples: 1,
    persistenceRatioDedupWeighted: 1,
    uniqueSampleCount: 4,
    confidence: 0.7,
    source: 'AGGREGATED_HEURISTIC',
  };
}

function topStrip(heightRatio: number, extra: Partial<TopStructuredStripCandidate> = {}): TopStructuredStripCandidate {
  return {
    rect: { x: 0, y: 0, width: 1, height: heightRatio },
    heightRatio,
    horizontalBoundaryStrength: 20,
    internalContrastProxy: 16,
    persistenceRatio: 1,
    persistenceRatioAllSamples: 1,
    persistenceRatioDedupWeighted: 1,
    uniqueSampleCount: 4,
    stabilityScore: 0.9,
    confidence: 0.7,
    source: 'AGGREGATED_HEURISTIC',
    ...extra,
  };
}

describe('CENTER vs CONTAIN scoring', () => {
  it('does not let occupancy crown CENTER for 16:9 into 9:16', () => {
    const result = generateCropGeometryCandidates({ metadata: meta(1920, 1080) });
    const center = result.candidates.find((c) => c.type === 'CENTER')!;
    const contain = result.candidates.find((c) => c.type === 'CONTAIN')!;
    expect(center.retainedAreaRatio).toBeCloseTo(607.5 / 1920, 4);
    expect(center.cropRisk.level).toBe('HIGH');
    expect(center.scores.outputOccupancyScore).toBeGreaterThan(contain.scores.outputOccupancyScore);
    expect(contain.scores.retainedAreaScore).toBeGreaterThan(center.scores.retainedAreaScore);
    expect(contain.readabilityGeometryRisk).toBe('HIGH');
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN);
  });

  it('records 1920x1040 CENTER retained ~0.3047 with HIGH risk', () => {
    const result = generateCropGeometryCandidates({ metadata: meta(1920, 1040) });
    const center = result.candidates.find((c) => c.type === 'CENTER')!;
    expect(center.retainedAreaRatio).toBeCloseTo(585 / 1920, 4);
    expect(center.cropRisk.level).toBe('HIGH');
    expect(center.cropRisk.semanticUnknownRisk).toBe(true);
  });

  it('keeps 9:16 → 9:16 CENTER and CONTAIN close', () => {
    const result = generateCropGeometryCandidates({ metadata: meta(1080, 1920) });
    const center = result.candidates.find((c) => c.type === 'CENTER')!;
    const contain = result.candidates.find((c) => c.type === 'CONTAIN')!;
    expect(center.retainedAreaRatio).toBeCloseTo(1);
    expect(contain.outputOccupancy).toBeCloseTo(1);
    expect(Math.abs(center.scores.overallScore - contain.scores.overallScore)).toBeLessThan(CROP_GEOMETRY_CONFIG.closeScoreThreshold);
    expect(result.ranking.closePairIds.length).toBeGreaterThan(0);
    expect(result.ranking.kind).toBe('DETERMINISTIC_GEOMETRY_RANK');
    expect(result.ranking.note).toBe('NOT_FINAL_DIRECTOR_SELECTION');
  });

  it('scores square and ultrawide without occupancy auto-win', () => {
    const square = generateCropGeometryCandidates({ metadata: meta(1080, 1080) });
    const ultra = generateCropGeometryCandidates({ metadata: meta(2560, 1080) });
    expect(square.candidates.find((c) => c.type === 'CENTER')!.cropRisk.level).not.toBe('LOW');
    expect(ultra.candidates.find((c) => c.type === 'CENTER')!.retainedAreaRatio).toBeLessThan(0.3);
    expect(ultra.candidates.find((c) => c.type === 'CONTAIN')!.scores.retainedAreaScore).toBeGreaterThan(
      ultra.candidates.find((c) => c.type === 'CENTER')!.scores.retainedAreaScore,
    );
  });
});

describe('SAFE_GEOMETRY', () => {
  it('emits trim only when border/empty evidence exists', () => {
    const none = generateCropGeometryCandidates({ metadata: meta(1920, 1080) });
    expect(none.candidates.some((c) => c.type === 'SAFE_GEOMETRY')).toBe(false);
    const bars = generateCropGeometryCandidates({
      metadata: meta(1920, 1080),
      borderCandidates: [border('LEFT', 0.1), border('RIGHT', 0.1)],
    });
    const safe = bars.candidates.find((c) => c.type === 'SAFE_GEOMETRY');
    expect(safe).toBeTruthy();
    expect(safe!.signals).toEqual(expect.arrayContaining(['PERSISTENT_LEFT_BORDER', 'PERSISTENT_RIGHT_BORDER']));
    expect(safe!.cropRisk.semanticUnknownRisk).toBe(true);
  });

  it('uses empty right edge as a trim signal', () => {
    const result = generateCropGeometryCandidates({
      metadata: meta(1920, 1080),
      emptyRegionCandidates: [emptyRight(0.12)],
    });
    expect(result.candidates.some((c) => c.type === 'SAFE_GEOMETRY' && c.signals.includes('EMPTY_EDGE_REGION'))).toBe(true);
  });

  it('caps extreme per-side trim instead of accepting it', () => {
    const result = generateCropGeometryCandidates({
      metadata: meta(1920, 1080),
      borderCandidates: [border('LEFT', 0.4), border('RIGHT', 0.4)],
    });
    const safe = result.candidates.find((c) => c.type === 'SAFE_GEOMETRY');
    if (safe) {
      expect(safe.sourceRect.x).toBeLessThanOrEqual(CROP_GEOMETRY_CONFIG.maxTrimRatioPerSide + 1e-9);
      expect(safe.warnings).toContain('TRIM_CAPPED_MAX_PER_SIDE');
    } else {
      expect(result.warnings).toContain('SAFE_GEOMETRY_BELOW_MIN_RETAINED_AREA');
    }
  });

  it('refuses SAFE_GEOMETRY when retained area would fall below min after max trims', () => {
    const result = generateCropGeometryCandidates({
      metadata: meta(1920, 1080),
      borderCandidates: [border('LEFT', 0.18), border('RIGHT', 0.18), border('TOP', 0.18), border('BOTTOM', 0.18)],
    });
    expect(result.candidates.some((c) => c.type === 'SAFE_GEOMETRY')).toBe(false);
    expect(result.warnings).toContain('SAFE_GEOMETRY_BELOW_MIN_RETAINED_AREA');
    expect(result.candidates.some((c) => c.type === 'CENTER')).toBe(true);
  });
});

describe('TOP_TRIM', () => {
  it('creates TOP_TRIM_CANDIDATE with semanticUnconfirmed and cap <= 0.7', () => {
    const result = generateCropGeometryCandidates({
      metadata: meta(1920, 1040),
      topStructuredStripCandidates: [topStrip(0.08)],
    });
    const top = result.candidates.find((c) => c.type === 'TOP_TRIM_CANDIDATE')!;
    expect(top.semanticUnconfirmed).toBe(true);
    expect(top.confidence).toBeLessThanOrEqual(0.7);
    expect(top.signals).toContain('TOP_STRUCTURED_STRIP_HEURISTIC');
  });

  it('treats product-like header trim as unknown risk, not a safe final crop', () => {
    const result = generateCropGeometryCandidates({
      metadata: meta(1920, 1040),
      topStructuredStripCandidates: [topStrip(0.12, { confidence: 0.7 })],
    });
    const top = result.candidates.find((c) => c.type === 'TOP_TRIM_CANDIDATE')!;
    expect(top.cropRisk.semanticUnknownRisk).toBe(true);
    expect(top.cropRisk.level).not.toBe('LOW');
    expect(result.ranking.note).toBe('NOT_FINAL_DIRECTOR_SELECTION');
    expect(JSON.stringify(top)).not.toMatch(/recommendedFinalCrop|bestCrop|UI_FOCUS/);
  });
});

describe('validation and ranking', () => {
  it('discards invalid geometry without silent clamp', () => {
    expect(validateNormalizedRect({ x: 0.9, y: 0, width: 0.2, height: 1 }).ok).toBe(false);
    expect(() =>
      simulateContainWindow(1920, 1080, 1080, 1920, { x: 0.9, y: 0, width: 0.2, height: 1 }),
    ).toThrow(/INVALID_CROP_RECT/);
  });
});
