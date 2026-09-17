import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { parseModelJson } from './account-positioning.agent.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from './account-positioning.fixture.js';
import {
  canonicalizePillarName,
  diagnoseContentPlanOutput,
  parseContentPlanningInput,
  stampTopicIds,
  validateContentPlanOutput,
} from './content-planning.agent.js';
import { buildMockCampaignStrategyOutput, buildTestCampaignStrategySnapshot } from './campaign-strategy.fixture.js';
import { buildMockContentPlanOutput } from './content-planning.fixture.js';

const validInput = {
  positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
  planningDays: 7,
  postsPerDay: 1,
  platform: 'douyin',
};

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('expected throw');
  } catch (error) {
    expect((error as { code: string }).code).toBe(code);
  }
}

describe('content.planning input/output', () => {
  it('accepts optional performanceFeedback without changing output validation', () => {
    const parsed = parseContentPlanningInput({
      ...validInput,
      performanceFeedback: {
        version: 'v1',
        generatedAt: '2026-08-10T00:00:00.000Z',
        dataState: 'NONE',
        sampleSize: 0,
        publicationsConsidered: 0,
        dataQuality: { sufficientCount: 0, partialCount: 0, insufficientCount: 0 },
        positiveSignals: [],
        cautionSignals: [],
        dataQualitySignals: [],
        inconsistentPerformance: false,
        avoidOvergeneralization: true,
      },
    });
    expect(parsed.performanceFeedback?.dataState).toBe('NONE');
    expect(parseContentPlanningInput(validInput).performanceFeedback).toBeUndefined();
  });

  it('accepts acceptedPerformanceFeedback as optional planning reference', () => {
    const parsed = parseContentPlanningInput({
      ...validInput,
      acceptedPerformanceFeedback: [
        {
          recommendationId: 'rec-comments-cta',
          category: 'CTA',
          recommendedAction: '下一条测试更具体的评论问题',
          supportingEvidence: ['评论从 10 到 12（+2 / +20%）'],
          sourcePublicationId: '01a0a54e-5f54-78c1-a558-76a8d5fcf686',
          sourceAnalysisId: 'analysis-1',
          reviewedAt: '2026-09-15T15:00:00.000Z',
        },
      ],
    });
    expect(parsed.acceptedPerformanceFeedback).toHaveLength(1);
    expect(parsed.acceptedPerformanceFeedback?.[0]?.recommendationId).toBe('rec-comments-cta');
    expect(parseContentPlanningInput(validInput).acceptedPerformanceFeedback).toBeUndefined();
  });

  it('accepts optional learningContext without changing output keys', () => {
    const parsed = parseContentPlanningInput({
      ...validInput,
      learningContext: {
        confirmed: [{ key: 'PERFORMANCE_METRIC:HIGH_LIKE_RATE', summary: '多次支持', supportCount: 2, status: 'confirmed' }],
        candidate: [],
      },
    });
    expect(parsed.learningContext?.confirmed[0]?.supportCount).toBe(2);
    const withBatch = parseContentPlanningInput({
      ...validInput,
      learningContext: {
        confirmed: [{ key: 'PERFORMANCE_METRIC:HIGH_LIKE_RATE', summary: '多次支持', supportCount: 2, status: 'confirmed' }],
        candidate: [{ key: 'PERFORMANCE_METRIC:HIGH_SHARE_RATE', summary: '单次迹象', supportCount: 1, status: 'candidate' }],
        latestRecommendations: [{ actionLabel: '下一批适当增加类似内容', rationale: '已有多次独立发布数据支持' }],
        previousBatchSummary: { planId: 'plan-1', title: '本批计划', sampleSize: 2, publicationsConsidered: 2 },
      },
    });
    expect(withBatch.learningContext?.confirmed).toHaveLength(1);
    expect(withBatch.learningContext?.candidate).toHaveLength(1);
    expect(withBatch.learningContext?.latestRecommendations?.[0]?.actionLabel).toContain('增加');
    expect(withBatch.learningContext?.previousBatchSummary?.sampleSize).toBe(2);
    const output = validateContentPlanOutput(buildMockContentPlanOutput(), {
      planningDays: 7,
      postsPerDay: 1,
      pillarNames: buildMockContentPlanOutput().pillarAllocation.map((item) => item.pillarName),
    });
    expect(output).not.toHaveProperty('learningContext');
  });

  it('rejects planningDays other than 7', () => {
    expectCode(
      () => parseContentPlanningInput({ ...validInput, planningDays: 14 }),
      ErrorCode.CONTENT_PLAN_DAYS_NOT_AVAILABLE,
    );
  });

  it('rejects postsPerDay 0 and greater than 5', () => {
    expectCode(
      () => parseContentPlanningInput({ ...validInput, postsPerDay: 0 }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
    expectCode(
      () => parseContentPlanningInput({ ...validInput, postsPerDay: 6 }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
  });

  it('keeps strategyId optional and leaves the old input contract intact', () => {
    const parsed = parseContentPlanningInput(validInput);
    expect(parsed.strategyId).toBeUndefined();
    expect(parsed.campaignStrategy).toBeUndefined();
    expect(parsed.trendData).toBeUndefined();
    const withId = parseContentPlanningInput({
      ...validInput,
      strategyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(withId.strategyId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(withId.campaignStrategy).toBeUndefined();
  });

  it('keeps mock topics unchanged without strategy and reflects payload guidance with strategy', () => {
    const plain = buildMockContentPlanOutput({ planningDays: 7, postsPerDay: 1 });
    expect(plain.topics[0].title).toBe('本批第1条：认知纠偏落地法');
    expect(plain.topics[0].contentPillar).toBe('认知纠偏');
    expect(Object.keys(plain.topics[0]).sort()).toEqual(
      [
        'id',
        'dayIndex',
        'title',
        'hook',
        'contentPillar',
        'targetAudience',
        'painPoint',
        'contentAngle',
        'format',
        'estimatedDuration',
        'priority',
        'reason',
        'keywords',
        'cta',
        'status',
        'scheduledDate',
      ].sort(),
    );

    const snapshot = buildTestCampaignStrategySnapshot();
    const payload = buildMockCampaignStrategyOutput(snapshot);
    payload.contentPillars = [
      {
        name: '样本验证支柱',
        purpose: '验证策略方向',
        priority: 'high',
        evidenceBasis: [{ type: 'PRODUCT_BRIEF', ref: 'productName' }],
      },
    ];
    payload.creativeAngles = [
      {
        angle: '样本验证角度',
        rationale: '用于测试 mock 动态读取',
        evidenceBasis: [{ type: 'PRODUCT_BRIEF', ref: 'productName' }],
      },
    ];
    const withStrategy = buildMockContentPlanOutput({
      planningDays: 7,
      postsPerDay: 1,
      campaignStrategy: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        version: 1,
        status: 'READY',
        payload,
      },
    });
    expect(withStrategy.topics[0].title).toContain('样本验证支柱');
    expect(withStrategy.topics[0].contentAngle).toContain('样本验证支柱');
    expect(withStrategy.topics[0].reason).toContain('样本验证支柱');
    expect(withStrategy.topics[0].contentPillar).toBe('认知纠偏');
    expect(withStrategy.topics).toHaveLength(7);
    expect(withStrategy).not.toHaveProperty('campaignStrategy');
  });

  it('accepts compact campaignStrategy and rejects raw strategy snapshots', () => {
    const snapshot = buildTestCampaignStrategySnapshot();
    const compact = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      version: 1,
      status: 'READY' as const,
      payload: buildMockCampaignStrategyOutput(snapshot),
    };
    const parsed = parseContentPlanningInput({ ...validInput, strategyId: compact.id, campaignStrategy: compact });
    expect(parsed.campaignStrategy?.id).toBe(compact.id);
    expect(parsed.campaignStrategy).not.toHaveProperty('inputSnapshot');
    expectCode(
      () =>
        parseContentPlanningInput({
          ...validInput,
          campaignStrategy: { ...compact, inputSnapshot: snapshot },
        }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
    expectCode(
      () =>
        parseContentPlanningInput({
          ...validInput,
          campaignStrategy: { ...compact, marketEvidence: [] },
        }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
    expectCode(
      () =>
        parseContentPlanningInput({
          ...validInput,
          campaignStrategy: { ...compact, status: 'ARCHIVED' },
        }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
    expectCode(
      () =>
        parseContentPlanningInput({
          ...validInput,
          campaignStrategy: { ...compact, sourceAgentRunId: compact.id },
        }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
  });

  it('rejects client-forged context ids', () => {
    expectCode(
      () => parseContentPlanningInput({ ...validInput, tenantId: 't' }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
    expectCode(
      () => parseContentPlanningInput({ ...validInput, workspaceId: 'w' }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
    expectCode(
      () => parseContentPlanningInput({ ...validInput, userId: 'u' }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
  });

  it('rejects invalid positioning schema', () => {
    expectCode(
      () => parseContentPlanningInput({ ...validInput, positioning: { accountPositioning: 'x' } }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
  });

  it('validates output and caps at 35 topics', () => {
    const max = buildMockContentPlanOutput({ planningDays: 7, postsPerDay: 5 });
    expect(max.topics).toHaveLength(35);
    const validated = validateContentPlanOutput(max, {
      planningDays: 7,
      postsPerDay: 5,
      pillarNames: MOCK_ACCOUNT_POSITIONING_OUTPUT.contentPillars.map((item) => item.name),
    });
    expect(validated.topics).toHaveLength(35);
    const stamped = stampTopicIds(validated.topics);
    expect(stamped.every((topic) => topic.id.includes('-'))).toBe(true);
    expect(stamped[0].id).not.toBe(validated.topics[0].id);
  });

  it('canonicalizes unambiguous abbreviated pillars, numeric strings, and Chinese priority', () => {
    const mock = buildMockContentPlanOutput();
    const expected = {
      planningDays: 7,
      postsPerDay: 1,
      pillarNames: MOCK_ACCOUNT_POSITIONING_OUTPUT.contentPillars.map((item) => item.name),
    };
    const coerced = {
      ...mock,
      usedTrendData: 'false',
      pillarAllocation: mock.pillarAllocation.map((row) => ({
        ...row,
        pillarName: row.pillarName.slice(0, 2),
        percentage: String(row.percentage),
        topicCount: String(row.topicCount),
      })),
      topics: mock.topics.map((topic, index) => ({
        ...topic,
        dayIndex: String(topic.dayIndex),
        priority: index === 0 ? '高' : index === 1 ? '中' : '低',
        contentPillar: topic.contentPillar.slice(0, 2),
      })),
    };
    const validated = validateContentPlanOutput(coerced, expected);
    expect(validated.topics.every((topic) => expected.pillarNames.includes(topic.contentPillar))).toBe(true);
    expect(validated.topics[0].dayIndex).toBe(1);
    expect(validated.topics[0].priority).toBe('high');
    expect(validated.usedTrendData).toBe(false);
    const withLooseTypes = validateContentPlanOutput(
      {
        ...mock,
        topics: mock.topics.map((topic, index) => ({
          ...topic,
          keywords: '职场新人,清单',
          estimatedDuration: 45,
          scheduledDate: index === 0 ? '2026-09-15T08:00:00.000Z' : '本周五',
          targetAudience: { description: topic.targetAudience },
        })),
      },
      expected,
    );
    expect(withLooseTypes.topics[0].keywords).toEqual(['职场新人', '清单']);
    expect(withLooseTypes.topics[0].estimatedDuration).toBe('45');
    expect(withLooseTypes.topics[0].scheduledDate).toBe('2026-09-15');
    expect(withLooseTypes.topics[1].scheduledDate).toBeUndefined();
    expect(canonicalizePillarName('认知', expected.pillarNames)).toBe('认知纠偏');
    expect(canonicalizePillarName('新支柱', expected.pillarNames)).toBeNull();
    expect(diagnoseContentPlanOutput({ title: 'only' }, expected)).toBe('MISSING_FIELD:summary');
  });

  it('still rejects invented pillars and wrong topic counts', () => {
    const mock = buildMockContentPlanOutput();
    const expected = {
      planningDays: 7,
      postsPerDay: 1,
      pillarNames: MOCK_ACCOUNT_POSITIONING_OUTPUT.contentPillars.map((item) => item.name),
    };
    expectCode(
      () =>
        validateContentPlanOutput(
          {
            ...mock,
            topics: mock.topics.map((topic) => ({ ...topic, contentPillar: '全新支柱' })),
          },
          expected,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expect(diagnoseContentPlanOutput({ ...mock, topics: mock.topics.slice(0, 3) }, expected)).toBe(
      'TOPIC_COUNT:3!=7',
    );
  });

  it('rejects non-JSON and schema-invalid output', () => {
    expectCode(() => parseModelJson('not-json'), ErrorCode.AGENT_INVALID_OUTPUT);
    expectCode(
      () =>
        validateContentPlanOutput({ title: 'only' }, {
          planningDays: 7,
          postsPerDay: 1,
          pillarNames: ['认知纠偏'],
        }),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
  });
});
