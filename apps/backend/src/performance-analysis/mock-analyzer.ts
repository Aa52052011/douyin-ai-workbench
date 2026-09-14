import { createHash } from 'node:crypto';
import type { PerformanceFindingV1, PerformanceRecommendationV1, RetentionAvailabilityV1 } from './performance-analysis.types.js';
import type { PerformanceMetricsSummaryV1 } from './metrics-calculator.js';
import { dataSufficiencyFromCount } from './metrics-calculator.js';

const FORBIDDEN_CLAIMS = [
  '高于平均',
  '低于行业',
  '高于行业',
  '完播率',
  '平均观看时长',
  '一定能爆',
  '一定涨粉',
  'CONFIRMED_CAUSE',
];

const FORBIDDEN_DIRECTOR = ['Ken Burns', '微抖', 'rejected AI poster', '泛广告'];

export const RETENTION_NOT_AVAILABLE: RetentionAvailabilityV1 = {
  retentionCurve: 'NOT_AVAILABLE',
  completionRate: 'NOT_AVAILABLE',
  averageWatchTime: 'NOT_AVAILABLE',
  retention2s: 'NOT_AVAILABLE',
  retention5s: 'NOT_AVAILABLE',
};

export function assertNoForbiddenClaims(text: string): void {
  for (const phrase of FORBIDDEN_CLAIMS) {
    if (text.includes(phrase)) {
      throw new Error(`FORBIDDEN_CLAIM:${phrase}`);
    }
  }
}

export function assertNoForbiddenDirectorAdvice(text: string): void {
  for (const phrase of FORBIDDEN_DIRECTOR) {
    if (text.includes(phrase)) {
      throw new Error(`FORBIDDEN_DIRECTOR:${phrase}`);
    }
  }
}

export function assertNoCredentials(text: string): void {
  const lower = text.toLowerCase();
  for (const token of ['client_secret', 'clientsecret', 'access_token', 'accesstoken', 'bearer ', 'credentialref']) {
    if (lower.includes(token)) {
      throw new Error('CREDENTIAL_IN_PROMPT');
    }
  }
}

