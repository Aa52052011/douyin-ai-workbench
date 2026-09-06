import { describe, expect, it } from 'vitest';

/**
 * Step 8.6 does not call the real Douyin OAuth HTTP APIs.
 * Controlled validation is Step 8.6R after the operator configures
 * DOUYIN_CLIENT_KEY / DOUYIN_CLIENT_SECRET / DOUYIN_REDIRECT_URI locally
 * and explicitly approves a live run.
 */
const enabled = process.env.RUN_REAL_DOUYIN_OAUTH_TESTS === 'true';

describe.skipIf(!enabled)('Real Douyin OAuth (skipped in Step 8.6)', () => {
  it('is not executed unless RUN_REAL_DOUYIN_OAUTH_TESTS=true', () => {
    expect(enabled).toBe(false);
  });
});
