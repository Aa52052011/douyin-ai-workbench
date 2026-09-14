import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { PromptRegistry } from '../agents/prompts/prompt.registry.js';
import { AgentRegistry } from '../agents/agent.registry.js';
import { sameTenantRequired } from '../monitoring/publication-strategy.js';
import {
  activeFrozenConstraintCount,
  productionConstraintRegistry,
  v1ProductStrategyConstraintRegistry,
} from '../production-v2/global-director/production-constraints.js';
import { calculatePerformanceMetricsV1 } from './metrics-calculator.js';
import { assertNoCredentials, mockPerformanceAnalysisV1 } from './mock-analyzer.js';
import {
  applyRecommendationReview,
  assertFindingEvidencePolicy,
  buildNextContentPlanningFeedback,
  feedbackStatusFromRecommendations,
  neverMutateContentPlan,
  renderPerformanceAnalysisPromptVars,
  requireMetricsOrThrow,
  runDeterministicPerformanceAnalysis,
  type PerformanceAnalysisInputV1,
} from './performance-analysis.engine.js';

const fixtureMetrics = calculatePerformanceMetricsV1({
  snapshots: [
    {
      id: 's1',
      publishedPostId: 'post-1',
      capturedAt: '2026-09-14T00:00:00.000Z',
      source: 'MANUAL_ENTRY',
      playCount: 12,
      likeCount: 2,
      commentCount: 0,
      shareCount: 0,
      collectCount: 1,
      followerDelta: 0,
      fixture: true,
    },
  ],
  publishedPostId: 'post-1',
  window: 'LATEST_ONLY',
});

function sampleInput(overrides: Partial<PerformanceAnalysisInputV1> = {}): PerformanceAnalysisInputV1 {
  return {
    schemaVersion: 'performance.analysis-input:v1',
    tenantId: 't1',
    workspaceId: 'w1',
    projectId: 'p1',
    publishedPostId: 'post-1',
    contentPlanSnapshot: { title: 'plan' },
    scriptSnapshot: { title: 'script' },
    artifactSnapshot: { artifactId: 'art' },
    publicationSnapshot: { id: 'post-1' },
    metricsSnapshots: [
      {
        id: 's1',
        publishedPostId: 'post-1',
        capturedAt: '2026-09-14T00:00:00.000Z',
        source: 'MANUAL_ENTRY',
        playCount: 12,
        likeCount: 2,
        commentCount: 0,
        shareCount: 0,
        collectCount: 1,
        followerDelta: 0,
        fixture: true,
      },
    ],
    analysisWindow: 'LATEST_ONLY',
    previousComparablePosts: [],
    ...overrides,
  };
}

