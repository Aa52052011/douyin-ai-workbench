import { describe, expect, it } from 'vitest';
import { sanitizeMetricsProviderMetadata, metricsMetadataContainsSecrets } from './sanitize-metrics-metadata.js';

describe('sanitizeMetricsProviderMetadata', () => {
  it('keeps allowlisted diagnostic fields and strips token-like keys', () => {
    const sanitized = sanitizeMetricsProviderMetadata({
      providerRequestId: 'req-1',
      providerSnapshotId: 'snap-1',
      apiVersion: 'v1',
      mappingVersion: 'metrics-v1',
      errorCode: 'OK',
      accessToken: 'dummy-access-not-a-real-token',
      refreshToken: 'dummy-refresh-not-a-real-token',
      Authorization: 'Bearer dummy',
      cookie: 'sid=1',
      'Set-Cookie': 'sid=1',
      clientSecret: 'dummy-secret',
      credentialRef: 'should-not-store',
      rawResponse: { views: 1 },
      headers: { Authorization: 'Bearer x' },
    });
    const text = JSON.stringify(sanitized);
    expect(sanitized).toEqual({
      providerRequestId: 'req-1',
      providerSnapshotId: 'snap-1',
      apiVersion: 'v1',
      mappingVersion: 'metrics-v1',
      errorCode: 'OK',
    });
    expect(text).not.toContain('dummy-access-not-a-real-token');
    expect(text).not.toContain('accessToken');
    expect(text).not.toContain('refreshToken');
    expect(text).not.toContain('Authorization');
    expect(text).not.toContain('cookie');
    expect(text).not.toContain('rawResponse');
  });

  it('detects secret keys on import payloads', () => {
    expect(metricsMetadataContainsSecrets({ mappingVersion: 'v1', token: 'x' })).toBe(true);
    expect(metricsMetadataContainsSecrets({ password: 'x' })).toBe(true);
    expect(metricsMetadataContainsSecrets({ mappingVersion: 'v1' })).toBe(false);
    expect(metricsMetadataContainsSecrets({ rawResponse: { views: 1 } })).toBe(false);
  });
});
