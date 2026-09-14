export const FRAME_SAMPLING_CONFIG_VERSION = 'uniform-v1';

/**
 * Frame extraction roles (concepts only).
 * ANALYSIS_FRAME_SAMPLE: low-res luma stats (B1).
 * SEMANTIC_FRAME_EXTRACT: higher-res Vision/OCR input (B2-2 runtime).
 * EDITING_FRAME_EXTRACT / FRAME_INTERPOLATION: editing, not analysis.
 */
export const FRAME_USE = {
  ANALYSIS_FRAME_SAMPLE: 'ANALYSIS_FRAME_SAMPLE',
  SEMANTIC_FRAME_EXTRACT: 'SEMANTIC_FRAME_EXTRACT',
  EDITING_FRAME_EXTRACT: 'EDITING_FRAME_EXTRACT',
  FRAME_INTERPOLATION: 'FRAME_INTERPOLATION',
} as const;

export const SAMPLING_STRATEGIES = ['UNIFORM_V1', 'HYBRID', 'SCENE_CHANGE', 'MOTION_CHANGE'] as const;
export type SamplingStrategy = (typeof SAMPLING_STRATEGIES)[number];
export const IMPLEMENTED_SAMPLING_STRATEGY = 'UNIFORM_V1' as const;

export const FRAME_ANALYSIS_CONFIG = {
  configVersion: FRAME_SAMPLING_CONFIG_VERSION,
  strategy: IMPLEMENTED_SAMPLING_STRATEGY,
  maxFrames: 10,
  imageSampleCount: 1,
  videoLe15sSampleCount: 5,
  videoLe60sSampleCount: 8,
  videoGt60sSampleCount: 10,
  minGapMs: 40,
  veryShortMs: 500,
  shortMs: 1000,
  safeTailMs: 80,
  analysisLongEdge: 96,
  extractTimeoutMs: 8_000,
  extractConcurrency: 1,
  darkLumaMax: 16,
  brightLumaMin: 239,
  similarityNearDuplicate: 0.97,
  darkMedianCandidate: 28,
  brightMedianCandidate: 230,
  lowContrastStdDev: 12,
  lowSharpnessProxy: 12,
  manyDuplicateRatio: 0.6,
} as const;

export function requestedSampleCount(durationMs: number): number {
  if (durationMs <= 15_000) {
    return FRAME_ANALYSIS_CONFIG.videoLe15sSampleCount;
  }
  if (durationMs <= 60_000) {
    return FRAME_ANALYSIS_CONFIG.videoLe60sSampleCount;
  }
  return FRAME_ANALYSIS_CONFIG.videoGt60sSampleCount;
}

export function effectiveSampleCount(durationMs: number, requested = requestedSampleCount(durationMs)): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }
  const maxByGap = Math.max(1, Math.floor(durationMs / FRAME_ANALYSIS_CONFIG.minGapMs));
  let count = Math.min(requested, FRAME_ANALYSIS_CONFIG.maxFrames, maxByGap);
  if (durationMs < FRAME_ANALYSIS_CONFIG.veryShortMs) {
    count = 1;
  } else if (durationMs < FRAME_ANALYSIS_CONFIG.shortMs) {
    count = Math.min(2, count);
  }
  return Math.max(1, count);
}

export function analysisSize(sourceWidth: number, sourceHeight: number, longEdge = FRAME_ANALYSIS_CONFIG.analysisLongEdge): {
  width: number;
  height: number;
} {
  const w = Math.max(1, sourceWidth);
  const h = Math.max(1, sourceHeight);
  if (w >= h) {
    return { width: longEdge, height: Math.max(1, Math.round((h * longEdge) / w)) };
  }
  return { width: Math.max(1, Math.round((w * longEdge) / h)), height: longEdge };
}
