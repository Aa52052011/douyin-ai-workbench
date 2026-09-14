import { createHash } from 'node:crypto';
import { REPEATED_SIGNAL_MIN_SUPPORT } from '../metrics/performance-feedback.constants.js';
import type { CompactFeedbackSignal, CompactPerformanceFeedback } from '../metrics/performance-feedback.types.js';

export const LEARNING_WINDOW_DAYS = 30;
export const LEARNING_MIN_SAMPLE_FOR_DIRECTION = 2;
export const CONVERSION_SIGNAL_CODES = ['FOLLOW_GROWTH', 'LEAD_GENERATION', 'SALES_CONVERSION'] as const;

export type LearningSignalType =
  | 'TOPIC'
  | 'HOOK'
  | 'ANGLE'
  | 'CTA'
  | 'CONTENT_PILLAR'
  | 'DURATION'
  | 'PRODUCTION_MODE'
  | 'ASSET_TYPE'
  | 'PACING'
  | 'VOICE_STYLE'
  | 'REFERENCE_PATTERN'
  | 'PERFORMANCE_METRIC';

export type LearningSignal = {
  signalType: LearningSignalType;
  direction: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  summary: string;
  supportCount: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  sampleSize: number;
  metricBasis: string[];
  observedFrom: string[];
  lastObservedAt: string;
  businessGoalRelevance: string;
  scope: 'PUBLICATION' | 'BATCH' | 'PILLAR' | 'TOPIC';
  key: string;
  status: 'candidate' | 'confirmed';
};

export type StrategyAdjustmentAction = 'KEEP' | 'INCREASE' | 'DECREASE' | 'TEST_MORE' | 'AVOID' | 'REFRESH_STRATEGY';

export type StrategyAdjustmentRecommendationPayload = {
  action: StrategyAdjustmentAction;
  rationale: string;
  signalKeys: string[];
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  scope: string;
  suggestedChanges: string[];
  generatedAt: string;
};

export function buildLearningSignalsFromPerformanceFeedback(
  feedback: CompactPerformanceFeedback,
  extras?: {
    referencePatternByPublication?: Record<string, string[]>;
    now?: Date;
  },
): LearningSignal[] {
  const now = extras?.now ?? new Date();
  const signals: LearningSignal[] = [];
  for (const row of feedback.positiveSignals) {
    signals.push(fromFeedback(row, 'POSITIVE', feedback.sampleSize, now));
  }
  for (const row of feedback.cautionSignals) {
    signals.push(fromFeedback(row, 'NEGATIVE', feedback.sampleSize, now));
  }
  const patternMap = extras?.referencePatternByPublication ?? {};
  const patternSupport = new Map<string, Set<string>>();
  for (const [publicationId, ids] of Object.entries(patternMap)) {
    for (const patternId of ids) {
      const set = patternSupport.get(patternId) ?? new Set();
      set.add(publicationId);
      patternSupport.set(patternId, set);
    }
  }
  for (const [patternId, pubs] of patternSupport) {
    const supportCount = pubs.size;
    signals.push({
      signalType: 'REFERENCE_PATTERN',
      direction: 'POSITIVE',
      summary: `参考结构 ${patternId.slice(0, 8)} 在已发布内容中出现`,
      supportCount,
      confidence: confidenceModel({ supportCount, sampleSize: feedback.sampleSize, recencyDays: 0, completeness: 1 }),
      sampleSize: feedback.sampleSize,
      metricBasis: ['publication'],
      observedFrom: [...pubs],
      lastObservedAt: now.toISOString(),
      businessGoalRelevance: 'CONTENT_STRUCTURE',
      scope: 'PUBLICATION',
      key: `REFERENCE_PATTERN:${patternId}`,
      status: supportCount >= REPEATED_SIGNAL_MIN_SUPPORT ? 'confirmed' : 'candidate',
    });
  }
  return signals.filter((item) => !CONVERSION_SIGNAL_CODES.some((code) => item.key.endsWith(`:${code}`)));
}

