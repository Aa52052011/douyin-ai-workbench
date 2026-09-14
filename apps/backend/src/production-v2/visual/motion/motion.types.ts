export type ActivityLevel = 'STATIC' | 'LOW_MOTION' | 'ACTIVE' | 'HIGH_MOTION';

export type MotionSummary = {
  samplePairCount: number;
  nearStaticPairCount: number;
  highChangePairCount: number;
  nearStaticPairRatio: number;
  frameChangeMedian: number;
  frameChangeMax: number;
  frameChangeVariance: number;
  activityLevel: ActivityLevel;
  confidence: number;
  source: 'AGGREGATED_HEURISTIC';
  uniqueSampleCount: number;
};

export type NearStaticPair = {
  fromSampleId: string;
  toSampleId: string;
  startMs: number;
  endMs: number;
  similarityScore: number;
  frameChange: number;
};

export type NearStaticRange = {
  startMs: number;
  endMs: number;
  durationMs: number;
  confidence: number;
  sampledCoverage: number;
};

export type LongStaticCandidate = {
  startMs: number;
  endMs: number;
  estimatedDurationMs: number;
  confidence: number;
  source: 'AGGREGATED_HEURISTIC';
};

export type HighChangePair = {
  fromSampleId: string;
  toSampleId: string;
  startMs: number;
  endMs: number;
  changeScore: number;
  histogramDistance?: number;
  confidence: number;
};

export type RapidChangeCandidate = {
  startMs: number;
  endMs: number;
  pairCount: number;
  confidence: number;
  source: 'AGGREGATED_HEURISTIC';
};

export type SceneChangeCandidate = {
  timestampMs: number;
  strength: number;
  confidence: number;
  source: 'SAMPLED_FRAME_DIFF' | 'SAMPLED_HISTOGRAM' | 'AGGREGATED_HEURISTIC';
  evidenceSampleIds: string[];
};

export type TemporalActivitySegment = {
  startMs: number;
  endMs: number;
  activityLevel: ActivityLevel;
  confidence: number;
  frameChangeMedian: number;
  pairCount: number;
};

export type MotionHeuristicsResult = {
  motionSummary?: MotionSummary;
  nearStaticPairs: NearStaticPair[];
  nearStaticRanges: NearStaticRange[];
  longStaticCandidates: LongStaticCandidate[];
  highChangePairs: HighChangePair[];
  rapidChangeCandidates: RapidChangeCandidate[];
  sceneChangeCandidates: SceneChangeCandidate[];
  temporalActivitySegments: TemporalActivitySegment[];
  warnings: string[];
  skipped?: 'IMAGE' | 'INSUFFICIENT_SAMPLES';
};
