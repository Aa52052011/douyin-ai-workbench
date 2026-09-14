export const MOTION_HEURISTIC_VERSION = 'motion.heuristics:v1';

export const MOTION_HEURISTIC_CONFIG = {
  nearStaticSimilarityThreshold: 0.97,
  lowMotionDeltaThreshold: 0.04,
  activeDeltaThreshold: 0.12,
  highMotionDeltaThreshold: 0.28,
  sceneFrameDiffThreshold: 0.22,
  sceneHistogramThreshold: 0.18,
  sceneCombinedThreshold: 0.24,
  longStaticMinObservedMs: 4000,
  rapidChangePairCount: 2,
  activityMergeGapMs: 8000,
  activityConfidenceCap: 0.9,
  sceneConfidenceCap: 0.85,
  minPairsForClassify: 1,
  preferPairs: 3,
} as const;

export const MOTION_SOURCE = {
  SAMPLED_FRAME_DIFF: 'SAMPLED_FRAME_DIFF',
  SAMPLED_HISTOGRAM: 'SAMPLED_HISTOGRAM',
  AGGREGATED_HEURISTIC: 'AGGREGATED_HEURISTIC',
} as const;
