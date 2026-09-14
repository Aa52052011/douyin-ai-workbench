import type { FrameSample } from '../frame/frame-sample.types.js';
import { HEURISTIC_SOURCE, REGION_HEURISTIC_CONFIG } from './region-heuristic-config.js';
import type {
  AggregatedRegionHeuristics,
  BorderCandidate,
  EmptyRegionCandidate,
  FrameRegionHeuristics,
  TopStructuredStripCandidate,
} from './region-heuristic.types.js';

function uniqueKeep(samples: FrameSample[]): FrameSample[] {
  return samples.filter((item) => item.extractionOk && !item.isNearDuplicate);
}

function usable(samples: FrameSample[]): FrameSample[] {
  return samples.filter((item) => item.extractionOk);
}

function sampleFactor(uniqueCount: number): number {
  if (uniqueCount < REGION_HEURISTIC_CONFIG.minSamplesForPersistence) {
    return 0.5;
  }
  if (uniqueCount < REGION_HEURISTIC_CONFIG.preferSamplesForPersistence) {
    return 0.7;
  }
  return 1;
}

function cap(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

function timestamps(hits: FrameRegionHeuristics[]): { observedSampleTimestamps: number[]; firstObservedMs?: number; lastObservedMs?: number } {
  const observedSampleTimestamps = hits.map((item) => item.timestampMs).sort((a, b) => a - b);
  return {
    observedSampleTimestamps,
    firstObservedMs: observedSampleTimestamps[0],
    lastObservedMs: observedSampleTimestamps[observedSampleTimestamps.length - 1],
  };
}

export function aggregateRegionHeuristics(
  perFrame: FrameRegionHeuristics[],
  samples: FrameSample[],
): AggregatedRegionHeuristics {
  const all = usable(samples);
  const uniq = uniqueKeep(samples);
  const warnings: string[] = [];
  if (all.length === 0) {
    return { borderCandidates: [], emptyRegionCandidates: [], topStructuredStripCandidates: [], warnings: ['REGION_HEURISTICS_NO_USABLE_FRAME'] };
  }
  const factor = sampleFactor(uniq.length);

  const borderCandidates: BorderCandidate[] = [];
  for (const side of ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'] as const) {
    const hits = perFrame.filter((frame) => frame.borders.some((b) => b.side === side));
    if (hits.length === 0) {
      continue;
    }
    const sizes = hits
      .map((frame) => frame.borders.find((b) => b.side === side)?.normalizedSize ?? 0)
      .sort((a, b) => a - b);
    const mid = sizes[Math.floor(sizes.length / 2)] ?? 0;
    const allRatio = hits.length / all.length;
    const uniqHits = hits.filter((h) => uniq.some((s) => s.sampleId === h.sampleId)).length;
    const dedupRatio = uniq.length === 0 ? 0 : uniqHits / uniq.length;
    const proto = hits[0]?.borders.find((b) => b.side === side);
    if (!proto) {
      continue;
    }
    const confidence = cap(dedupRatio * factor * REGION_HEURISTIC_CONFIG.borderConfidenceCap, REGION_HEURISTIC_CONFIG.borderConfidenceCap);
    borderCandidates.push({
      ...proto,
      normalizedSize: mid,
      rect:
        side === 'TOP'
          ? { x: 0, y: 0, width: 1, height: mid }
          : side === 'BOTTOM'
            ? { x: 0, y: 1 - mid, width: 1, height: mid }
            : side === 'LEFT'
              ? { x: 0, y: 0, width: mid, height: 1 }
              : { x: 1 - mid, y: 0, width: mid, height: 1 },
      persistenceRatio: dedupRatio,
      persistenceRatioAllSamples: allRatio,
      persistenceRatioDedupWeighted: dedupRatio,
      uniqueSampleCount: uniq.length,
      confidence,
      source: HEURISTIC_SOURCE.AGGREGATED_HEURISTIC,
      ...timestamps(hits),
    });
  }

  const emptyHits = perFrame.filter((frame) => frame.emptyRegions.some((r) => r.edgeBiased));
  const emptyRegionCandidates: EmptyRegionCandidate[] = [];
  if (emptyHits.length) {
    const first = emptyHits[0]?.emptyRegions.find((r) => r.edgeBiased) ?? emptyHits[0]?.emptyRegions[0];
    if (first) {
      const allRatio = emptyHits.length / all.length;
      const uniqHits = emptyHits.filter((h) => uniq.some((s) => s.sampleId === h.sampleId)).length;
      const dedupRatio = uniq.length === 0 ? 0 : uniqHits / uniq.length;
      emptyRegionCandidates.push({
        ...first,
        persistenceRatio: dedupRatio,
        persistenceRatioAllSamples: allRatio,
        persistenceRatioDedupWeighted: dedupRatio,
        uniqueSampleCount: uniq.length,
        confidence: cap(dedupRatio * factor * REGION_HEURISTIC_CONFIG.emptyConfidenceCap, REGION_HEURISTIC_CONFIG.emptyConfidenceCap),
        source: HEURISTIC_SOURCE.AGGREGATED_HEURISTIC,
        ...timestamps(emptyHits),
      });
    }
  }

  const topHits = perFrame.filter((frame) => frame.topStructuredStrip);
  const topStructuredStripCandidates: TopStructuredStripCandidate[] = [];
  if (topHits.length) {
    const heights = topHits.map((f) => f.topStructuredStrip!.heightRatio).sort((a, b) => a - b);
    const medianH = heights[Math.floor(heights.length / 2)] ?? 0;
    const heightVar = heights.reduce((s, h) => s + (h - medianH) ** 2, 0) / heights.length;
    const stabilityScore = Math.max(0, 1 - heightVar * 40);
    const allRatio = topHits.length / all.length;
    const uniqHits = topHits.filter((h) => uniq.some((s) => s.sampleId === h.sampleId)).length;
    const dedupRatio = uniq.length === 0 ? 0 : uniqHits / uniq.length;
    const proto = topHits[0]!.topStructuredStrip!;
    topStructuredStripCandidates.push({
      ...proto,
      heightRatio: medianH,
      rect: { x: 0, y: 0, width: 1, height: medianH },
      persistenceRatio: dedupRatio,
      persistenceRatioAllSamples: allRatio,
      persistenceRatioDedupWeighted: dedupRatio,
      uniqueSampleCount: uniq.length,
      stabilityScore,
      confidence: cap(
        dedupRatio * factor * stabilityScore * REGION_HEURISTIC_CONFIG.topStripConfidenceCap,
        REGION_HEURISTIC_CONFIG.topStripConfidenceCap,
      ),
      source: HEURISTIC_SOURCE.AGGREGATED_HEURISTIC,
      ...timestamps(topHits),
    });
  }

  if (borderCandidates.some((b) => b.persistenceRatioDedupWeighted >= REGION_HEURISTIC_CONFIG.persistenceWarn && b.uniqueSampleCount >= 2)) {
    warnings.push('PERSISTENT_UNIFORM_BORDER_CANDIDATE');
  }
  if (emptyRegionCandidates.some((e) => e.edgeBiased && e.occupancyRatio >= 0.12)) {
    warnings.push('LARGE_EMPTY_EDGE_REGION_CANDIDATE');
  }
  if (topStructuredStripCandidates.length > 0) {
    warnings.push('TOP_STRUCTURED_STRIP_CANDIDATE');
  }
  return { borderCandidates, emptyRegionCandidates, topStructuredStripCandidates, warnings };
}
