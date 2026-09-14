import type { LumaStatistics } from './luma-stats.js';

export type FrameSampleSource = 'START' | 'END' | 'UNIFORM' | 'FUTURE_SCENE' | 'FUTURE_MOTION';

export type FrameSampleStatistics = LumaStatistics & {
  sharpnessProxy: number;
  analysisWidth: number;
  analysisHeight: number;
};

export type FrameSample = {
  sampleId: string;
  timestampMs: number;
  width: number;
  height: number;
  source: FrameSampleSource;
  /** Logical only, e.g. luma:s0 — never a filesystem path. */
  tempRef?: string;
  statistics?: FrameSampleStatistics;
  extractionOk: boolean;
  duplicateOfSampleId?: string;
  isNearDuplicate: boolean;
  /** 1 = identical to compared sample. */
  similarityScore?: number;
};

export type SamplingPlan = {
  strategy: 'UNIFORM_V1';
  requestedTimestampsMs: number[];
  maxFrames: number;
  sourceDurationMs?: number;
  dedupeEnabled: boolean;
  configVersion: string;
};

export type FrameDifference = {
  fromSampleId: string;
  toSampleId: string;
  delta: number;
  normalizedDelta: number;
  histogramDistance?: number;
};

export type MinMedianMax = {
  min: number;
  median: number;
  max: number;
};

export type FrameStatsAggregate = {
  sampleCountRequested: number;
  sampleCountExtracted: number;
  sampleCountUsable: number;
  nearDuplicateCount: number;
  luma: MinMedianMax;
  contrastProxy: MinMedianMax;
  sharpnessProxy: MinMedianMax;
  frameChange: MinMedianMax;
  nearDuplicatePairRatio: number;
};

export type FrameSamplesSummary = {
  sampleId: string;
  timestampMs: number;
  source: FrameSampleSource;
  extractionOk: boolean;
  isNearDuplicate: boolean;
  duplicateOfSampleId?: string;
  similarityScore?: number;
  averageLuma?: number;
  lumaStdDev?: number;
  sharpnessProxy?: number;
};
