import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { validateCampaignStrategyOutput } from '../../campaign/campaign-strategy.validation.js';
import { parseCampaignStrategyInput } from './campaign-strategy.agent.js';
import {
  buildMockCampaignStrategyOutput,
  buildTestCampaignStrategySnapshot,
  limitedInsightPayload,
  usablePerformanceFeedback,
} from './campaign-strategy.fixture.js';

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('expected throw');
  } catch (error) {
    expect((error as { code: string }).code).toBe(code);
  }
}

describe('campaign.strategy:v1 contract', () => {
  it('parses composed snapshot and rejects raw evidence or extra keys', () => {
    const snapshot = buildTestCampaignStrategySnapshot();
    expect(parseCampaignStrategyInput(snapshot).inputPriority[0]).toBe('USER_GOAL');
    expectCode(
      () => parseCampaignStrategyInput({ ...snapshot, marketEvidence: [] }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
    expectCode(
      () => parseCampaignStrategyInput({ ...snapshot, providerMetadata: {} }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
  });

  it('grounds market, performance, brief, positioning and user goal refs', () => {
    const snapshot = buildTestCampaignStrategySnapshot({
      marketInsight: {
        id: '55555555-5555-5555-5555-555555555555',
        version: 1,
        marketResearchId: '33333333-3333-3333-3333-333333333333',
        productBriefId: '11111111-1111-1111-1111-111111111111',
        productBriefVersion: 1,
        payload: limitedInsightPayload(),
      },
      performanceFeedback: usablePerformanceFeedback(),
      flags: [],
      dataState: {
        market: 'LIMITED',
        performance: 'USABLE',
        positioning: 'AVAILABLE',
        productBrief: 'AVAILABLE',
        overall: 'LIMITED',
      },
      confidenceCeiling: 'MEDIUM',
    });
    const valid = buildMockCampaignStrategyOutput(snapshot);
    expect(validateCampaignStrategyOutput(valid, snapshot).creativeAngles[0].evidenceBasis[0].type).toBe(
      'PRODUCT_BRIEF',
    );
    expectCode(
      () =>
        validateCampaignStrategyOutput(
          {
            ...valid,
            creativeAngles: [
              { angle: 'a', rationale: 'b', evidenceBasis: [{ type: 'MARKET_INSIGHT', ref: 'EVIDENCE_RAW' }] },
            ],
          },
          snapshot,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () =>
        validateCampaignStrategyOutput(
          {
            ...valid,
            testingStrategy: {
              ...valid.testingStrategy,
              hypotheses: [
                { hypothesis: 'x', evidenceBasis: [{ type: 'PERFORMANCE_FEEDBACK', ref: 'NOT_A_SIGNAL' }] },
              ],
            },
          },
          snapshot,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () =>
        validateCampaignStrategyOutput(
          {
            ...valid,
            valuePropositions: [
              { proposition: 'x', priority: 'high', evidenceBasis: [{ type: 'PRODUCT_BRIEF', ref: 'unknownField' }] },
            ],
          },
          snapshot,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () =>
        validateCampaignStrategyOutput(
          {
            ...valid,
            contentPillars: [
              {
                name: 'x',
                purpose: 'y',
                priority: 'high',
                evidenceBasis: [{ type: 'ACCOUNT_POSITIONING', ref: 'notAKey' }],
              },
            ],
          },
          snapshot,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    const noGoal = buildTestCampaignStrategySnapshot({ currentUserGoal: null, flags: ['NO_MARKET_INSIGHT', 'NO_PERFORMANCE_HISTORY'] });
    const noGoalOutput = buildMockCampaignStrategyOutput(noGoal);
    expectCode(
      () =>
        validateCampaignStrategyOutput(
          {
            ...noGoalOutput,
            valuePropositions: [
              { proposition: 'x', priority: 'high', evidenceBasis: [{ type: 'USER_GOAL', ref: 'userGoal' }] },
            ],
          },
          noGoal,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
  });

  it('blocks confidence above ceiling and HIGH on LIMITED overall', () => {
    const low = buildTestCampaignStrategySnapshot();
    const lowOut = buildMockCampaignStrategyOutput(low);
    expectCode(() => validateCampaignStrategyOutput({ ...lowOut, confidence: 'MEDIUM' }, low), ErrorCode.AGENT_INVALID_OUTPUT);
    const medium = buildTestCampaignStrategySnapshot({
      confidenceCeiling: 'MEDIUM',
      flags: ['NO_MARKET_INSIGHT', 'NO_PERFORMANCE_HISTORY'],
    });
    const mediumOut = buildMockCampaignStrategyOutput(medium);
    expect(validateCampaignStrategyOutput({ ...mediumOut, confidence: 'LOW' }, medium).confidence).toBe('LOW');
    expectCode(
      () => validateCampaignStrategyOutput({ ...mediumOut, confidence: 'HIGH' }, medium),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
  });

  it('rejects platform-wide, growth, blue-ocean and guaranteed claims', () => {
    const snapshot = buildTestCampaignStrategySnapshot();
    const valid = buildMockCampaignStrategyOutput(snapshot);
    for (const text of ['整个抖音都在涨', '正在快速增长', '这是蓝海', '保证转化']) {
      expectCode(
        () => validateCampaignStrategyOutput({ ...valid, objective: { ...valid.objective, primaryObjective: text } }, snapshot),
        ErrorCode.AGENT_INVALID_OUTPUT,
      );
    }
  });

  it('allows no-market and no-performance strategies with required limitations', () => {
    const snapshot = buildTestCampaignStrategySnapshot();
    const output = validateCampaignStrategyOutput(buildMockCampaignStrategyOutput(snapshot), snapshot);
    expect(output.confidence).toBe('LOW');
    expect(output.dataLimitations).toEqual(
      expect.arrayContaining(['NO_MARKET_INSIGHT', 'NO_PERFORMANCE_HISTORY']),
    );
    expectCode(
      () =>
        validateCampaignStrategyOutput(
          { ...output, objective: { ...output.objective, primaryObjective: '根据市场数据应该加预算' } },
          snapshot,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () =>
        validateCampaignStrategyOutput(
          { ...output, risks: [{ risk: '历史表现表明这个 CTA 最好' }] },
          snapshot,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
  });

  it('does not let LIMITED market become HIGH even if model asks for it', () => {
    const snapshot = buildTestCampaignStrategySnapshot({
      marketInsight: {
        id: '55555555-5555-5555-5555-555555555555',
        version: 1,
        marketResearchId: '33333333-3333-3333-3333-333333333333',
        productBriefId: '11111111-1111-1111-1111-111111111111',
        productBriefVersion: 1,
        payload: { ...limitedInsightPayload(), marketState: 'LIMITED_SIGNAL', confidence: 'HIGH' },
      },
      performanceFeedback: usablePerformanceFeedback(),
      flags: [],
      confidenceCeiling: 'MEDIUM',
      dataState: {
        market: 'LIMITED',
        performance: 'USABLE',
        positioning: 'AVAILABLE',
        productBrief: 'AVAILABLE',
        overall: 'LIMITED',
      },
    });
    const output = buildMockCampaignStrategyOutput(snapshot);
    expect(output.confidence).not.toBe('HIGH');
    expectCode(
      () => validateCampaignStrategyOutput({ ...output, confidence: 'HIGH' }, snapshot),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
  });
});
