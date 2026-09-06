import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { parseModelJson } from './account-positioning.agent.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from './account-positioning.fixture.js';
import {
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
    expect(plain.topics[0].title).toBe('第1天选题1：认知纠偏落地法');
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
