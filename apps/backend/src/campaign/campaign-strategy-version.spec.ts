import { describe, expect, it } from 'vitest';
import { nextCampaignStrategyVersion } from './campaign-strategy-version.js';

describe('campaign strategy versioning', () => {
  it('allocates deterministic next versions', () => {
    expect(nextCampaignStrategyVersion(undefined)).toBe(1);
    expect(nextCampaignStrategyVersion(null)).toBe(1);
    expect(nextCampaignStrategyVersion(1)).toBe(2);
    expect(nextCampaignStrategyVersion(7)).toBe(8);
  });
});
