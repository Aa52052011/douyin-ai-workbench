import type { MetricSnapshotInputV1, PerformanceRecommendationV1, RecommendationReviewAction } from './performance-analysis.types.js';

export type RecommendationCategoryV1 =
  | 'HOOK'
  | 'CONTENT_DIRECTION'
  | 'CTA'
  | 'FORMAT'
  | 'AUDIENCE'
  | 'VISUAL'
  | 'RETENTION'
  | 'ENGAGEMENT'
  | 'SHAREABILITY'
  | 'CONVERSION'
  | 'DATA_INSUFFICIENT';

export type ActionableConfidenceV1 = 'INSUFFICIENT' | 'LOW' | 'MEDIUM' | 'HIGH';

export type ReviewDecisionV1 = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'DEFERRED';

export type ReviewHistoryEntryV1 = {
  decision: ReviewDecisionV1;
  reviewedAt: string;
  reviewedBy?: string | null;
  userNote?: string | null;
};

export type ActionableRecommendationV1 = PerformanceRecommendationV1 & {
  observation: string;
  evidence: string[];
  interpretation: string;
  recommendedAction: string;
  uncertainty: string;
  category: RecommendationCategoryV1;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  userNote?: string | null;
  reviewHistory?: ReviewHistoryEntryV1[];
};

export type AcceptedPerformanceFeedbackItemV1 = {
  recommendationId: string;
  category: RecommendationCategoryV1 | string;
  recommendedAction: string;
  supportingEvidence: string[];
  sourcePublicationId: string;
  sourceAnalysisId: string;
  reviewedAt: string | null;
};

const TWO_SAMPLE_UNCERTAINTY =
  '当前只有两次人工采样，不能确认变化是由某个具体镜头、文案或 CTA 单独造成。';
const SPARSE_UNCERTAINTY = '当前采样不足，不能据此调整方向。';

type MetricSpec = {
  id: string;
  key: 'playCount' | 'likeCount' | 'commentCount' | 'shareCount' | 'collectCount' | 'followerDelta';
  label: string;
  category: RecommendationCategoryV1;
  targetArea: string;
  interpretation: (grew: boolean) => string;
  action: string;
  allowPercent: boolean;
  targetAgent: PerformanceRecommendationV1['targetAgent'];
};

const METRICS: MetricSpec[] = [
  {
    id: 'rec-views-format',
    key: 'playCount',
    label: '播放量',
    category: 'FORMAT',
    targetArea: 'REACH',
    interpretation: (grew) =>
      grew
        ? '当前样本显示播放量在这一观察窗口内有变化。播放量只描述传播范围，不能当成其他互动指标的原因。'
        : '当前样本显示播放量在这一观察窗口内有记录。播放量只描述传播范围，不能当成其他互动指标的原因。',
    action: '下一条可继续保持清晰的主题包装，便于被发现。不要把播放量变化解释成点赞、评论或分享的原因。',
    allowPercent: true,
    targetAgent: 'CONTENT_PLANNING',
  },
  {
    id: 'rec-likes-engagement',
    key: 'likeCount',
    label: '点赞',
    category: 'ENGAGEMENT',
    targetArea: 'ENGAGEMENT',
    interpretation: (grew) =>
      grew
        ? '当前样本显示点赞在这一观察窗口内继续增加。这不能证明某个镜头或文案造成了点赞。'
        : '当前样本记录了点赞变化。不能把点赞表现直接等同于“值得继续做”。',
    action: '下一条内容可继续测试当前主题和价值表达，观察点赞是否仍随样本增加。不要把这次点赞变化归因到某个镜头或文案。',
    allowPercent: true,
    targetAgent: 'CONTENT_PLANNING',
  },
  {
    id: 'rec-comments-cta',
    key: 'commentCount',
    label: '评论',
    category: 'CTA',
    targetArea: 'CTA',
    interpretation: (grew) =>
      grew
        ? '当前样本显示评论互动在这一观察窗口内继续增加。不能确认由提问式 CTA 导致。'
        : '当前样本记录了评论变化。不能确认由提问式 CTA 导致。',
    action: '下一条内容可继续保留明确提问式 CTA，并测试一个更具体的评论问题，例如让用户回答自己的行业和门店类型。',
    allowPercent: true,
    targetAgent: 'CONTENT_PLANNING',
  },
  {
    id: 'rec-shares-shareability',
    key: 'shareCount',
    label: '分享',
    category: 'SHAREABILITY',
    targetArea: 'SHARING',
    interpretation: (grew) =>
      grew
        ? '当前样本显示分享在这一观察窗口内继续增加。不能断言由某一段内容造成。'
        : '当前样本记录了分享变化。不能断言由某一段内容造成。',
    action: '下一条可尝试增加“方便转发给同行或朋友”的结构，例如结论、对比或可复用提醒。不要断言本次分享一定由某段内容导致。',
    allowPercent: true,
    targetAgent: 'CONTENT_PLANNING',
  },
  {
    id: 'rec-favorites-content',
    key: 'collectCount',
    label: '收藏',
    category: 'CONTENT_DIRECTION',
    targetArea: 'COLLECTION',
    interpretation: (grew) =>
      grew
        ? '当前样本显示收藏在这一观察窗口内继续增加。不能确认来自某一个列表或步骤。'
        : '当前样本记录了收藏变化。不能确认来自某一个列表或步骤。',
    action: '下一条可尝试加入清单、步骤、模板或可保存信息，方便用户收藏回看。不要把当前收藏当成某一个列表造成的结果。',
    allowPercent: true,
    targetAgent: 'CONTENT_PLANNING',
  },
  {
    id: 'rec-followers-audience',
    key: 'followerDelta',
    label: '新增粉丝',
    category: 'AUDIENCE',
    targetArea: 'FOLLOWER_RESPONSE',
    interpretation: (grew) =>
      grew
        ? '当前样本显示新增粉丝有变化。涨粉样本很少，不能据此改账号定位。'
        : '当前样本记录了粉丝变化。样本很少，不能据此改账号定位。',
    action: '可继续强化账号定位与系列化主题，先观察是否稳定。不要根据这一次涨粉改定位。',
    allowPercent: false,
    targetAgent: 'ACCOUNT_POSITIONING',
  },
];

