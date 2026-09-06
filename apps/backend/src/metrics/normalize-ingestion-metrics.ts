import { AppError, ErrorCode } from '../common/errors/app-error.js';
import type { NormalizedPublicationMetrics, RawPublicationMetrics } from './ingestion.types.js';
import { METRIC_FIELD_KEYS, PG_INT_MAX } from './publication-metrics.constants.js';

export function emptyNormalizedPublicationMetrics(): NormalizedPublicationMetrics {
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

export function normalizePublicationMetrics(
  raw: RawPublicationMetrics | Record<string, unknown> | null | undefined,
): NormalizedPublicationMetrics {
  const record = (raw ?? {}) as Record<string, unknown>;
  return {
    views: requireCount(record, 'views'),
    likes: requireCount(record, 'likes'),
    comments: requireCount(record, 'comments'),
    shares: requireCount(record, 'shares'),
    favorites: requireCount(record, 'favorites'),
    averageWatchTimeSeconds: requireNonNegativeNumber(record, 'averageWatchTimeSeconds'),
    completionRate: requireCompletionRate(record),
    newFollowers: requireCount(record, 'newFollowers'),
  };
}

export function requireAtLeastOneNormalizedMetric(metrics: NormalizedPublicationMetrics): NormalizedPublicationMetrics {
  const present = METRIC_FIELD_KEYS.some((key) => metrics[key] !== null);
  if (!present) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'At least one metric is required');
  }
  return metrics;
}

function requireCount(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > PG_INT_MAX
  ) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${key} must be an integer between 0 and ${PG_INT_MAX}`);
  }
  return value;
}

function requireNonNegativeNumber(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${key} must be a non-negative number`);
  }
  return value;
}

function requireCompletionRate(raw: Record<string, unknown>): number | null {
  const value = raw.completionRate;
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'completionRate must be between 0 and 1');
  }
  return value;
}
