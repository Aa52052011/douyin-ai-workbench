import { PublicationStatus } from '@prisma/client';
import {
  CAUTION_INSIGHT_CODES,
  CONFIDENCE_RANK,
  CONFLICTING_INSIGHT_PAIRS,
  DATA_QUALITY_INSIGHT_CODES,
  DEFAULT_FEEDBACK_PUBLICATION_LIMIT,
  MAX_CAUTION_SIGNALS,
  MAX_DATA_QUALITY_SIGNALS,
  MAX_FEEDBACK_PUBLICATION_LIMIT,
  MAX_POSITIVE_SIGNALS,
  MAX_PUBLICATION_IDS_PER_SIGNAL,
  MAX_REPRESENTATIVE_EVIDENCE,
  PERFORMANCE_FEEDBACK_VERSION,
  POSITIVE_INSIGHT_CODES,
  REPEATED_SIGNAL_MIN_SUPPORT,
} from './performance-feedback.constants.js';
import type {
  CompactFeedbackEvidence,
  CompactFeedbackSignal,
  CompactPerformanceFeedback,
  FeedbackDataState,
} from './performance-feedback.types.js';
import type { InsightCategory, InsightCode, InsightConfidence, PerformanceInsight } from './performance-insight.types.js';
import type { PublicationPerformanceInsightResult } from './performance-insight.types.js';

const POSITIVE_SET = new Set<string>(POSITIVE_INSIGHT_CODES);
const CAUTION_SET = new Set<string>(CAUTION_INSIGHT_CODES);
const QUALITY_SET = new Set<string>(DATA_QUALITY_INSIGHT_CODES);

export type FeedbackPublicationRow = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  status: string;
  publishedAt: Date | null;
  createdAt: Date;
  title?: string;
};

export type FeedbackPublicationSource = {
  publicationId: string;
  title?: string;
  publishedAt: Date | null;
  insight: PublicationPerformanceInsightResult;
};

type SignalBucket = {
  code: InsightCode;
  category: InsightCategory;
  publicationIds: string[];
  confidences: InsightConfidence[];
  evidence: CompactFeedbackEvidence[];
};

export function emptyPerformanceFeedback(generatedAt: Date = new Date()): CompactPerformanceFeedback {
  return {
    version: PERFORMANCE_FEEDBACK_VERSION,
    generatedAt: generatedAt.toISOString(),
    dataState: 'NONE',
    sampleSize: 0,
    publicationsConsidered: 0,
    dataQuality: { sufficientCount: 0, partialCount: 0, insufficientCount: 0 },
    positiveSignals: [],
    cautionSignals: [],
    dataQualitySignals: [],
    inconsistentPerformance: false,
    avoidOvergeneralization: true,
  };
}

export function selectRecentPublishedPublications<T extends FeedbackPublicationRow>(
  rows: T[],
  scope: { tenantId: string; workspaceId: string; projectId: string },
  limit = DEFAULT_FEEDBACK_PUBLICATION_LIMIT,
): T[] {
  const capped = Math.min(Math.max(limit, 0), MAX_FEEDBACK_PUBLICATION_LIMIT);
  return rows
    .filter(
      (row) =>
        row.tenantId === scope.tenantId &&
        row.workspaceId === scope.workspaceId &&
        row.projectId === scope.projectId &&
        row.status === PublicationStatus.PUBLISHED &&
        row.publishedAt != null,
    )
    .sort(comparePublicationsNewestFirst)
    .slice(0, capped);
}

export function buildPerformanceFeedback(input: {
  publications: FeedbackPublicationSource[];
  generatedAt?: Date;
}): CompactPerformanceFeedback {
  const generatedAt = input.generatedAt ?? new Date();
  if (input.publications.length === 0) {
    return emptyPerformanceFeedback(generatedAt);
  }

  const dataQuality = { sufficientCount: 0, partialCount: 0, insufficientCount: 0 };
  const performance = new Map<InsightCode, SignalBucket>();
  const quality = new Map<InsightCode, SignalBucket>();

  for (const source of input.publications) {
    const sufficiency = source.insight.dataSufficiency;
    if (sufficiency === 'SUFFICIENT') {
      dataQuality.sufficientCount += 1;
    } else if (sufficiency === 'PARTIAL') {
      dataQuality.partialCount += 1;
    } else {
      dataQuality.insufficientCount += 1;
    }
    for (const insight of source.insight.insights) {
      const includePerformance = sufficiency !== 'INSUFFICIENT' && !QUALITY_SET.has(insight.code);
      if (includePerformance) {
        addToBucket(performance, insight, source);
      } else if (QUALITY_SET.has(insight.code)) {
        addToBucket(quality, insight, source);
      }
    }
  }

  const positiveSignals = takeSignals(performance, POSITIVE_SET, MAX_POSITIVE_SIGNALS);
  const cautionSignals = takeSignals(performance, CAUTION_SET, MAX_CAUTION_SIGNALS);
  const dataQualitySignals = takeSignals(quality, QUALITY_SET, MAX_DATA_QUALITY_SIGNALS, 1);
  const seenCodes = new Set([...performance.keys()]);
  const inconsistentPerformance = CONFLICTING_INSIGHT_PAIRS.some(
    ([high, low]) => seenCodes.has(high) && seenCodes.has(low),
  );
  const sampleSize = input.publications.length;
  const hasRepeated = positiveSignals.length + cautionSignals.length > 0;

  return {
    version: PERFORMANCE_FEEDBACK_VERSION,
    generatedAt: generatedAt.toISOString(),
    dataState: resolveDataState({
      sampleSize,
      sufficientCount: dataQuality.sufficientCount,
      hasRepeated,
      inconsistentPerformance,
    }),
    sampleSize,
    publicationsConsidered: sampleSize,
    dataQuality,
    positiveSignals,
    cautionSignals,
    dataQualitySignals,
    inconsistentPerformance,
    avoidOvergeneralization: true,
  };
}

