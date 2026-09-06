import {
  INSIGHT_CATEGORY_ORDER,
  INSIGHT_WINDOW_PRIORITY,
  PERFORMANCE_INSIGHT_RULES_V1,
  PERFORMANCE_INSIGHT_RULES_VERSION,
} from './performance-insight.constants.js';
import type {
  DataSufficiency,
  InsightCode,
  InsightConfidence,
  InsightSeverity,
  PerformanceInsight,
  PerformanceInsightEvidence,
  PublicationPerformanceInsightResult,
} from './performance-insight.types.js';
import type { PublicationPerformanceSummary, WindowPointMetrics } from './publication-metrics-aggregator.js';
import type { PerformanceWindow } from './publication-performance.types.js';

type RateMetric = 'likeRate' | 'commentRate' | 'shareRate' | 'favoriteRate' | 'engagementRate';

const CONFIDENCE_RANK: InsightConfidence[] = ['LOW', 'MEDIUM', 'HIGH'];

export function generatePerformanceInsights(
  summary: PublicationPerformanceSummary,
  generatedAt: Date = new Date(),
): PublicationPerformanceInsightResult {
  const dataSufficiency = evaluateDataSufficiency(summary);
  const insights: PerformanceInsight[] = [];
  pushQualityInsights(insights, summary, dataSufficiency);
  if (dataSufficiency !== 'INSUFFICIENT') {
    pushRateInsights(insights, summary, dataSufficiency);
    pushRetentionInsights(insights, summary, dataSufficiency);
  }
  insights.sort(compareInsights);
  return {
    publicationId: summary.publicationId,
    generatedAt,
    rulesVersion: PERFORMANCE_INSIGHT_RULES_VERSION,
    summaryGeneratedAt: summary.generatedAt,
    dataSufficiency,
    insights,
  };
}

export function evaluateDataSufficiency(summary: PublicationPerformanceSummary): DataSufficiency {
  const flags = new Set(summary.dataQualityFlags);
  if (summary.snapshotCount === 0 || flags.has('NO_SNAPSHOTS')) {
    return 'INSUFFICIENT';
  }
  const viewsKnown =
    summary.windows.H24.views != null ||
    summary.windows.D7.views != null ||
    summary.windows.LIFETIME.views != null ||
    summary.latest?.views != null;
  if (flags.has('MISSING_VIEWS') && !viewsKnown) {
    return 'INSUFFICIENT';
  }
  if (flags.has('SINGLE_SNAPSHOT_ONLY')) {
    return 'PARTIAL';
  }
  const h24 = summary.windows.H24;
  if (
    summary.snapshotCount >= 2 &&
    h24.views != null &&
    h24.observationCoverage != null &&
    h24.observationCoverage >= PERFORMANCE_INSIGHT_RULES_V1.minObservationCoverageForSufficient
  ) {
    return 'SUFFICIENT';
  }
  return 'PARTIAL';
}

