import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { SERVER_NOW_SENTINEL } from './publication-metrics.constants.js';
import {
  fingerprintFromSnapshot,
  incomingObservedAtSemantic,
  manualCollectionKey,
  manualMetricsFingerprint,
  reconstructObservedAtSemantic,
  sameManualMetricsRequest,
} from './publication-metrics.fingerprint.js';

const metrics = {
  views: 10,
  likes: null,
  comments: null,
  shares: null,
  favorites: null,
  averageWatchTimeSeconds: 12.345,
  completionRate: 0.63,
  newFollowers: null,
};

describe('manual metrics fingerprint', () => {
  it('scopes collectionKey to the idempotency key without client input', () => {
    expect(manualCollectionKey('publish-key-1')).toBe('manual:publish-key-1');
  });

  it('uses SERVER_NOW when observedAt is omitted so retries do not depend on now()', () => {
    expect(incomingObservedAtSemantic(undefined)).toBe(SERVER_NOW_SENTINEL);
    expect(incomingObservedAtSemantic('')).toBe(SERVER_NOW_SENTINEL);
    expect(incomingObservedAtSemantic('2026-08-02T12:00:00.000Z')).toBe('2026-08-02T12:00:00.000Z');
  });

  it('reconstructs omitted observedAt when observedAt is within createdAt skew', () => {
    const createdAt = new Date('2026-08-02T12:00:00.000Z');
    const observedAt = new Date(createdAt.getTime() + 400);
    expect(reconstructObservedAtSemantic({ observedAt, createdAt })).toBe(SERVER_NOW_SENTINEL);
  });

  it('reconstructs explicit observedAt when it is not near createdAt', () => {
    const createdAt = new Date('2026-08-02T12:00:00.000Z');
    const observedAt = new Date('2026-08-01T08:00:00.000Z');
    expect(reconstructObservedAtSemantic({ observedAt, createdAt })).toBe(observedAt.toISOString());
  });

  it('treats same metrics with omitted observedAt as the same request after create', () => {
    const publicationId = '11111111-1111-4111-8111-111111111111';
    const createdAt = new Date('2026-08-02T12:00:00.400Z');
    const existing = {
      ...metrics,
      averageWatchTimeSeconds: new Prisma.Decimal('12.345'),
      completionRate: new Prisma.Decimal('0.6300000'),
      observedAt: createdAt,
      createdAt,
    };
    const incoming = {
      publicationId,
      ...metrics,
      observedAtSemantic: incomingObservedAtSemantic(undefined),
    };
    expect(sameManualMetricsRequest(publicationId, existing, incoming)).toBe(true);
    expect(fingerprintFromSnapshot(publicationId, existing)).toBe(manualMetricsFingerprint(incoming));
  });

  it('detects a conflicting views value for the same key', () => {
    const publicationId = '11111111-1111-4111-8111-111111111111';
    const createdAt = new Date('2026-08-02T12:00:00.000Z');
    const existing = {
      ...metrics,
      observedAt: createdAt,
      createdAt,
    };
    expect(
      sameManualMetricsRequest(publicationId, existing, {
        publicationId,
        ...metrics,
        views: 999,
        observedAtSemantic: SERVER_NOW_SENTINEL,
      }),
    ).toBe(false);
  });
});
