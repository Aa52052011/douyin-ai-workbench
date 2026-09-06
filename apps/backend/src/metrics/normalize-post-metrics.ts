import { AppError, ErrorCode } from '../common/errors/app-error.js';
import type { NormalizedPostMetrics, PostMetricsResult } from './metrics-provider.types.js';
import { sanitizeMetricsProviderMetadata } from './sanitize-metrics-metadata.js';

export function normalizePostMetricsResult(raw: Partial<PostMetricsResult> | Record<string, unknown>): PostMetricsResult {
  const record = raw as Record<string, unknown>;
  return {
    views: requireCount(record, 'views'),
    likes: requireCount(record, 'likes'),
    comments: requireCount(record, 'comments'),
    shares: requireCount(record, 'shares'),
    favorites: requireCount(record, 'favorites'),
    averageWatchTimeSeconds: requireNonNegativeNumber(record, 'averageWatchTimeSeconds'),
    completionRate: requireCompletionRate(record),
    newFollowers: requireCount(record, 'newFollowers'),
    observedAt: requireDate(record, 'observedAt'),
    providerCollectedAt: requireDate(record, 'providerCollectedAt'),
    providerRequestId: optionalString(record, 'providerRequestId'),
    providerSnapshotId: optionalString(record, 'providerSnapshotId'),
    metadata: sanitizeMetricsProviderMetadata(record.metadata),
  };
}

export function emptyNormalizedMetrics(): NormalizedPostMetrics {
  return {
    views: null,
    likes: null,
    comments: null,
    shares: null,
    favorites: null,
    averageWatchTimeSeconds: null,
    completionRate: null,
    newFollowers: null,
  };
}

function requireCount(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new AppError(ErrorCode.METRICS_PROVIDER_INVALID_RESPONSE);
  }
  return value;
}

function requireNonNegativeNumber(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new AppError(ErrorCode.METRICS_PROVIDER_INVALID_RESPONSE);
  }
  return value;
}

function requireCompletionRate(raw: Record<string, unknown>): number | null {
  const value = raw.completionRate;
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new AppError(ErrorCode.METRICS_PROVIDER_INVALID_RESPONSE);
  }
  return value;
}

function requireDate(raw: Record<string, unknown>, key: string): Date | null {
  const value = raw[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  throw new AppError(ErrorCode.METRICS_PROVIDER_INVALID_RESPONSE);
}

function optionalString(raw: Record<string, unknown>, key: string): string | null {
  const value = raw[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError(ErrorCode.METRICS_PROVIDER_INVALID_RESPONSE);
  }
  return value;
}