describe('performance.analysis:v1 engine', () => {
  it('no metrics -> no analysis and no LLM', () => {
    const llm = { current: false };
    try {
      requireMetricsOrThrow([], llm);
      throw new Error('expected');
    } catch (error) {
      expect((error as AppError).code).toBe(ErrorCode.INSUFFICIENT_METRICS);
      expect(llm.current).toBe(false);
    }
    expect(() => runDeterministicPerformanceAnalysis(sampleInput({ metricsSnapshots: [] }))).toThrow(AppError);
  });

  it('no benchmark -> no average claim', () => {
    const mock = mockPerformanceAnalysisV1({
      publishedPostId: 'post-1',
      metrics: fixtureMetrics,
      comparablePostCount: 0,
      fixture: true,
    });
    expect(mock.benchmarkContext).toBe('NONE');
    const text = JSON.stringify(mock);
    expect(text.includes('高于平均')).toBe(false);
    expect(text.includes('低于行业')).toBe(false);
  });

  it('no retention -> no retention claim', () => {
    const mock = mockPerformanceAnalysisV1({
      publishedPostId: 'post-1',
      metrics: fixtureMetrics,
      comparablePostCount: 0,
      fixture: true,
    });
    expect(mock.retention.completionRate).toBe('NOT_AVAILABLE');
    expect(JSON.stringify(mock).includes('完播率')).toBe(false);
  });

  it('single post cannot confirm causality', () => {
    const out = runDeterministicPerformanceAnalysis(sampleInput());
    expect(out.findings.some((f) => f.causalityLevel === 'HYPOTHESIS' || f.causalityLevel === 'OBSERVED')).toBe(true);
    expect(JSON.stringify(out).includes('CONFIRMED_CAUSE')).toBe(false);
    expect(out.llmInvoked).toBe(false);
  });

  it('findings require evidence except hypothesis/insufficient', () => {
    const out = runDeterministicPerformanceAnalysis(sampleInput());
    assertFindingEvidencePolicy(out.findings);
    expect(out.findings.every((f) => f.type === 'HYPOTHESIS' || f.evidenceRefs.length > 0)).toBe(true);
  });

  it('hypothesis remains uncertain', () => {
    const hypo = runDeterministicPerformanceAnalysis(sampleInput()).findings.find((f) => f.type === 'HYPOTHESIS');
    expect(hypo?.insufficientEvidence).toBe(true);
    expect(hypo?.causalityLevel).toBe('HYPOTHESIS');
  });

  it('recommendations require human review and evidence refs', () => {
    const out = runDeterministicPerformanceAnalysis(sampleInput());
    expect(out.recommendations.every((r) => r.requiresHumanReview === true)).toBe(true);
    expect(out.recommendations.every((r) => r.evidenceRefs.length > 0)).toBe(true);
    const reviewed = applyRecommendationReview(out.recommendations, out.recommendations[0].recommendationId, 'APPROVE');
    expect(feedbackStatusFromRecommendations(reviewed)).not.toBe('GENERATED');
  });

  it('does not auto-mutate content plans', () => {
    const plan = { title: 'frozen' };
    neverMutateContentPlan(plan, { ...plan });
    expect(() => neverMutateContentPlan(plan, { title: 'mutated' })).toThrow('AUTO_PLAN_MUTATION_FORBIDDEN');
    const handoff = buildNextContentPlanningFeedback({
      analysisId: 'a1',
      publishedPostId: 'post-1',
      feedbackCycleId: 'c1',
      recommendations: [],
    });
    expect(handoff.schemaVersion).toBe('next.content-planning-feedback:v1');
  });

  it('preserves analysis history conceptually via distinct hashes', () => {
    const a = runDeterministicPerformanceAnalysis(sampleInput());
    const b = runDeterministicPerformanceAnalysis(
      sampleInput({
        metricsSnapshots: [
          ...sampleInput().metricsSnapshots,
          {
            id: 's2',
            publishedPostId: 'post-1',
            capturedAt: '2026-09-14T03:00:00.000Z',
            source: 'MANUAL_ENTRY',
            playCount: 30,
            likeCount: 4,
            commentCount: 1,
            shareCount: 0,
            collectCount: 1,
            followerDelta: 1,
            fixture: true,
          },
        ],
      }),
    );
    expect(a.inputSnapshotHash).not.toBe(b.inputSnapshotHash);
  });

  it('isolates tenants at the publication strategy layer', () => {
    expect(sameTenantRequired('t1', 't2')).toBe(false);
    expect(sameTenantRequired('t1', 't1')).toBe(true);
  });

  it('keeps credentials out of the prompt template', () => {
    const registry = new PromptRegistry();
    const rendered = registry.render('performance.analysis', 'v1', {
      metricsSummary: '{}',
      dataSufficiency: 'SPARSE',
      benchmarkContext: 'NONE',
      evidenceIndex: '[]',
      scriptSnapshot: '{}',
      contentPlanSnapshot: '{}',
      publicationSnapshot: '{}',
    });
    expect(rendered.systemPrompt.toLowerCase()).not.toContain('bearer ');
    expect(rendered.userPrompt.toLowerCase()).not.toContain('access_token');
    expect(rendered.userPrompt.toLowerCase()).not.toContain('client_secret');
    const vars = renderPerformanceAnalysisPromptVars({
      metricsSummary: fixtureMetrics,
      dataSufficiency: 'SPARSE',
      benchmarkContext: 'NONE',
      evidenceIndex: [],
      scriptSnapshot: { title: 's' },
      contentPlanSnapshot: { title: 'p' },
      publicationSnapshot: { id: 'post-1' },
    });
    assertNoCredentials(JSON.stringify(vars));
  });

  it('preserves C6 and cumulative constraints', () => {
    expect(productionConstraintRegistry().constraints).toHaveLength(24);
    expect(v1ProductStrategyConstraintRegistry().constraints.map((c) => c.constraintId)).toEqual([
      'Y',
      'Z',
      'AA',
      'AB',
      'AC',
      'AD',
      'AE',
      'AF',
    ]);
    expect(activeFrozenConstraintCount()).toBe(32);
    const out = runDeterministicPerformanceAnalysis(sampleInput());
    expect(out.confidenceSummary.c6).toBe('RESTRICTED');
    expect(JSON.stringify(out).includes('一定能爆')).toBe(false);
  });

  it('registers the agent', () => {
    expect(new AgentRegistry().get('performance.analysis', 'v1').id).toBe('performance.analysis');
  });
});