function pushQualityInsights(
  insights: PerformanceInsight[],
  summary: PublicationPerformanceSummary,
  dataSufficiency: DataSufficiency,
): void {
  if (dataSufficiency !== 'SUFFICIENT') {
    insights.push(
      qualityInsight({
        code: 'INSUFFICIENT_DATA',
        severity: summary.snapshotCount === 0 ? 'WARNING' : 'INFO',
        window: 'H24',
        evidence: [
          evidenceFromWindow(summary, summary.windows.H24, {
            metric: 'dataSufficiency',
            value: sufficiencyRank(dataSufficiency),
            comparator: '==',
            threshold: sufficiencyRank('SUFFICIENT'),
          }),
        ],
      }),
    );
  }
  if (summary.dataQualityFlags.includes('MIXED_SOURCES')) {
    insights.push(
      qualityInsight({
        code: 'MIXED_SOURCE_DATA',
        severity: 'INFO',
        window: 'LIFETIME',
        evidence: [
          evidenceFromWindow(summary, summary.windows.LIFETIME, {
            metric: 'mixedSources',
            value: summary.sourcesUsed.length,
            comparator: '>=',
            threshold: 2,
          }),
        ],
      }),
    );
  }
  if (summary.dataQualityFlags.includes('METRIC_DECREASE_DETECTED')) {
    insights.push(
      qualityInsight({
        code: 'METRIC_DECREASE_DETECTED',
        severity: 'WARNING',
        window: 'LIFETIME',
        evidence: [
          evidenceFromWindow(summary, summary.windows.LIFETIME, {
            metric: 'METRIC_DECREASE_DETECTED',
            value: summary.latest?.viewsDelta ?? summary.windows.LIFETIME.viewsDeltaObserved,
            comparator: 'flag',
            threshold: 0,
          }),
        ],
      }),
    );
  }
  if (summary.dataQualityFlags.includes('SAME_TIME_CONFLICT')) {
    insights.push(
      qualityInsight({
        code: 'SAME_TIME_CONFLICT',
        severity: 'WARNING',
        window: 'LIFETIME',
        evidence: [
          evidenceFromWindow(summary, summary.windows.LIFETIME, {
            metric: 'SAME_TIME_CONFLICT',
            value: null,
            comparator: 'flag',
            threshold: null,
          }),
        ],
      }),
    );
  }
}

function pushRateInsights(
  insights: PerformanceInsight[],
  summary: PublicationPerformanceSummary,
  dataSufficiency: DataSufficiency,
): void {
  addHighRate(insights, summary, dataSufficiency, 'HIGH_LIKE_RATE', 'likeRate', PERFORMANCE_INSIGHT_RULES_V1.likeRateHigh);
  addHighRate(insights, summary, dataSufficiency, 'HIGH_COMMENT_RATE', 'commentRate', PERFORMANCE_INSIGHT_RULES_V1.commentRateHigh);
  addHighRate(insights, summary, dataSufficiency, 'HIGH_SHARE_RATE', 'shareRate', PERFORMANCE_INSIGHT_RULES_V1.shareRateHigh);
  addHighRate(insights, summary, dataSufficiency, 'HIGH_FAVORITE_RATE', 'favoriteRate', PERFORMANCE_INSIGHT_RULES_V1.favoriteRateHigh);
  addHighRate(
    insights,
    summary,
    dataSufficiency,
    'HIGH_ENGAGEMENT_RATE',
    'engagementRate',
    PERFORMANCE_INSIGHT_RULES_V1.engagementRateHigh,
  );
  if (dataSufficiency === 'SUFFICIENT') {
    addLowRate(insights, summary, dataSufficiency, 'LOW_LIKE_RATE', 'likeRate', PERFORMANCE_INSIGHT_RULES_V1.likeRateLow);
    addLowRate(
      insights,
      summary,
      dataSufficiency,
      'LOW_ENGAGEMENT_RATE',
      'engagementRate',
      PERFORMANCE_INSIGHT_RULES_V1.engagementRateLow,
    );
  }
}

