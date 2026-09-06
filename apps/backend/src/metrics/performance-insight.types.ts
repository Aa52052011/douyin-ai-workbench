import type { PerformanceWindow } from './publication-performance.types.js';

export const INSIGHT_CATEGORIES = ['DATA_QUALITY', 'RETENTION', 'ENGAGEMENT', 'GROWTH', 'REACH'] as const;

export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

export const INSIGHT_SEVERITIES = ['INFO', 'POSITIVE', 'WARNING'] as const;

export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];

export const INSIGHT_CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;

export type InsightConfidence = (typeof INSIGHT_CONFIDENCE_LEVELS)[number];

export const DATA_SUFFICIENCY_LEVELS = ['INSUFFICIENT', 'PARTIAL', 'SUFFICIENT'] as const;

export type DataSufficiency = (typeof DATA_SUFFICIENCY_LEVELS)[number];

export const INSIGHT_CODES = [
  'INSUFFICIENT_DATA',
  'MIXED_SOURCE_DATA',
  'METRIC_DECREASE_DETECTED',
  'SAME_TIME_CONFLICT',
  'HIGH_LIKE_RATE',
  'LOW_LIKE_RATE',
  'HIGH_COMMENT_RATE',
  'HIGH_SHARE_RATE',
  'HIGH_FAVORITE_RATE',
  'HIGH_ENGAGEMENT_RATE',
  'LOW_ENGAGEMENT_RATE',
  'STRONG_COMPLETION_RATE',
  'WEAK_COMPLETION_RATE',
] as const;

export type InsightCode = (typeof INSIGHT_CODES)[number];

export const INSIGHT_COMPARATORS = ['>=', '<', '==', 'flag'] as const;

export type InsightComparator = (typeof INSIGHT_COMPARATORS)[number];

export type PerformanceInsightEvidence = {
  metric: string;
  value: number | null;
  comparator: InsightComparator;
  threshold: number | null;
  views: number | null;
  observationCoverage: number | null;
  snapshotCount: number;
  windowObservedAt: Date | null;
  snapshotId: string | null;
};

export type PerformanceInsight = {
  code: InsightCode;
  category: InsightCategory;
  severity: InsightSeverity;
  confidence: InsightConfidence;
  window: PerformanceWindow | null;
  messageKey: string;
  evidence: PerformanceInsightEvidence[];
};

export type PublicationPerformanceInsightResult = {
  publicationId: string;
  generatedAt: Date;
  rulesVersion: 'v1';
  summaryGeneratedAt: Date;
  dataSufficiency: DataSufficiency;
  insights: PerformanceInsight[];
};
