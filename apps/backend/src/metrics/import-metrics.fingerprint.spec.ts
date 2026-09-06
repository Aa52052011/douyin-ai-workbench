import { describe, expect, it } from 'vitest';
import {
  importCollectionKey,
  isAllowedImportMetricsProvider,
  isApiSpoofImportProvider,
} from './import-metrics.constants.js';
import { importMetricsFingerprint, sameImportMetricsRequest } from './import-metrics.fingerprint.js';

const metrics = {
  views: 10,
  likes: 0,
  comments: null,
  shares: null,
  favorites: null,
  averageWatchTimeSeconds: 12.345,
  completionRate: 0.63,
  newFollowers: null,
};

describe('import metrics fingerprint', () => {
  it('scopes collectionKey to the idempotency key without client input', () => {
    expect(importCollectionKey('ingest-key-1')).toBe('import:ingest-key-1');
  });

  it('treats the same normalized payload as the same request', () => {
    const publicationId = '11111111-1111-4111-8111-111111111111';
    const observedAt = new Date('2026-08-02T12:00:00.000Z');
    const incoming = {
      publicationId,
      ...metrics,
      observedAt,
      providerCollectedAt: null,
      provider: 'STRUCTURED_IMPORT',
      providerMetadata: { mappingVersion: 'v1' },
    };
    const existing = {
      ...metrics,
      observedAt,
      providerCollectedAt: null,
      provider: 'STRUCTURED_IMPORT',
      providerMetadata: { mappingVersion: 'v1' },
    };
    expect(sameImportMetricsRequest(publicationId, existing, incoming)).toBe(true);
    expect(importMetricsFingerprint(incoming)).toContain('"views":10');
    expect(importMetricsFingerprint(incoming)).toContain('"likes":0');
  });

  it('conflicts when views differ', () => {
    const publicationId = '11111111-1111-4111-8111-111111111111';
    const observedAt = new Date('2026-08-02T12:00:00.000Z');
    const existing = {
      ...metrics,
      observedAt,
      providerCollectedAt: null,
      provider: 'STRUCTURED_IMPORT',
      providerMetadata: {},
    };
    expect(
      sameImportMetricsRequest(publicationId, existing, {
        publicationId,
        ...metrics,
        views: 999,
        observedAt,
        providerCollectedAt: null,
        provider: 'STRUCTURED_IMPORT',
        providerMetadata: {},
      }),
    ).toBe(false);
  });
});

describe('import provider allowlist', () => {
  it('allows structured import providers and rejects API spoofing', () => {
    expect(isAllowedImportMetricsProvider('STRUCTURED_IMPORT')).toBe(true);
    expect(isAllowedImportMetricsProvider('CSV_IMPORT')).toBe(true);
    expect(isAllowedImportMetricsProvider('XLSX_IMPORT')).toBe(true);
    expect(isAllowedImportMetricsProvider('DESKTOP_ASSISTED')).toBe(true);
    expect(isAllowedImportMetricsProvider('DOUYIN')).toBe(false);
    expect(isAllowedImportMetricsProvider('MOCK')).toBe(false);
    expect(isApiSpoofImportProvider('DOUYIN')).toBe(true);
    expect(isApiSpoofImportProvider('mock')).toBe(true);
    expect(isApiSpoofImportProvider('OFFICIAL_API')).toBe(true);
    expect(isApiSpoofImportProvider('STRUCTURED_IMPORT')).toBe(false);
  });
});