export function recommendationsFromSignals(
  signals: LearningSignal[],
  generatedAt = new Date(),
): StrategyAdjustmentRecommendationPayload[] {
  if (!signals.length) {
    return [];
  }
  const out: StrategyAdjustmentRecommendationPayload[] = [];
  for (const signal of signals) {
    if (signal.status === 'candidate') {
      out.push({
        action: signal.direction === 'NEGATIVE' ? 'KEEP' : 'TEST_MORE',
        rationale: '目前只有单次迹象，样本仍少，下一批可以小范围再试，不能据此改方向。',
        signalKeys: [signal.key],
        confidence: 'LOW',
        scope: signal.scope,
        suggestedChanges: [],
        generatedAt: generatedAt.toISOString(),
      });
      continue;
    }
    const strong =
      signal.supportCount >= REPEATED_SIGNAL_MIN_SUPPORT &&
      signal.sampleSize >= LEARNING_MIN_SAMPLE_FOR_DIRECTION &&
      (signal.confidence === 'MEDIUM' || signal.confidence === 'HIGH');
    if (signal.direction === 'POSITIVE' && strong) {
      out.push({
        action: 'INCREASE',
        rationale: '已有多次独立发布数据支持，下一批可适当增加这类内容比例。',
        signalKeys: [signal.key],
        confidence: signal.confidence,
        scope: signal.scope,
        suggestedChanges: ['increase similar content share next batch'],
        generatedAt: generatedAt.toISOString(),
      });
      continue;
    }
    if (signal.direction === 'NEGATIVE' && strong && signal.confidence === 'HIGH' && signal.sampleSize >= 4) {
      out.push({
        action: 'AVOID',
        rationale: '多次独立负向迹象较稳定，下一批可减少该类内容。',
        signalKeys: [signal.key],
        confidence: signal.confidence,
        scope: signal.scope,
        suggestedChanges: ['reduce similar content share next batch'],
        generatedAt: generatedAt.toISOString(),
      });
      continue;
    }
    if (signal.direction === 'NEGATIVE' && strong) {
      out.push({
        action: 'DECREASE',
        rationale: '已有重复负向迹象，下一批可谨慎减少，但仍需更多样本。',
        signalKeys: [signal.key],
        confidence: signal.confidence,
        scope: signal.scope,
        suggestedChanges: ['cautiously reduce similar content'],
        generatedAt: generatedAt.toISOString(),
      });
      continue;
    }
    out.push({
      action: 'KEEP',
      rationale: '目前有较稳定迹象，但还不足以调整方向。',
      signalKeys: [signal.key],
      confidence: signal.confidence,
      scope: signal.scope,
      suggestedChanges: [],
      generatedAt: generatedAt.toISOString(),
    });
  }
  return out;
}

export function learningStatusLabel(input: { sampleSize: number; confirmed: number; candidate: number }): string {
  if (input.sampleSize <= 0) return '数据不足，系统正在积累';
  if (input.confirmed > 0) return '已有多次数据支持';
  if (input.candidate > 0) return '出现初步迹象，系统会继续观察。';
  return '正在积累';
}

export function confidenceModel(input: {
  supportCount: number;
  sampleSize: number;
  recencyDays: number;
  completeness: number;
}): 'LOW' | 'MEDIUM' | 'HIGH' {
  const recency = input.recencyDays <= 7 ? 1 : input.recencyDays <= LEARNING_WINDOW_DAYS ? 0.7 : 0.4;
  const support = Math.min(1, input.supportCount / 4);
  const sample = Math.min(1, input.sampleSize / 8);
  const score = 0.35 * input.completeness + 0.3 * support + 0.2 * sample + 0.15 * recency;
  if (score >= 0.75 && input.supportCount >= 4) return 'HIGH';
  if (score >= 0.45 && input.supportCount >= REPEATED_SIGNAL_MIN_SUPPORT) return 'MEDIUM';
  return 'LOW';
}

