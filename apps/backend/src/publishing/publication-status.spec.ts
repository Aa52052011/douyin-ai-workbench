import { describe, expect, it } from 'vitest';
import { isBlindRetryForbidden, isHttpRetryAllowed, isSafeToRetry, isUnknownExternalState } from './publication-status.js';
import { sanitizeProviderResponseMetadata } from './provider-response-metadata.js';

describe('publication status rules', () => {
  it('keeps UNKNOWN_EXTERNAL_STATE distinct from FAILED', () => {
    expect(isUnknownExternalState('UNKNOWN_EXTERNAL_STATE')).toBe(true);
    expect(isUnknownExternalState('FAILED')).toBe(false);
    expect(isBlindRetryForbidden('UNKNOWN_EXTERNAL_STATE')).toBe(true);
    expect(isBlindRetryForbidden('FAILED')).toBe(false);
    expect(isSafeToRetry('FAILED')).toBe(true);
    expect(isHttpRetryAllowed('FAILED', 'SAFE_TO_RETRY')).toBe(true);
    expect(isHttpRetryAllowed('UNKNOWN_EXTERNAL_STATE', 'UNKNOWN_EXTERNAL_STATE')).toBe(false);
    expect(isSafeToRetry('UNKNOWN_EXTERNAL_STATE')).toBe(false);
    expect(isBlindRetryForbidden('SUBMITTING')).toBe(true);
    expect(isBlindRetryForbidden('PUBLISHED')).toBe(true);
  });
});

describe('provider response metadata', () => {
  it('drops tokens and unknown keys', () => {
    expect(
      sanitizeProviderResponseMetadata({
        itemId: 'item-1',
        videoId: 'vid-1',
        requestId: 'req-1',
        providerUploadId: 'up-1',
        retryClass: 'SAFE_TO_RETRY',
        accessToken: 'dummy-access-not-a-real-token',
        refreshToken: 'dummy-refresh-not-a-real-token',
        nested: { accessToken: 'nope' },
      }),
    ).toEqual({ itemId: 'item-1', videoId: 'vid-1', requestId: 'req-1', providerUploadId: 'up-1', retryClass: 'SAFE_TO_RETRY' });
  });
});
