import { describe, expect, it } from 'vitest';
import { buildTestCampaignStrategySnapshot } from '../agents/definitions/campaign-strategy.fixture.js';
import { campaignStrategySemanticFingerprint } from './campaign-strategy-fingerprint.js';

describe('campaign strategy semantic fingerprint', () => {
  it('is stable across composedAt changes and changes when userGoal changes', () => {
    const first = buildTestCampaignStrategySnapshot();
    const same = buildTestCampaignStrategySnapshot({ composedAt: '2026-09-06T00:00:00.000Z' });
    const changed = buildTestCampaignStrategySnapshot({
      currentUserGoal: { userGoal: '改成转化' },
    });
    expect(campaignStrategySemanticFingerprint(first)).toBe(campaignStrategySemanticFingerprint(same));
    expect(campaignStrategySemanticFingerprint(first)).not.toBe(campaignStrategySemanticFingerprint(changed));
  });
});
