export const SEMANTIC_FRAME_CONFIG = {
  selectionVersion: 'semantic.frame-selection:v1',
  extractVersion: 'semantic.frame-extract:v1',
  strategy: 'HYBRID_SEMANTIC_V1',
  semanticLongEdge: 1280,
  minSemanticFrameGapMs: 750,
  sceneEdgeOffsetMs: 180,
  strongSceneBeforeAfter: true,
  strongSceneStrength: 0.55,
  strongSceneConfidence: 0.6,
  retryOffsetMs: 100,
  maxDecodeRetries: 1,
  extractTimeoutMs: 10_000,
  overallExtractTimeoutMs: 60_000,
  extractConcurrency: 1,
  jpegQuality: 2,
  visualDedupSimilarity: 0.97,
  lumaThumbLongEdge: 96,
  videoLe15sMax: 4,
  videoLe60sMax: 6,
  videoLe180sMax: 8,
  videoGt180sMax: 10,
  hardMax: 10,
  veryShortMs: 500,
  shortMs: 1000,
  reasonWeight: {
    MANUAL: 100,
    SCENE_CANDIDATE: 72,
    ACTIVITY_CHANGE: 66,
    START_REPRESENTATIVE: 56,
    END_REPRESENTATIVE: 56,
    LONG_STATIC_REPRESENTATIVE: 50,
    HIGH_CHANGE_REPRESENTATIVE: 48,
    DEDUP_REPLACEMENT: 42,
    UNIFORM_REPRESENTATIVE: 32,
    UNIFORM: 32,
    IMAGE_PRIMARY: 90,
  },
} as const;

export function semanticFrameBudget(durationMs: number | undefined): number {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs <= 0) {
    return SEMANTIC_FRAME_CONFIG.videoLe60sMax;
  }
  if (durationMs < SEMANTIC_FRAME_CONFIG.veryShortMs) {
    return 1;
  }
  if (durationMs < SEMANTIC_FRAME_CONFIG.shortMs) {
    return 2;
  }
  if (durationMs <= 15_000) {
    return SEMANTIC_FRAME_CONFIG.videoLe15sMax;
  }
  if (durationMs <= 60_000) {
    return SEMANTIC_FRAME_CONFIG.videoLe60sMax;
  }
  if (durationMs <= 180_000) {
    return SEMANTIC_FRAME_CONFIG.videoLe180sMax;
  }
  return Math.min(SEMANTIC_FRAME_CONFIG.videoGt180sMax, SEMANTIC_FRAME_CONFIG.hardMax);
}

export function semanticSize(sourceWidth: number, sourceHeight: number, longEdge = SEMANTIC_FRAME_CONFIG.semanticLongEdge): {
  width: number;
  height: number;
} {
  const w = Math.max(1, sourceWidth);
  const h = Math.max(1, sourceHeight);
  const currentLong = Math.max(w, h);
  if (currentLong <= longEdge) {
    return { width: w, height: h };
  }
  if (w >= h) {
    return { width: longEdge, height: Math.max(1, Math.round((h * longEdge) / w)) };
  }
  return { width: Math.max(1, Math.round((w * longEdge) / h)), height: longEdge };
}

export function stableSemanticFrameId(timestampMs: number): string {
  return `semantic-frame:${Math.round(timestampMs)}`;
}
