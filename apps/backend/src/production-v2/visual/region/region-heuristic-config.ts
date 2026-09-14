export const REGION_HEURISTIC_VERSION = 'region.heuristics:v1';

export const REGION_HEURISTIC_CONFIG = {
  borderMaxRatio: 0.22,
  borderMinRatio: 0.03,
  borderMinAnalysisPixels: 2,
  uniformityStdDevMax: 18,
  darkMeanMax: 40,
  lightMeanMin: 220,
  emptyGridSize: 8,
  emptyVarianceThreshold: 80,
  emptyMinAreaRatio: 0.06,
  topStripMaxHeight: 0.18,
  topStripMinHeight: 0.04,
  topBoundaryMin: 18,
  topInternalStdMin: 14,
  persistenceWarn: 0.5,
  minSamplesForPersistence: 2,
  preferSamplesForPersistence: 3,
  borderConfidenceCap: 0.8,
  emptyConfidenceCap: 0.8,
  topStripConfidenceCap: 0.7,
} as const;

export const BORDER_CLASSIFICATION = ['DARK_UNIFORM', 'LIGHT_UNIFORM', 'NEUTRAL_UNIFORM', 'UNKNOWN'] as const;
export type BorderClassification = (typeof BORDER_CLASSIFICATION)[number];

export const BORDER_SIDES = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'] as const;
export type BorderSide = (typeof BORDER_SIDES)[number];

export const HEURISTIC_SOURCE = {
  FRAME_LUMA_HEURISTIC: 'FRAME_LUMA_HEURISTIC',
  AGGREGATED_HEURISTIC: 'AGGREGATED_HEURISTIC',
  FFMPEG_CROPDETECT: 'FFMPEG_CROPDETECT',
} as const;
