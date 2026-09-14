export const CROP_GEOMETRY_SCORING_VERSION = 'crop.geometry:v1';

export const CROP_GEOMETRY_CONFIG = {
  minRetainedAreaRatio: 0.55,
  maxTrimRatioPerSide: 0.18,
  closeScoreThreshold: 0.2,
  heuristicConfidenceMin: 0.4,
  emptyTrimConfidenceMin: 0.45,
  emptyMinOccupancy: 0.08,
  lostAreaHighRisk: 0.5,
  lostAreaMediumRisk: 0.2,
  trimHighRisk: 0.14,
  trimMediumRisk: 0.08,
  occupancyHighReadabilityRisk: 0.4,
  occupancyMediumReadabilityRisk: 0.62,
  detailScaleHighRisk: 0.7,
  duplicateIou: 0.97,
  centerConfidence: 0.88,
  containConfidence: 0.9,
  activityConfidenceCap: 0.9,
  topTrimConfidenceCap: 0.7,
  weights: {
    retainedAreaScore: 0.28,
    detailScaleScore: 0.22,
    destructiveRiskScore: 0.18,
    platformSafetyScore: 0.16,
    geometryBalanceScore: 0.08,
    borderCleanupScore: 0.05,
    outputOccupancyScore: 0.03,
  },
} as const;

export type CropScoreWeights = typeof CROP_GEOMETRY_CONFIG.weights;
