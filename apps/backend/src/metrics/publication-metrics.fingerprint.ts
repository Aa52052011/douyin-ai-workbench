import { Prisma } from '@prisma/client';
import {
  MANUAL_COLLECTION_KEY_PREFIX,
  SERVER_NOW_EQ_MS,
  SERVER_NOW_SENTINEL,
} from './publication-metrics.constants.js';

export type ManualMetricsValues = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  averageWatchTimeSeconds: number | null;
  completionRate: number | null;
  newFollowers: number | null;
};

export type ManualMetricsStored = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  averageWatchTimeSeconds: unknown;
  completionRate: unknown;
  newFollowers: number | null;
  observedAt: Date;
  createdAt: Date;
};

export type ManualMetricsFingerprintInput = ManualMetricsValues & {
  publicationId: string;
  observedAtSemantic: string;
};

export function manualCollectionKey(idempotencyKey: string): string {
  return `${MANUAL_COLLECTION_KEY_PREFIX}${idempotencyKey}`;
}

export function incomingObservedAtSemantic(observedAt?: string | null): string {
  if (observedAt == null || observedAt.trim() === '') {
    return SERVER_NOW_SENTINEL;
  }
  return new Date(observedAt).toISOString();
}

export function reconstructObservedAtSemantic(existing: {
  observedAt: Date;
  createdAt: Date;
}): string {
  const delta = Math.abs(existing.observedAt.getTime() - existing.createdAt.getTime());
  if (delta <= SERVER_NOW_EQ_MS) {
    return SERVER_NOW_SENTINEL;
  }
  return existing.observedAt.toISOString();
}

export function comparableMetricNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  const decimal = new Prisma.Decimal(typeof value === 'string' || typeof value === 'number' ? value : value.toString());
  return decimal.toNumber();
}

export function manualMetricsFingerprint(input: ManualMetricsFingerprintInput): string {
  return JSON.stringify({
    publicationId: input.publicationId,
    views: input.views,
    likes: input.likes,
    comments: input.comments,
    shares: input.shares,
    favorites: input.favorites,
    averageWatchTimeSeconds: comparableMetricNumber(input.averageWatchTimeSeconds),
    completionRate: comparableMetricNumber(input.completionRate),
    newFollowers: input.newFollowers,
    observedAt: input.observedAtSemantic,
  });
}

export function fingerprintFromSnapshot(
  publicationId: string,
  existing: ManualMetricsStored,
): string {
  return manualMetricsFingerprint({
    publicationId,
    views: comparableMetricNumber(existing.views),
    likes: comparableMetricNumber(existing.likes),
    comments: comparableMetricNumber(existing.comments),
    shares: comparableMetricNumber(existing.shares),
    favorites: comparableMetricNumber(existing.favorites),
    averageWatchTimeSeconds: comparableMetricNumber(existing.averageWatchTimeSeconds),
    completionRate: comparableMetricNumber(existing.completionRate),
    newFollowers: comparableMetricNumber(existing.newFollowers),
    observedAtSemantic: reconstructObservedAtSemantic(existing),
  });
}

export function fingerprintFromStoredObservedAt(
  publicationId: string,
  existing: ManualMetricsStored,
): string {
  return manualMetricsFingerprint({
    publicationId,
    views: comparableMetricNumber(existing.views),
    likes: comparableMetricNumber(existing.likes),
    comments: comparableMetricNumber(existing.comments),
    shares: comparableMetricNumber(existing.shares),
    favorites: comparableMetricNumber(existing.favorites),
    averageWatchTimeSeconds: comparableMetricNumber(existing.averageWatchTimeSeconds),
    completionRate: comparableMetricNumber(existing.completionRate),
    newFollowers: comparableMetricNumber(existing.newFollowers),
    observedAtSemantic: existing.observedAt.toISOString(),
  });
}

export function sameManualMetricsContent(
  publicationId: string,
  existing: ManualMetricsStored,
  incoming: ManualMetricsValues,
  observedAt: Date,
): boolean {
  return (
    fingerprintFromStoredObservedAt(publicationId, existing) ===
    manualMetricsFingerprint({
      publicationId,
      ...incoming,
      observedAtSemantic: observedAt.toISOString(),
    })
  );
}

export function sameManualMetricsRequest(
  publicationId: string,
  existing: ManualMetricsStored,
  incoming: ManualMetricsFingerprintInput,
): boolean {
  return fingerprintFromSnapshot(publicationId, existing) === manualMetricsFingerprint(incoming);
}