function pushRetentionInsights(
  insights: PerformanceInsight[],
  summary: PublicationPerformanceSummary,
  dataSufficiency: DataSufficiency,
): void {
  const picked = pickWindow(summary, (point) => {
    return (
      point.completionRate != null &&
      point.views != null &&
      point.views >= PERFORMANCE_INSIGHT_RULES_V1.minViewsForRetentionInsight
    );
  });
  if (!picked) {
    return;
  }
  const coverageOk =
    picked.point.observationCoverage != null &&
    picked.point.observationCoverage >= PERFORMANCE_INSIGHT_RULES_V1.minObservationCoverageForRetention;
  const completionRate = picked.point.completionRate;
  if (completionRate == null) {
    return;
  }
  if (completionRate >= PERFORMANCE_INSIGHT_RULES_V1.completionRateStrong) {
    insights.push(
      performanceInsight({
        code: 'STRONG_COMPLETION_RATE',
        category: 'RETENTION',
        severity: 'POSITIVE',
        summary,
        dataSufficiency,
        window: picked.window,
        point: picked.point,
        sparse: !coverageOk || isSparseWindow(summary, picked.window),
        evidence: [
          evidenceFromWindow(summary, picked.point, {
            metric: 'completionRate',
            value: completionRate,
            comparator: '>=',
            threshold: PERFORMANCE_INSIGHT_RULES_V1.completionRateStrong,
          }),
        ],
      }),
    );
  }
  if (
    dataSufficiency === 'SUFFICIENT' &&
    coverageOk &&
    completionRate < PERFORMANCE_INSIGHT_RULES_V1.completionRateWeak
  ) {
    insights.push(
      performanceInsight({
        code: 'WEAK_COMPLETION_RATE',
        category: 'RETENTION',
        severity: 'WARNING',
        summary,
        dataSufficiency,
        window: picked.window,
        point: picked.point,
        sparse: isSparseWindow(summary, picked.window),
        evidence: [
          evidenceFromWindow(summary, picked.point, {
            metric: 'completionRate',
            value: completionRate,
            comparator: '<',
            threshold: PERFORMANCE_INSIGHT_RULES_V1.completionRateWeak,
          }),
        ],
      }),
    );
  }
}

function addHighRate(
  insights: PerformanceInsight[],
  summary: PublicationPerformanceSummary,
  dataSufficiency: DataSufficiency,
  code: InsightCode,
  metric: RateMetric,
  threshold: number,
): void {
  const picked = pickRateWindow(summary, metric);
  if (!picked || picked.point[metric]! < threshold) {
    return;
  }
  insights.push(
    performanceInsight({
      code,
      category: 'ENGAGEMENT',
      severity: 'POSITIVE',
      summary,
      dataSufficiency,
      window: picked.window,
      point: picked.point,
      sparse: isSparseWindow(summary, picked.window),
      evidence: [
        evidenceFromWindow(summary, picked.point, {
          metric,
          value: picked.point[metric],
          comparator: '>=',
          threshold,
        }),
      ],
    }),
  );
}

function addLowRate(
  insights: PerformanceInsight[],
  summary: PublicationPerformanceSummary,
  dataSufficiency: DataSufficiency,
  code: InsightCode,
  metric: RateMetric,
  threshold: number,
): void {
  const picked = pickRateWindow(summary, metric);
  if (!picked || picked.point[metric]! >= threshold) {
    return;
  }
  insights.push(
    performanceInsight({
      code,
      category: 'ENGAGEMENT',
      severity: 'WARNING',
      summary,
      dataSufficiency,
      window: picked.window,
      point: picked.point,
      sparse: isSparseWindow(summary, picked.window),
      evidence: [
        evidenceFromWindow(summary, picked.point, {
          metric,
          value: picked.point[metric],
          comparator: '<',
          threshold,
        }),
      ],
    }),
  );
}

function pickRateWindow(
  summary: PublicationPerformanceSummary,
  metric: RateMetric,
): { window: PerformanceWindow; point: WindowPointMetrics } | null {
  return pickWindow(summary, (point) => {
    return (
      point[metric] != null &&
      point.views != null &&
      point.views >= PERFORMANCE_INSIGHT_RULES_V1.minViewsForRateInsight
    );
  });
}

function pickWindow(
  summary: PublicationPerformanceSummary,
  eligible: (point: WindowPointMetrics) => boolean,
): { window: PerformanceWindow; point: WindowPointMetrics } | null {
  for (const window of INSIGHT_WINDOW_PRIORITY) {
    const point = summary.windows[window];
    if (eligible(point)) {
      return { window, point };
    }
  }
  return null;
}

