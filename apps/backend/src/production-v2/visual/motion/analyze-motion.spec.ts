import { describe, expect, it } from 'vitest';
import type { FrameDifference, FrameSample } from '../frame/frame-sample.types.js';
import { analyzeMotionHeuristics, histogramL1Normalized } from './analyze-motion.js';
import { MOTION_HEURISTIC_CONFIG } from './motion-config.js';

function hist(bin: number, count = 1000): number[] {
  const bins = Array.from({ length: 16 }, () => 0);
  bins[bin] = count;
  return bins;
}

function sample(index: number, input: { dup?: boolean; bin?: number; luma?: number } = {}): FrameSample {
  return {
    sampleId: `s${index}`,
    timestampMs: index * 1000,
    width: 8,
    height: 8,
    source: index === 0 ? 'START' : 'UNIFORM',
    extractionOk: true,
    isNearDuplicate: Boolean(input.dup),
    statistics: {
      averageLuma: input.luma ?? 128,
      lumaStdDev: 2,
      minLuma: 0,
      maxLuma: 255,
      darkPixelRatio: 0,
      brightPixelRatio: 0,
      contrastProxy: 0.1,
      lumaHistogram16: hist(input.bin ?? 4),
      sharpnessProxy: 1,
      analysisWidth: 8,
      analysisHeight: 8,
    },
  };
}

function diffsFrom(samples: FrameSample[], normalized: number[]): FrameDifference[] {
  return samples.slice(1).map((to, i) => ({
    fromSampleId: samples[i]!.sampleId,
    toSampleId: to.sampleId,
    delta: (normalized[i] ?? 0) * 255,
    normalizedDelta: normalized[i] ?? 0,
  }));
}

const FORBIDDEN = /无聊|该剪|滚动|脚本页|USER_CLICKED|SCROLLED_PAGE|NAVIGATED|OPENED_DIALOG|PRODUCT_ACTION|BAD_EDITING|BORING_VIDEO|IDLE|SCROLL|NAVIGATION|browser/i;

describe('histogramL1Normalized', () => {
  it('is 0 for identical histograms and high for disjoint bins', () => {
    expect(histogramL1Normalized(hist(1), hist(1))).toBe(0);
    expect(histogramL1Normalized(hist(0), hist(15))).toBe(1);
  });
});

