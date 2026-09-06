import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors/app-error.js';
import {
  buildMockCampaignStrategyOutput,
  buildTestCampaignStrategySnapshot,
  limitedInsightPayload,
} from '../agents/definitions/campaign-strategy.fixture.js';
import {
  looksLikeRawSnapshotId,
  validateCampaignStrategyEvidenceBasis,
  validateCampaignStrategyOutput,
} from './campaign-strategy.validation.js';

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('expected throw');
  } catch (error) {
    expect((error as { code: string }).code).toBe(code);
  }
}

describe('campaign strategy validation', () => {
  it('accepts mock output and valid evidenceBasis', () => {
    const snapshot = buildTestCampaignStrategySnapshot();
    expect(validateCampaignStrategyOutput(buildMockCampaignStrategyOutput(snapshot), snapshot).version).toBe('v1');
    expect(
      validateCampaignStrategyEvidenceBasis({
        type: 'MARKET_INSIGHT',
        ref: 'HIGH_VOLUME_SIGNAL_KEYWORDS',
        note: 'sample only',
      }),
    ).toEqual({
      type: 'MARKET_INSIGHT',
      ref: 'HIGH_VOLUME_SIGNAL_KEYWORDS',
      note: 'sample only',
    });
  });

  it('rejects forbidden fields, extra keys, leakage and raw snapshot refs', () => {
    const snapshot = buildTestCampaignStrategySnapshot();
    const valid = buildMockCampaignStrategyOutput(snapshot);
    expectCode(() => validateCampaignStrategyOutput({ ...valid, token: 'secret' }, snapshot), ErrorCode.AGENT_INVALID_OUTPUT);
    expectCode(() => validateCampaignStrategyOutput({ ...valid, topics: [] }, snapshot), ErrorCode.AGENT_INVALID_OUTPUT);
    expectCode(() => validateCampaignStrategyOutput({ ...valid, narration: '口播' }, snapshot), ErrorCode.AGENT_INVALID_OUTPUT);
    expect(looksLikeRawSnapshotId('snapshot-abc')).toBe(true);
    expectCode(
      () => validateCampaignStrategyEvidenceBasis({ type: 'MARKET_INSIGHT', ref: 'snapshot-abc' }),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () => validateCampaignStrategyEvidenceBasis({ type: 'UNKNOWN', ref: 'ok' }),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
  });

  it('rejects invalid contentMix percentages and accepts mix without percentages', () => {
    const snapshot = buildTestCampaignStrategySnapshot();
    const valid = buildMockCampaignStrategyOutput(snapshot);
    expectCode(
      () => validateCampaignStrategyOutput({ ...valid, contentMix: [{ type: 'A', percentage: 40, purpose: 'x' }] }, snapshot),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () =>
        validateCampaignStrategyOutput(
          {
            ...valid,
            contentMix: [
              { type: 'A', percentage: 40, purpose: 'a' },
              { type: 'B', purpose: 'b' },
            ],
          },
          snapshot,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expect(
      validateCampaignStrategyOutput(
        {
          ...valid,
          contentMix: [
            { type: 'A', purpose: 'a' },
            { type: 'B', purpose: 'b' },
          ],
        },
        snapshot,
      ).contentMix.every((item) => item.percentage === undefined),
    ).toBe(true);
  });

  it('grounds evidence refs and enforces confidence ceiling', () => {
    const snapshot = buildTestCampaignStrategySnapshot({
      marketInsight: {
        id: '55555555-5555-5555-5555-555555555555',
        version: 1,
        marketResearchId: '33333333-3333-3333-3333-333333333333',
        productBriefId: '11111111-1111-1111-1111-111111111111',
        productBriefVersion: 1,
        payload: limitedInsightPayload(),
      },
      flags: [],
      dataState: {
        market: 'LIMITED',
        performance: 'NONE',
        positioning: 'AVAILABLE',
        productBrief: 'AVAILABLE',
        overall: 'LIMITED',
      },
      confidenceCeiling: 'LOW',
    });
    const valid = buildMockCampaignStrategyOutput(snapshot);
    expectCode(
      () =>
        validateCampaignStrategyOutput(
          {
            ...valid,
            valuePropositions: [
              {
                proposition: 'x',
                priority: 'high',
                evidenceBasis: [{ type: 'MARKET_INSIGHT', ref: 'NOT_REAL' }],
              },
            ],
          },
          snapshot,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () => validateCampaignStrategyOutput({ ...valid, confidence: 'MEDIUM' }, snapshot),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
    expectCode(
      () =>
        validateCampaignStrategyOutput(
          { ...valid, objective: { ...valid.objective, businessGoal: '全抖音用户都在用' } },
          snapshot,
        ),
      ErrorCode.AGENT_INVALID_OUTPUT,
    );
  });
});