export function mockPerformanceAnalysisV1(input: {
  publishedPostId: string;
  metrics: PerformanceMetricsSummaryV1;
  scriptTitle?: string | null;
  contentPlanTitle?: string | null;
  comparablePostCount: number;
  fixture?: boolean;
}): {
  findings: PerformanceFindingV1[];
  recommendations: PerformanceRecommendationV1[];
  benchmarkContext: 'NONE' | 'LIMITED';
  dataSufficiency: ReturnType<typeof dataSufficiencyFromCount>;
  retention: RetentionAvailabilityV1;
  positioningAdvice: 'KEEP_POSITIONING';
  llmInvoked: false;
  fixture: boolean;
} {
  const findings: PerformanceFindingV1[] = [];
  const latestSnap: { kind: 'DERIVED_METRIC'; id: string; label: string } = {
    kind: 'DERIVED_METRIC',
    id: 'latest-metrics',
    label: '最新用户录入指标',
  };
  if (input.metrics.latestPlayCount != null) {
    findings.push({
      findingId: 'reach-observed',
      dimension: 'REACH',
      type: 'OBSERVATION',
      statement: `用户录入的最新播放为 ${input.metrics.latestPlayCount}。这是对触达规模的描述，不等于内容质量高低。`,
      evidenceRefs: [latestSnap],
      confidence: 'MEDIUM',
      causalityLevel: 'OBSERVED',
      attributionConfidence: 'UNKNOWN',
      insufficientEvidence: input.metrics.snapshotCount < 2,
    });
  }
  if (input.metrics.latestLikeCount != null || input.metrics.latestCommentCount != null || input.metrics.latestShareCount != null || input.metrics.latestCollectCount != null) {
    findings.push({
      findingId: 'engagement-observed',
      dimension: 'ENGAGEMENT',
      type: 'OBSERVATION',
      statement: '互动指标来自用户录入，不是抖音官方核验数据。播放高/低都不能单独证明内容质量。',
      evidenceRefs: [latestSnap],
      confidence: 'LOW',
      causalityLevel: 'OBSERVED',
      attributionConfidence: 'UNKNOWN',
      insufficientEvidence: true,
    });
  }
  findings.push({
    findingId: 'script-hook-hypothesis',
    dimension: 'SCRIPT_HOOK',
    type: 'HYPOTHESIS',
    statement: '单条全局指标不能精确推断某一秒脚本一定有效。开头信息密度是否过高，只是待验证假设。',
    evidenceRefs: [{ kind: 'SCRIPT_SECTION', id: 'hook', label: input.scriptTitle ?? 'frozen-script-hook' }],
    confidence: 'UNKNOWN',
    causalityLevel: 'HYPOTHESIS',
    attributionConfidence: 'LOW',
    insufficientEvidence: true,
    recommendedAction: '下一条可测试更低的首5秒概念数量',
  });
  findings.push({
    findingId: 'cta-hypothesis',
    dimension: 'CTA',
    type: 'HYPOTHESIS',
    statement: '若评论很少，可能与 CTA 提问不够明确有关，需要对照实验才能验证。',
    evidenceRefs: [latestSnap],
    confidence: 'LOW',
    causalityLevel: 'PLAUSIBLE',
    attributionConfidence: 'LOW',
    insufficientEvidence: true,
  });

  const recommendations: PerformanceRecommendationV1[] = [
    {
      recommendationId: 'keep-workbench-visual',
      targetAgent: 'DIRECTOR',
      targetArea: 'VISUAL_EXECUTION',
      recommendation: '下一条继续保持真实工作台视觉，不要恢复微动效或被否的 AI 海报。',
      reason: '现有冻结视觉政策优先；单条数据不能推翻 UI_DEMO_STABILITY_FIRST。',
      evidenceRefs: [{ kind: 'ARTIFACT_METADATA', id: 'accepted-vertical', label: 'accepted artifact' }],
      confidence: 'MEDIUM',
      priority: 'MEDIUM',
      requiresHumanReview: true,
      reviewStatus: 'PENDING',
    },
    {
      recommendationId: 'test-hook-density',
      targetAgent: 'SCRIPT_GENERATION',
      targetArea: 'SCRIPT_HOOK',
      recommendation: '开头信息密度可能偏高，下一条可测试降低首5秒概念数量。',
      reason: '镜头级归因置信度为 LOW；这是待验证假设。',
      evidenceRefs: [{ kind: 'SCRIPT_SECTION', id: 'hook', label: 'script hook' }],
      confidence: 'LOW',
      priority: 'MEDIUM',
      requiresHumanReview: true,
      reviewStatus: 'PENDING',
    },
    {
      recommendationId: 'test-question-cta',
      targetAgent: 'CONTENT_PLANNING',
      targetArea: 'CTA',
      recommendation: 'CTA 互动可能偏弱，可测试更明确的问题式 CTA。',
      reason: '缺少对照样本，不得把账号定位整段改掉。',
      evidenceRefs: [latestSnap],
      confidence: 'LOW',
      priority: 'LOW',
      requiresHumanReview: true,
      reviewStatus: 'PENDING',
    },
    {
      recommendationId: 'keep-positioning',
      targetAgent: 'ACCOUNT_POSITIONING',
      targetArea: 'ACCOUNT_POSITIONING_ALIGNMENT',
      recommendation: '单条作品默认保持账号定位，先测试内容变量。',
      reason: 'KEEP_POSITIONING + TEST_CONTENT_VARIABLES_FIRST',
      evidenceRefs: [{ kind: 'PUBLICATION_METADATA', id: input.publishedPostId, label: 'single published post' }],
      confidence: 'MEDIUM',
      priority: 'LOW',
      requiresHumanReview: true,
      reviewStatus: 'PENDING',
    },
  ];

  const packed = JSON.stringify({ findings, recommendations });
  assertNoForbiddenClaims(packed);
  assertNoForbiddenDirectorAdvice(packed);
  assertNoCredentials(packed);

  return {
    findings,
    recommendations,
    benchmarkContext: input.comparablePostCount > 0 ? 'LIMITED' : 'NONE',
    dataSufficiency: dataSufficiencyFromCount(input.metrics.snapshotCount),
    retention: RETENTION_NOT_AVAILABLE,
    positioningAdvice: 'KEEP_POSITIONING',
    llmInvoked: false,
    fixture: Boolean(input.fixture),
  };
}

export function hashAnalysisInput(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}