function resolveDataState(input: {
  sampleSize: number;
  sufficientCount: number;
  hasRepeated: boolean;
  inconsistentPerformance: boolean;
}): FeedbackDataState {
  if (input.sampleSize === 0) {
    return 'NONE';
  }
  if (input.inconsistentPerformance && input.sampleSize >= 2) {
    return 'MIXED';
  }
  if (input.sampleSize < 2 || input.sufficientCount === 0 || !input.hasRepeated) {
    return 'LIMITED';
  }
  return 'USABLE';
}

function addToBucket(
  buckets: Map<InsightCode, SignalBucket>,
  insight: PerformanceInsight,
  source: FeedbackPublicationSource,
): void {
  const current = buckets.get(insight.code) ?? {
    code: insight.code,
    category: insight.category,
    publicationIds: [],
    confidences: [],
    evidence: [],
  };
  if (!current.publicationIds.includes(source.publicationId)) {
    current.publicationIds.push(source.publicationId);
  }
  current.confidences.push(insight.confidence);
  if (current.evidence.length < MAX_REPRESENTATIVE_EVIDENCE) {
    const first = insight.evidence[0];
    if (first) {
      current.evidence.push({
        metric: first.metric,
        value: first.value,
        threshold: first.threshold,
        window: insight.window,
        publicationId: source.publicationId,
        ...(source.title ? { referenceTitle: source.title.slice(0, 80) } : {}),
      });
    }
  }
  buckets.set(insight.code, current);
}

function takeSignals(
  buckets: Map<InsightCode, SignalBucket>,
  allowed: Set<string>,
  limit: number,
  minSupport = REPEATED_SIGNAL_MIN_SUPPORT,
): CompactFeedbackSignal[] {
  return [...buckets.values()]
    .filter((bucket) => allowed.has(bucket.code) && bucket.publicationIds.length >= minSupport)
    .map(toSignal)
    .sort(compareSignals)
    .slice(0, limit);
}

function toSignal(bucket: SignalBucket): CompactFeedbackSignal {
  return {
    code: bucket.code,
    category: bucket.category,
    confidence: aggregateConfidence(bucket.confidences, bucket.publicationIds.length),
    supportCount: bucket.publicationIds.length,
    publicationIds: bucket.publicationIds.slice(0, MAX_PUBLICATION_IDS_PER_SIGNAL),
    representativeEvidence: bucket.evidence.slice(0, MAX_REPRESENTATIVE_EVIDENCE),
  };
}

export function aggregateConfidence(
  confidences: InsightConfidence[],
  supportCount: number,
): InsightConfidence {
  if (confidences.length === 0) {
    return 'LOW';
  }
  if (confidences.includes('LOW')) {
    return 'LOW';
  }
  if (confidences.every((item) => item === 'HIGH') && supportCount >= REPEATED_SIGNAL_MIN_SUPPORT) {
    return 'HIGH';
  }
  return 'MEDIUM';
}

function compareSignals(a: CompactFeedbackSignal, b: CompactFeedbackSignal): number {
  if (a.supportCount !== b.supportCount) {
    return b.supportCount - a.supportCount;
  }
  const confidence = (CONFIDENCE_RANK[b.confidence] ?? 0) - (CONFIDENCE_RANK[a.confidence] ?? 0);
  if (confidence !== 0) {
    return confidence;
  }
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

function comparePublicationsNewestFirst(a: FeedbackPublicationRow, b: FeedbackPublicationRow): number {
  const published = (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
  if (published !== 0) {
    return published;
  }
  const created = b.createdAt.getTime() - a.createdAt.getTime();
  if (created !== 0) {
    return created;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? 1 : -1;
}