export function sortMetricSnapshots(rows: MetricSnapshotInputV1[]): MetricSnapshotInputV1[] {
  return [...rows].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
}

export function formatCountChange(label: string, prev: number | null | undefined, next: number | null | undefined, allowPercent: boolean): string | null {
  if (typeof prev === 'number' && typeof next === 'number') {
    const delta = next - prev;
    const deltaText = delta > 0 ? `+${delta}` : String(delta);
    const pct = allowPercent ? percentChange(prev, next) : null;
    const change = pct ? `${deltaText} / ${pct}` : deltaText;
    return `${label}从 ${prev} 到 ${next}（${change}）`;
  }
  if (typeof next === 'number') {
    return `当前${label}为 ${next}`;
  }
  return null;
}

export function percentChange(prev: number, next: number): string | null {
  if (prev <= 0) return null;
  const pct = ((next - prev) / prev) * 100;
  if (!Number.isFinite(pct)) return null;
  const rounded = Math.round(pct * 10) / 10;
  if (next - prev > 0) return `+${rounded}%`;
  return `${rounded}%`;
}

export function isAcceptedReviewStatus(status?: string): boolean {
  return status === 'ACCEPTED' || status === 'APPROVED';
}

export function reviewActionToDecision(action: RecommendationReviewAction): ReviewDecisionV1 {
  if (action === 'APPROVE') return 'ACCEPTED';
  if (action === 'REJECT') return 'REJECTED';
  return 'DEFERRED';
}

export function collectAcceptedPerformanceFeedback(input: {
  sourcePublicationId: string;
  sourceAnalysisId: string;
  recommendations: Array<Partial<ActionableRecommendationV1> & { reviewStatus?: string }>;
}): AcceptedPerformanceFeedbackItemV1[] {
  return input.recommendations
    .filter((row) => isAcceptedReviewStatus(row.reviewStatus))
    .map((row) => ({
      recommendationId: row.recommendationId ?? '',
      category: row.category ?? 'ENGAGEMENT',
      recommendedAction: row.recommendedAction ?? row.recommendation ?? '',
      supportingEvidence: Array.isArray(row.evidence)
        ? row.evidence
        : (row.evidenceRefs ?? []).map((item) => item.label).filter(Boolean),
      sourcePublicationId: input.sourcePublicationId,
      sourceAnalysisId: input.sourceAnalysisId,
      reviewedAt: row.reviewedAt ?? null,
    }))
    .filter((row) => row.recommendedAction.trim().length > 0);
}

export function mergePersistedRecommendations(primary: unknown, secondary: unknown): ActionableRecommendationV1[] {
  const first = Array.isArray(primary) ? (primary as ActionableRecommendationV1[]) : [];
  const second = Array.isArray(secondary) ? (secondary as ActionableRecommendationV1[]) : [];
  if (first.length === 0) return second;
  const byId = new Map(second.map((row) => [row.recommendationId, row]));
  return first.map((row) => {
    const other = byId.get(row.recommendationId);
    if (!other) return row;
    const firstAt = row.reviewedAt ? Date.parse(row.reviewedAt) : 0;
    const secondAt = other.reviewedAt ? Date.parse(other.reviewedAt) : 0;
    const newer = Number.isFinite(secondAt) && secondAt >= (Number.isFinite(firstAt) ? firstAt : 0) ? other : row;
    const older = newer === other ? row : other;
    return {
      ...older,
      ...newer,
      reviewHistory: newer.reviewHistory?.length ? newer.reviewHistory : older.reviewHistory,
    };
  });
}

