import type { NormalizedRect } from '../geometry/types.js';
import type { BorderClassification, BorderSide } from './region-heuristic-config.js';

export type BorderCandidate = {
  side: BorderSide;
  rect: NormalizedRect;
  normalizedSize: number;
  meanLuma: number;
  lumaVariance: number;
  uniformityScore: number;
  darknessScore: number;
  persistenceRatio: number;
  persistenceRatioAllSamples: number;
  persistenceRatioDedupWeighted: number;
  uniqueSampleCount: number;
  confidence: number;
  source: 'FRAME_LUMA_HEURISTIC' | 'AGGREGATED_HEURISTIC' | 'FFMPEG_CROPDETECT';
  classification: BorderClassification;
  observedSampleTimestamps?: number[];
  firstObservedMs?: number;
  lastObservedMs?: number;
};

export type EmptyRegionCandidate = {
  rect: NormalizedRect;
  textureProxy: number;
  lumaVariance: number;
  occupancyRatio: number;
  edgeBiased: boolean;
  persistenceRatio: number;
  persistenceRatioAllSamples: number;
  persistenceRatioDedupWeighted: number;
  uniqueSampleCount: number;
  confidence: number;
  source: 'FRAME_LUMA_HEURISTIC' | 'AGGREGATED_HEURISTIC';
  observedSampleTimestamps?: number[];
  firstObservedMs?: number;
  lastObservedMs?: number;
};

/**
 * Geometry/statistical candidate only.
 * Does NOT mean browser chrome, product nav, or any named UI.
 */
export type TopStructuredStripCandidate = {
  rect: NormalizedRect;
  heightRatio: number;
  horizontalBoundaryStrength: number;
  internalContrastProxy: number;
  persistenceRatio: number;
  persistenceRatioAllSamples: number;
  persistenceRatioDedupWeighted: number;
  uniqueSampleCount: number;
  stabilityScore: number;
  confidence: number;
  source: 'FRAME_LUMA_HEURISTIC' | 'AGGREGATED_HEURISTIC';
  observedSampleTimestamps?: number[];
  firstObservedMs?: number;
  lastObservedMs?: number;
};

export type FrameRegionHeuristics = {
  sampleId: string;
  timestampMs: number;
  borders: BorderCandidate[];
  emptyRegions: EmptyRegionCandidate[];
  topStructuredStrip?: TopStructuredStripCandidate;
};

export type AggregatedRegionHeuristics = {
  borderCandidates: BorderCandidate[];
  emptyRegionCandidates: EmptyRegionCandidate[];
  topStructuredStripCandidates: TopStructuredStripCandidate[];
  warnings: string[];
};