describe('analyzeMotionHeuristics', () => {
  it('omits motion for images', () => {
    const result = analyzeMotionHeuristics({
      samples: [sample(0)],
      diffs: [],
      isImage: true,
      requestedSampleCount: 1,
    });
    expect(result.skipped).toBe('IMAGE');
    expect(result.motionSummary).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN);
  });

  it('flags 1 sample as insufficient', () => {
    const result = analyzeMotionHeuristics({
      samples: [sample(0)],
      diffs: [],
      isImage: false,
      requestedSampleCount: 1,
    });
    expect(result.skipped).toBe('INSUFFICIENT_SAMPLES');
    expect(result.warnings).toContain('MOTION_ANALYSIS_INSUFFICIENT_SAMPLES');
    expect(result.motionSummary).toBeUndefined();
  });

  it('classifies 8 near-identical samples as STATIC with capped confidence', () => {
    const samples = Array.from({ length: 8 }, (_, i) => sample(i));
    const result = analyzeMotionHeuristics({
      samples,
      diffs: diffsFrom(samples, Array(7).fill(0.005)),
      isImage: false,
      requestedSampleCount: 8,
    });
    expect(result.motionSummary?.activityLevel).toBe('STATIC');
    expect(result.motionSummary!.nearStaticPairRatio).toBeGreaterThan(0.9);
    expect(result.motionSummary!.confidence).toBeLessThan(0.95);
    expect(result.warnings).toContain('STATIC_CANDIDATE');
    expect(result.longStaticCandidates.length).toBeGreaterThan(0);
    expect(result.sceneChangeCandidates).toHaveLength(0);
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN);
  });

  it('treats gradual change as LOW/ACTIVE without scene change', () => {
    const samples = Array.from({ length: 8 }, (_, i) => sample(i, { luma: 100 + i * 2, bin: 4 }));
    const result = analyzeMotionHeuristics({
      samples,
      diffs: diffsFrom(samples, [0.05, 0.055, 0.06, 0.05, 0.058, 0.062, 0.057]),
      isImage: false,
      requestedSampleCount: 8,
    });
    expect(['LOW_MOTION', 'ACTIVE']).toContain(result.motionSummary?.activityLevel);
    expect(result.sceneChangeCandidates).toHaveLength(0);
    expect(result.warnings).not.toContain('SCENE_CHANGE_CANDIDATE');
  });

  it('emits SCENE_CHANGE_CANDIDATE on a hard cut pair', () => {
    const samples = [
      ...Array.from({ length: 4 }, (_, i) => sample(i, { bin: 0 })),
      ...Array.from({ length: 4 }, (_, i) => sample(i + 4, { bin: 15 })),
    ];
    const deltas = [0.01, 0.01, 0.01, 0.45, 0.01, 0.01, 0.01];
    const result = analyzeMotionHeuristics({
      samples,
      diffs: diffsFrom(samples, deltas),
      isImage: false,
      requestedSampleCount: 8,
    });
    expect(result.sceneChangeCandidates.length).toBeGreaterThan(0);
    expect(result.warnings).toContain('SCENE_CHANGE_CANDIDATE');
    expect(result.sceneChangeCandidates[0]!.source).toMatch(/SAMPLED_|AGGREGATED_/);
    expect(result.sceneChangeCandidates[0]!.confidence).toBeLessThanOrEqual(MOTION_HEURISTIC_CONFIG.sceneConfidenceCap);
  });

  it('aggregates consecutive high-change pairs as RAPID_CHANGE_CANDIDATE', () => {
    const samples = Array.from({ length: 5 }, (_, i) => sample(i, { bin: i }));
    const result = analyzeMotionHeuristics({
      samples,
      diffs: diffsFrom(samples, [0.4, 0.42, 0.38, 0.41]),
      isImage: false,
      requestedSampleCount: 5,
    });
    expect(result.motionSummary?.activityLevel).toBe('HIGH_MOTION');
    expect(result.rapidChangeCandidates.length).toBeGreaterThan(0);
    expect(result.warnings).toContain('RAPID_CHANGE_CANDIDATE');
    expect(result.warnings).toContain('HIGH_ACTIVITY_CANDIDATE');
  });

  it('keeps static ratio under duplicate trap but does not inflate confidence', () => {
    const unique = [sample(0), sample(6, { bin: 5 })];
    const samples = [
      unique[0]!,
      sample(1, { dup: true }),
      sample(2, { dup: true }),
      sample(3, { dup: true }),
      sample(4, { dup: true }),
      sample(5, { dup: true }),
      unique[1]!,
      sample(7, { dup: true, bin: 5 }),
    ];
    const trap = analyzeMotionHeuristics({
      samples,
      diffs: diffsFrom(samples, Array(7).fill(0.004)),
      isImage: false,
      requestedSampleCount: 8,
    });
    const diverse = analyzeMotionHeuristics({
      samples: Array.from({ length: 8 }, (_, i) => sample(i)),
      diffs: diffsFrom(
        Array.from({ length: 8 }, (_, i) => sample(i)),
        Array(7).fill(0.004),
      ),
      isImage: false,
      requestedSampleCount: 8,
    });
    expect(trap.motionSummary?.nearStaticPairRatio).toBeGreaterThan(0.9);
    expect(trap.motionSummary?.activityLevel).toBe('STATIC');
    expect(trap.motionSummary!.uniqueSampleCount).toBe(2);
    expect(trap.motionSummary!.confidence).toBeLessThan(diverse.motionSummary!.confidence);
    expect(trap.motionSummary!.confidence).toBeLessThan(0.8);
    expect(trap.warnings).toContain('MOTION_ANALYSIS_LOW_CONFIDENCE');
  });

  it('keeps 2-sample classify but with low confidence', () => {
    const samples = [sample(0), sample(1)];
    const result = analyzeMotionHeuristics({
      samples,
      diffs: diffsFrom(samples, [0.02]),
      isImage: false,
      requestedSampleCount: 2,
    });
    expect(result.motionSummary).toBeTruthy();
    expect(result.motionSummary!.confidence).toBeLessThan(0.6);
    expect(result.warnings).toContain('MOTION_ANALYSIS_LOW_CONFIDENCE');
  });

  it('classifies 3 samples without claiming frame-accurate duration', () => {
    const samples = [sample(0), sample(1), sample(2)];
    const result = analyzeMotionHeuristics({
      samples,
      diffs: diffsFrom(samples, [0.01, 0.02]),
      isImage: false,
      requestedSampleCount: 8,
    });
    expect(result.motionSummary?.samplePairCount).toBe(2);
    expect(result.warnings).toContain('MOTION_ANALYSIS_LOW_CONFIDENCE');
    expect(result.nearStaticRanges[0]?.durationMs).toBe(2000);
  });
});
