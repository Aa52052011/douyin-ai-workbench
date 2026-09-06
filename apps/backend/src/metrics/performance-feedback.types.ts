import type { InsightCategory, InsightCode, InsightConfidence } from './performance-insight.types.js';
import type { PerformanceWindow } from './publication-performance.types.js';

export const FEEDBACK_DATA_STATES = ['NONE', 'LIMITED', 'USABLE', 'MIXED'] as const;

export type FeedbackDataState = (typeof FEEDBACK_DATA_STATES)[number];

export type CompactFeedbackEvidence = {
  metric: string;
  value: number | null;
  threshold: number | null;
  window: PerformanceWindow | null;
  publicationId?: string;
  referenceTitle?: string;
};

export type CompactFeedbackSignal = {
  code: InsightCode;
  category: InsightCategory;
  confidence: InsightConfidence;
  supportCount: number;
  publicationIds: string[];
  representativeEvidence: CompactFeedbackEvidence[];
};

export type CompactPerformanceFeedback = {
  version: 'v1';
  generatedAt: string;
  dataState: FeedbackDataState;
  sampleSize: number;
  publicationsConsidered: number;
  dataQuality: {
    sufficientCount: number;
    partialCount: number;
    insufficientCount: number;
  };
  positiveSignals: CompactFeedbackSignal[];
  cautionSignals: CompactFeedbackSignal[];
  dataQualitySignals: CompactFeedbackSignal[];
  inconsistentPerformance: boolean;
  avoidOvergeneralization: true;
};