export function learningWatermark(feedback: CompactPerformanceFeedback): string {
  const ids = [
    ...feedback.positiveSignals.flatMap((item) => item.publicationIds),
    ...feedback.cautionSignals.flatMap((item) => item.publicationIds),
  ]
    .sort()
    .join(',');
  const codes = [...feedback.positiveSignals, ...feedback.cautionSignals]
    .map((item) => `${item.code}:${item.supportCount}:${[...item.publicationIds].sort().join(',')}`)
    .sort()
    .join('|');
  return createHash('sha256')
    .update(`${feedback.sampleSize}|${ids}|${codes}`)
    .digest('hex')
    .slice(0, 32);
}

export function compactLearningContext(signals: LearningSignal[]) {
  return {
    confirmed: signals.filter((item) => item.status === 'confirmed').map(compactLearningSignal),
    candidate: signals.filter((item) => item.status === 'candidate').map(compactLearningSignal),
  };
}

export function bridgeLearningSignalsToMemory(signals: LearningSignal[]) {
  return {
    patterns: signals
      .filter((item) => item.status === 'confirmed')
      .map((item) => ({
        patternType: item.signalType === 'REFERENCE_PATTERN' ? 'PRODUCTION_STYLE' : 'PERFORMANCE_SIGNAL',
        key: item.key,
        summary: item.summary,
        supportCount: item.supportCount,
      })),
    candidateSignals: signals
      .filter((item) => item.status === 'candidate')
      .map((item) => ({
        patternType: 'PERFORMANCE_SIGNAL' as const,
        key: item.key,
        summary: item.summary,
        supportCount: 1 as const,
      })),
  };
}

function compactLearningSignal(signal: LearningSignal) {
  return {
    key: signal.key,
    summary: signal.summary,
    supportCount: signal.supportCount,
    status: signal.status,
  };
}

export function toPublicLearningView(input: {
  statusLabel: string;
  summaries: string[];
  nextBatchAdjustments: string[];
  dataSufficiency: string;
  lastUpdatedAt: string;
}) {
  return {
    statusLabel: input.statusLabel,
    summary: input.summaries,
    nextBatchAdjustments: input.nextBatchAdjustments,
    dataSufficiency: input.dataSufficiency,
    lastUpdatedAt: input.lastUpdatedAt,
  };
}

function fromFeedback(
  row: CompactFeedbackSignal,
  direction: 'POSITIVE' | 'NEGATIVE',
  sampleSize: number,
  now: Date,
): LearningSignal {
  const supportCount = new Set(row.publicationIds).size;
  return {
    signalType: 'PERFORMANCE_METRIC',
    direction,
    summary: humanSummary(row.code, direction, supportCount),
    supportCount,
    confidence: confidenceModel({
      supportCount,
      sampleSize,
      recencyDays: 0,
      completeness: row.representativeEvidence.length > 0 ? 1 : 0.5,
    }),
    sampleSize,
    metricBasis: row.representativeEvidence.map((item) => item.metric),
    observedFrom: [...new Set(row.publicationIds)],
    lastObservedAt: now.toISOString(),
    businessGoalRelevance: 'ENGAGEMENT',
    scope: 'PUBLICATION',
    key: `PERFORMANCE_METRIC:${row.code}`,
    status: supportCount >= REPEATED_SIGNAL_MIN_SUPPORT ? 'confirmed' : 'candidate',
  };
}

function humanSummary(code: string, direction: string, supportCount: number): string {
  if (supportCount >= REPEATED_SIGNAL_MIN_SUPPORT) {
    return direction === 'POSITIVE'
      ? `已有多次数据支持：互动表现较好（${code}）`
      : `已有多次数据支持：互动偏弱（${code}）`;
  }
  return direction === 'POSITIVE' ? `单次正向迹象（${code}），样本仍少` : `单次负向迹象（${code}），样本仍少`;
}