function isSparseWindow(summary: PublicationPerformanceSummary, window: PerformanceWindow): boolean {
  if (window === 'H24') {
    return summary.dataQualityFlags.includes('SPARSE_24H');
  }
  if (window === 'D7') {
    return summary.dataQualityFlags.includes('SPARSE_7D');
  }
  return false;
}

function qualityInsight(input: {
  code: InsightCode;
  severity: InsightSeverity;
  window: PerformanceWindow;
  evidence: PerformanceInsightEvidence[];
}): PerformanceInsight {
  return {
    code: input.code,
    category: 'DATA_QUALITY',
    severity: input.severity,
    confidence: 'HIGH',
    window: input.window,
    messageKey: messageKeyFor(input.code),
    evidence: input.evidence,
  };
}

function performanceInsight(input: {
  code: InsightCode;
  category: 'ENGAGEMENT' | 'RETENTION';
  severity: InsightSeverity;
  summary: PublicationPerformanceSummary;
  dataSufficiency: DataSufficiency;
  window: PerformanceWindow;
  point: WindowPointMetrics;
  sparse: boolean;
  evidence: PerformanceInsightEvidence[];
}): PerformanceInsight {
  return {
    code: input.code,
    category: input.category,
    severity: input.severity,
    confidence: adjustConfidence({
      base: 'HIGH',
      mixedSources: input.summary.mixedSources,
      sameTimeConflict: input.summary.dataQualityFlags.includes('SAME_TIME_CONFLICT'),
      sparse: input.sparse,
      dataSufficiency: input.dataSufficiency,
    }),
    window: input.window,
    messageKey: messageKeyFor(input.code),
    evidence: input.evidence,
  };
}

export function adjustConfidence(input: {
  base: InsightConfidence;
  mixedSources: boolean;
  sameTimeConflict: boolean;
  sparse: boolean;
  dataSufficiency: DataSufficiency;
}): InsightConfidence {
  let drops = 0;
  if (input.mixedSources) {
    drops += 1;
  }
  if (input.sameTimeConflict) {
    drops += 1;
  }
  if (input.sparse) {
    drops += 1;
  }
  let level = dropConfidence(input.base, drops);
  if (input.dataSufficiency === 'PARTIAL' && level === 'HIGH') {
    level = 'MEDIUM';
  }
  return level;
}

function dropConfidence(level: InsightConfidence, drops: number): InsightConfidence {
  const index = CONFIDENCE_RANK.indexOf(level);
  return CONFIDENCE_RANK[Math.max(0, index - drops)] ?? 'LOW';
}

function evidenceFromWindow(
  summary: PublicationPerformanceSummary,
  point: WindowPointMetrics,
  fields: Pick<PerformanceInsightEvidence, 'metric' | 'value' | 'comparator' | 'threshold'>,
): PerformanceInsightEvidence {
  return {
    metric: fields.metric,
    value: fields.value,
    comparator: fields.comparator,
    threshold: fields.threshold,
    views: point.views,
    observationCoverage: point.observationCoverage,
    snapshotCount: summary.snapshotCount,
    windowObservedAt: point.observedAt,
    snapshotId: point.snapshotId,
  };
}

function messageKeyFor(code: InsightCode): string {
  return `performanceInsight.${PERFORMANCE_INSIGHT_RULES_VERSION}.${code}`;
}

function sufficiencyRank(level: DataSufficiency): number {
  if (level === 'INSUFFICIENT') {
    return 0;
  }
  if (level === 'PARTIAL') {
    return 1;
  }
  return 2;
}

function compareInsights(a: PerformanceInsight, b: PerformanceInsight): number {
  const category = (INSIGHT_CATEGORY_ORDER[a.category] ?? 99) - (INSIGHT_CATEGORY_ORDER[b.category] ?? 99);
  if (category !== 0) {
    return category;
  }
  if (a.code === b.code) {
    return 0;
  }
  return a.code < b.code ? -1 : 1;
}
