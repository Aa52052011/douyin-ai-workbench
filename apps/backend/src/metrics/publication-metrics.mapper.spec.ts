import { MetricSource, Platform, Prisma, type PublicationMetricSnapshot } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { decimalToJsonNumber, toPublicMetricSnapshot } from './publication-metrics.mapper.js';

function snapshot(overrides: Partial<PublicationMetricSnapshot> = {}): PublicationMetricSnapshot {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    tenantId: '33333333-3333-4333-8333-333333333333',
    workspaceId: '44444444-4444-4444-8444-444444444444',
    projectId: '55555555-5555-4555-8555-555555555555',
    publicationId: '66666666-6666-4666-8666-666666666666',
    platform: Platform.DOUYIN,
    source: MetricSource.MANUAL,
    collectionKey: 'manual:secret-key',
    observedAt: new Date('2026-08-02T12:00:00.000Z'),
    providerCollectedAt: null,
    createdAt: new Date('2026-08-02T12:00:01.000Z'),
    views: 10,
    likes: 0,
    comments: null,
    shares: null,
    favorites: null,
    averageWatchTimeSeconds: new Prisma.Decimal('12.345'),
    completionRate: new Prisma.Decimal('0.6300000'),
    newFollowers: null,
    provider: 'MANUAL',
    providerMetadata: { mappingVersion: 'should-not-leak', accessToken: 'nope' },
    sourceJobId: null,
    ...overrides,
  };
}

describe('publication metrics mapper', () => {
  it('serializes Prisma Decimal as JSON number | null', () => {
    expect(decimalToJsonNumber(new Prisma.Decimal('0'))).toBe(0);
    expect(decimalToJsonNumber(new Prisma.Decimal('0.6300000'))).toBe(0.63);
    expect(decimalToJsonNumber(new Prisma.Decimal('1'))).toBe(1);
    expect(decimalToJsonNumber(new Prisma.Decimal('12.345'))).toBe(12.345);
    expect(decimalToJsonNumber(null)).toBeNull();
  });

  it('omits collectionKey, sourceJobId, providerMetadata and tenant internals', () => {
    const publicDto = toPublicMetricSnapshot(snapshot());
    expect(publicDto).toEqual({
      id: '22222222-2222-4222-8222-222222222222',
      publicationId: '66666666-6666-4666-8666-666666666666',
      platform: Platform.DOUYIN,
      source: MetricSource.MANUAL,
      observedAt: new Date('2026-08-02T12:00:00.000Z'),
      providerCollectedAt: null,
      createdAt: new Date('2026-08-02T12:00:01.000Z'),
      views: 10,
      likes: 0,
      comments: null,
      shares: null,
      favorites: null,
      averageWatchTimeSeconds: 12.345,
      completionRate: 0.63,
      newFollowers: null,
      provider: 'MANUAL',
    });
    const text = JSON.stringify(publicDto);
    expect(text).not.toContain('collectionKey');
    expect(text).not.toContain('sourceJobId');
    expect(text).not.toContain('providerMetadata');
    expect(text).not.toContain('tenantId');
    expect(text).not.toContain('workspaceId');
    expect(text).not.toContain('projectId');
    expect(text).not.toContain('accessToken');
    expect(text).not.toContain('secret-key');
  });
});