export function applyActionableReview(
  recommendations: ActionableRecommendationV1[],
  recommendationId: string,
  action: RecommendationReviewAction,
  meta: { reviewedBy?: string | null; reviewedAt?: string; userNote?: string | null } = {},
): ActionableRecommendationV1[] {
  const reviewedAt = meta.reviewedAt ?? new Date().toISOString();
  const decision = reviewActionToDecision(action);
  return recommendations.map((row) => {
    if (row.recommendationId !== recommendationId) return row;
    const entry: ReviewHistoryEntryV1 = {
      decision,
      reviewedAt,
      reviewedBy: meta.reviewedBy ?? null,
      userNote: meta.userNote ?? null,
    };
    return {
      ...row,
      reviewStatus: decision,
      reviewedAt,
      reviewedBy: meta.reviewedBy ?? null,
      userNote: meta.userNote ?? null,
      reviewHistory: [...(row.reviewHistory ?? []), entry],
    };
  });
}

export function buildActionableRecommendations(snapshots: MetricSnapshotInputV1[]): ActionableRecommendationV1[] {
  const sorted = sortMetricSnapshots(snapshots);
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : undefined;
  const latest = sorted.at(-1);
  if (!latest) {
    return [insufficientRecommendation(undefined, null, 'empty')];
  }
  if (sorted.length < 2) {
    return [insufficientRecommendation(previous, latest, latest.id)];
  }
  const recs = METRICS.map((spec) => toRecommendation(spec, previous, latest)).filter((row): row is ActionableRecommendationV1 => row != null);
  return recs.length > 0 ? recs : [insufficientRecommendation(previous, latest, latest.id)];
}

function insufficientRecommendation(
  _previous: MetricSnapshotInputV1 | undefined,
  _latest: MetricSnapshotInputV1 | null,
  snapshotId: string,
): ActionableRecommendationV1 {
  return {
    recommendationId: 'rec-data-insufficient',
    targetAgent: 'CONTENT_PLANNING',
    targetArea: 'DATA_INSUFFICIENT',
    recommendation: '继续收集后续数据后再决定是否调整该方向',
    reason: '当前数据还不足以判断',
    evidenceRefs: [{ kind: 'METRIC_SNAPSHOT', id: snapshotId, label: '人工采样不足' }],
    confidence: 'UNKNOWN',
    priority: 'LOW',
    requiresHumanReview: true,
    reviewStatus: 'PENDING',
    observation: '当前数据还不足以判断',
    evidence: ['当前数据不足'],
    interpretation: '现有人工采样还不能支持方向性调整。',
    recommendedAction: '继续收集后续数据后再决定是否调整该方向',
    uncertainty: SPARSE_UNCERTAINTY,
    category: 'DATA_INSUFFICIENT',
  };
}

function toRecommendation(
  spec: MetricSpec,
  previous: MetricSnapshotInputV1 | undefined,
  latest: MetricSnapshotInputV1,
): ActionableRecommendationV1 | null {
  const prev = previous?.[spec.key] ?? null;
  const next = latest[spec.key] ?? null;
  const change = formatCountChange(spec.label, prev, next, spec.allowPercent);
  if (!change) {
    return {
      recommendationId: spec.id,
      targetAgent: spec.targetAgent,
      targetArea: spec.targetArea,
      recommendation: '继续收集后续数据后再决定是否调整该方向',
      reason: '当前数据还不足以判断',
      evidenceRefs: [{ kind: 'METRIC_SNAPSHOT', id: latest.id, label: `${spec.label}暂无数据` }],
      confidence: 'UNKNOWN',
      priority: 'LOW',
      requiresHumanReview: true,
      reviewStatus: 'PENDING',
      observation: '当前数据还不足以判断',
      evidence: [`${spec.label}暂无数据`],
      interpretation: `${spec.label}缺少可比较的人工采样。`,
      recommendedAction: '继续收集后续数据后再决定是否调整该方向',
      uncertainty: SPARSE_UNCERTAINTY,
      category: 'DATA_INSUFFICIENT',
    };
  }
  const grew = typeof prev === 'number' && typeof next === 'number' ? next > prev : false;
  const confidence: ActionableConfidenceV1 = spec.key === 'followerDelta' ? 'LOW' : 'MEDIUM';
  return {
    recommendationId: spec.id,
    targetAgent: spec.targetAgent,
    targetArea: spec.targetArea,
    recommendation: spec.action,
    reason: spec.interpretation(grew),
    evidenceRefs: [
      { kind: 'METRIC_SNAPSHOT', id: previous?.id ?? latest.id, label: change },
      { kind: 'METRIC_SNAPSHOT', id: latest.id, label: spec.label },
    ],
    confidence: confidence === 'MEDIUM' ? 'MEDIUM' : 'LOW',
    priority: spec.key === 'followerDelta' ? 'LOW' : 'MEDIUM',
    requiresHumanReview: true,
    reviewStatus: 'PENDING',
    observation: change,
    evidence: [change],
    interpretation: spec.interpretation(grew),
    recommendedAction: spec.action,
    uncertainty: TWO_SAMPLE_UNCERTAINTY,
    category: spec.category,
  };
}
