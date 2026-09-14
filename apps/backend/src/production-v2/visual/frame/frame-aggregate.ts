import type { LumaFrame } from './luma-stats.js';
import type { FrameDifference, FrameSample, FrameStatsAggregate, MinMedianMax } from './frame-sample.types.js';

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

function minMedianMax(values: number[]): MinMedianMax {
  if (values.length === 0) {
    return { min: 0, median: 0, max: 0 };
  }
  return { min: Math.min(...values), median: median(values), max: Math.max(...values) };
}

export function markNearDuplicates(
  samples: FrameSample[],
  lumas: Array<LumaFrame | undefined>,
  similarityThreshold: number,
  similarityFn: (a: LumaFrame, b: LumaFrame) => number,
): void {
  let lastKeep = -1;
  samples.forEach((sample, index) => {
    const luma = lumas[index];
    if (!sample.extractionOk || !luma) {
      return;
    }
    if (lastKeep < 0) {
      lastKeep = index;
      return;
    }
    const prev = lumas[lastKeep];
    if (!prev) {
      lastKeep = index;
      return;
    }
    const score = similarityFn(prev, luma);
    sample.similarityScore = score;
    if (score >= similarityThreshold) {
      sample.isNearDuplicate = true;
      sample.duplicateOfSampleId = samples[lastKeep]?.sampleId;
    } else {
      lastKeep = index;
    }
  });
}

export function aggregateFrameStats(
  samples: FrameSample[],
  diffs: FrameDifference[],
  requested: number,
): FrameStatsAggregate {
  const extracted = samples.filter((item) => item.extractionOk);
  const usable = extracted.filter((item) => item.statistics && !item.isNearDuplicate);
  const lumas = usable.map((item) => item.statistics?.averageLuma ?? 0);
  const contrasts = usable.map((item) => item.statistics?.contrastProxy ?? 0);
  const sharps = usable.map((item) => item.statistics?.sharpnessProxy ?? 0);
  const changes = diffs.map((item) => item.normalizedDelta);
  const pairCount = Math.max(0, extracted.length - 1);
  const dupPairs = samples.filter((item) => item.isNearDuplicate).length;
  return {
    sampleCountRequested: requested,
    sampleCountExtracted: extracted.length,
    sampleCountUsable: usable.length,
    nearDuplicateCount: samples.filter((item) => item.isNearDuplicate).length,
    luma: minMedianMax(lumas),
    contrastProxy: minMedianMax(contrasts),
    sharpnessProxy: minMedianMax(sharps),
    frameChange: minMedianMax(changes),
    nearDuplicatePairRatio: pairCount === 0 ? 0 : dupPairs / pairCount,
  };
}

export function heuristicFrameWarnings(
  aggregate: FrameStatsAggregate,
  thresholds: {
    darkMedianCandidate: number;
    brightMedianCandidate: number;
    lowContrastStdDev: number;
    lowSharpnessProxy: number;
    manyDuplicateRatio: number;
  },
): string[] {
  const warnings: string[] = [];
  if (aggregate.luma.median <= thresholds.darkMedianCandidate) {
    warnings.push('FRAME_TOO_DARK_CANDIDATE');
  }
  if (aggregate.luma.median >= thresholds.brightMedianCandidate) {
    warnings.push('FRAME_TOO_BRIGHT_CANDIDATE');
  }
  if (aggregate.contrastProxy.median * 255 <= thresholds.lowContrastStdDev) {
    warnings.push('LOW_CONTRAST_CANDIDATE');
  }
  if (aggregate.sharpnessProxy.median <= thresholds.lowSharpnessProxy) {
    warnings.push('LOW_SHARPNESS_CANDIDATE');
  }
  if (aggregate.nearDuplicatePairRatio >= thresholds.manyDuplicateRatio) {
    warnings.push('MANY_NEAR_DUPLICATE_FRAMES');
  }
  return warnings;
}
