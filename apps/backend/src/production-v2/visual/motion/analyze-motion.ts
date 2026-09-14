import type { FrameDifference, FrameSample } from '../frame/frame-sample.types.js';
import { MOTION_HEURISTIC_CONFIG } from './motion-config.js';
import type {
  ActivityLevel,
  HighChangePair,
  LongStaticCandidate,
  MotionHeuristicsResult,
  MotionSummary,
  NearStaticPair,
  NearStaticRange,
  RapidChangeCandidate,
  SceneChangeCandidate,
  TemporalActivitySegment,
} from './motion.types.js';

export function histogramL1Normalized(a?: number[], b?: number[]): number | undefined {
  if (!a || !b || a.length !== b.length) {
    return undefined;
  }
  const sum = a.reduce((s, v) => s + v, 0);
  if (sum <= 0) {
    return 0;
  }
  let d = 0;
  for (let i = 0; i < a.length; i += 1) {
    d += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  }
  return Math.min(1, d / (2 * sum));
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function variance(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
}

function pairActivity(normalizedDelta: number): ActivityLevel {
  if (normalizedDelta < MOTION_HEURISTIC_CONFIG.lowMotionDeltaThreshold) {
    return 'STATIC';
  }
  if (normalizedDelta < MOTION_HEURISTIC_CONFIG.activeDeltaThreshold) {
    return 'LOW_MOTION';
  }
  if (normalizedDelta < MOTION_HEURISTIC_CONFIG.highMotionDeltaThreshold) {
    return 'ACTIVE';
  }
  return 'HIGH_MOTION';
}

function sampleById(samples: FrameSample[], id: string): FrameSample | undefined {
  return samples.find((item) => item.sampleId === id);
}

function diversityFactor(uniqueCount: number, pairCount: number, extracted: number, requested: number): number {
  let factor = 1;
  if (pairCount < MOTION_HEURISTIC_CONFIG.preferPairs) {
    factor *= 0.65;
  }
  if (uniqueCount < 2) {
    factor *= 0.55;
  } else if (uniqueCount < 3) {
    factor *= 0.8;
  }
  if (extracted > 0 && uniqueCount / extracted < 0.5) {
    factor *= 0.72;
  }
  if (requested > 0 && extracted < requested) {
    factor *= 0.85;
  }
  return factor;
}

function classifyOverall(nearStaticRatio: number, medianDelta: number, highRatio: number): ActivityLevel {
  if (nearStaticRatio >= 0.75 && medianDelta < MOTION_HEURISTIC_CONFIG.lowMotionDeltaThreshold) {
    return 'STATIC';
  }
  if (highRatio >= 0.5 || medianDelta >= MOTION_HEURISTIC_CONFIG.highMotionDeltaThreshold) {
    return 'HIGH_MOTION';
  }
  if (medianDelta >= MOTION_HEURISTIC_CONFIG.activeDeltaThreshold) {
    return 'ACTIVE';
  }
  return 'LOW_MOTION';
}

export function analyzeMotionHeuristics(input: {
  samples: FrameSample[];
  diffs: FrameDifference[];
  isImage: boolean;
  requestedSampleCount: number;
}): MotionHeuristicsResult {
  if (input.isImage) {
    return {
      nearStaticPairs: [],
      nearStaticRanges: [],
      longStaticCandidates: [],
      highChangePairs: [],
      rapidChangeCandidates: [],
      sceneChangeCandidates: [],
      temporalActivitySegments: [],
      warnings: [],
      skipped: 'IMAGE',
    };
  }
  const extracted = input.samples.filter((item) => item.extractionOk);
  const uniqueCount = extracted.filter((item) => !item.isNearDuplicate).length;
  if (extracted.length < 2 || input.diffs.length === 0) {
    return {
      nearStaticPairs: [],
      nearStaticRanges: [],
      longStaticCandidates: [],
      highChangePairs: [],
      rapidChangeCandidates: [],
      sceneChangeCandidates: [],
      temporalActivitySegments: [],
      warnings: ['MOTION_ANALYSIS_INSUFFICIENT_SAMPLES'],
      skipped: 'INSUFFICIENT_SAMPLES',
    };
  }

  const nearStaticPairs: NearStaticPair[] = [];
  const highChangePairs: HighChangePair[] = [];
  const sceneChangeCandidates: SceneChangeCandidate[] = [];
  const pairLevels: Array<{ startMs: number; endMs: number; level: ActivityLevel; delta: number }> = [];

  for (const diff of input.diffs) {
    const from = sampleById(input.samples, diff.fromSampleId);
    const to = sampleById(input.samples, diff.toSampleId);
    if (!from || !to) {
      continue;
    }
    const similarity = 1 - diff.normalizedDelta;
    const hist = histogramL1Normalized(from.statistics?.lumaHistogram16, to.statistics?.lumaHistogram16);
    const startMs = from.timestampMs;
    const endMs = to.timestampMs;
    pairLevels.push({ startMs, endMs, level: pairActivity(diff.normalizedDelta), delta: diff.normalizedDelta });
    if (similarity >= MOTION_HEURISTIC_CONFIG.nearStaticSimilarityThreshold) {
      nearStaticPairs.push({
        fromSampleId: from.sampleId,
        toSampleId: to.sampleId,
        startMs,
        endMs,
        similarityScore: similarity,
        frameChange: diff.normalizedDelta,
      });
    }
    if (diff.normalizedDelta >= MOTION_HEURISTIC_CONFIG.highMotionDeltaThreshold) {
      highChangePairs.push({
        fromSampleId: from.sampleId,
        toSampleId: to.sampleId,
        startMs,
        endMs,
        changeScore: diff.normalizedDelta,
        histogramDistance: hist,
        confidence: Math.min(MOTION_HEURISTIC_CONFIG.activityConfidenceCap, 0.5 + diff.normalizedDelta),
      });
    }
    const sceneStrength = 0.6 * diff.normalizedDelta + 0.4 * (hist ?? diff.normalizedDelta);
    const histHigh = (hist ?? 0) >= MOTION_HEURISTIC_CONFIG.sceneHistogramThreshold;
    const diffHigh = diff.normalizedDelta >= MOTION_HEURISTIC_CONFIG.sceneFrameDiffThreshold;
    if (sceneStrength >= MOTION_HEURISTIC_CONFIG.sceneCombinedThreshold && (diffHigh || histHigh)) {
      sceneChangeCandidates.push({
        timestampMs: Math.round((startMs + endMs) / 2),
        strength: sceneStrength,
        confidence: Math.min(MOTION_HEURISTIC_CONFIG.sceneConfidenceCap, sceneStrength * diversityFactor(uniqueCount, input.diffs.length, extracted.length, input.requestedSampleCount)),
        source: histHigh && diffHigh ? 'AGGREGATED_HEURISTIC' : histHigh ? 'SAMPLED_HISTOGRAM' : 'SAMPLED_FRAME_DIFF',
        evidenceSampleIds: [from.sampleId, to.sampleId],
      });
    }
  }

  const deltas = input.diffs.map((item) => item.normalizedDelta);
  const nearStaticPairRatio = nearStaticPairs.length / input.diffs.length;
  const highRatio = highChangePairs.length / input.diffs.length;
  const activityLevel = classifyOverall(nearStaticPairRatio, median(deltas), highRatio);
  const factor = diversityFactor(uniqueCount, input.diffs.length, extracted.length, input.requestedSampleCount);
  const motionSummary: MotionSummary = {
    samplePairCount: input.diffs.length,
    nearStaticPairCount: nearStaticPairs.length,
    highChangePairCount: highChangePairs.length,
    nearStaticPairRatio,
    frameChangeMedian: median(deltas),
    frameChangeMax: Math.max(...deltas, 0),
    frameChangeVariance: variance(deltas),
    activityLevel,
    confidence: Math.min(MOTION_HEURISTIC_CONFIG.activityConfidenceCap, factor * (0.45 + 0.4 * Math.min(1, input.diffs.length / MOTION_HEURISTIC_CONFIG.preferPairs))),
    source: 'AGGREGATED_HEURISTIC',
    uniqueSampleCount: uniqueCount,
  };

  const nearStaticRanges: NearStaticRange[] = [];
  let rangeStart: NearStaticPair | undefined;
  let rangeEnd: NearStaticPair | undefined;
  const flushRange = () => {
    if (!rangeStart || !rangeEnd) {
      return;
    }
    const durationMs = rangeEnd.endMs - rangeStart.startMs;
    nearStaticRanges.push({
      startMs: rangeStart.startMs,
      endMs: rangeEnd.endMs,
      durationMs,
      confidence: Math.min(motionSummary.confidence, 0.8),
      sampledCoverage: durationMs,
    });
  };
  for (const pair of nearStaticPairs) {
    if (!rangeEnd || pair.fromSampleId !== rangeEnd.toSampleId) {
      flushRange();
      rangeStart = pair;
      rangeEnd = pair;
    } else {
      rangeEnd = pair;
    }
  }
  flushRange();

  const longStaticCandidates: LongStaticCandidate[] = nearStaticRanges
    .filter((item) => item.durationMs >= MOTION_HEURISTIC_CONFIG.longStaticMinObservedMs)
    .map((item) => ({
      startMs: item.startMs,
      endMs: item.endMs,
      estimatedDurationMs: item.durationMs,
      confidence: item.confidence,
      source: 'AGGREGATED_HEURISTIC',
    }));

  const rapidChangeCandidates: RapidChangeCandidate[] = [];
  let rapidRun: HighChangePair[] = [];
  const flushRapid = () => {
    if (rapidRun.length >= MOTION_HEURISTIC_CONFIG.rapidChangePairCount) {
      const first = rapidRun[0]!;
      const last = rapidRun[rapidRun.length - 1]!;
      rapidChangeCandidates.push({
        startMs: first.startMs,
        endMs: last.endMs,
        pairCount: rapidRun.length,
        confidence: Math.min(MOTION_HEURISTIC_CONFIG.activityConfidenceCap, 0.4 + 0.15 * rapidRun.length),
        source: 'AGGREGATED_HEURISTIC',
      });
    }
    rapidRun = [];
  };
  for (const pair of highChangePairs) {
    const prev = rapidRun[rapidRun.length - 1];
    if (prev && pair.fromSampleId !== prev.toSampleId) {
      flushRapid();
    }
    rapidRun.push(pair);
  }
  flushRapid();

  const temporalActivitySegments: TemporalActivitySegment[] = [];
  for (const pair of pairLevels) {
    const last = temporalActivitySegments[temporalActivitySegments.length - 1];
    const gapOk = last ? pair.startMs - last.endMs <= MOTION_HEURISTIC_CONFIG.activityMergeGapMs : true;
    if (last && last.activityLevel === pair.level && gapOk) {
      last.endMs = pair.endMs;
      last.pairCount += 1;
      last.frameChangeMedian = (last.frameChangeMedian * (last.pairCount - 1) + pair.delta) / last.pairCount;
    } else {
      temporalActivitySegments.push({
        startMs: pair.startMs,
        endMs: pair.endMs,
        activityLevel: pair.level,
        confidence: Math.min(motionSummary.confidence, 0.35 + 0.15 * 1),
        frameChangeMedian: pair.delta,
        pairCount: 1,
      });
    }
  }
  for (const seg of temporalActivitySegments) {
    seg.confidence = Math.min(motionSummary.confidence, 0.35 + 0.12 * seg.pairCount);
  }

  const warnings: string[] = [];
  if (activityLevel === 'STATIC') {
    warnings.push('STATIC_CANDIDATE');
  } else if (activityLevel === 'LOW_MOTION') {
    warnings.push('LOW_ACTIVITY_CANDIDATE');
  } else if (activityLevel === 'HIGH_MOTION') {
    warnings.push('HIGH_ACTIVITY_CANDIDATE');
  }
  if (motionSummary.confidence < 0.55) {
    warnings.push('MOTION_ANALYSIS_LOW_CONFIDENCE');
  }
  if (longStaticCandidates.length) {
    warnings.push('LONG_STATIC_RANGE_CANDIDATE');
  }
  if (highChangePairs.length) {
    warnings.push('HIGH_VISUAL_CHANGE_CANDIDATE');
  }
  if (rapidChangeCandidates.length) {
    warnings.push('RAPID_CHANGE_CANDIDATE');
  }
  if (sceneChangeCandidates.length) {
    warnings.push('SCENE_CHANGE_CANDIDATE');
  }

  return {
    motionSummary,
    nearStaticPairs,
    nearStaticRanges,
    longStaticCandidates,
    highChangePairs,
    rapidChangeCandidates,
    sceneChangeCandidates,
    temporalActivitySegments,
    warnings,
  };
}
