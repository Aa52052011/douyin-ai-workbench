import { AppError, ErrorCode } from '../common/errors/app-error.js';

export type ManualMetricsInputV1 = {
  playCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
  collectCount?: number | null;
  followerDelta?: number | null;
  capturedAt?: string | null;
};

export type ValidatedManualMetricsV1 = {
  playCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  collectCount: number | null;
  followerDelta: number | null;
  capturedAt: Date;
};

function intField(value: number | null | undefined, min: number | null): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'metrics must be finite integers');
  }
  if (min != null && value < min) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'metrics cannot be negative');
  }
  return value;
}

export function validateManualMetricsSnapshotV1(input: ManualMetricsInputV1): ValidatedManualMetricsV1 {
  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();
  if (Number.isNaN(capturedAt.getTime())) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'capturedAt is invalid');
  }
  return {
    playCount: intField(input.playCount, 0),
    likeCount: intField(input.likeCount, 0),
    commentCount: intField(input.commentCount, 0),
    shareCount: intField(input.shareCount, 0),
    collectCount: intField(input.collectCount, 0),
    followerDelta: intField(input.followerDelta, null),
    capturedAt,
  };
}

export function computeMetricTrend(previous: number | null, current: number | null, intervalMs: number) {
  if (previous == null || current == null) {
    return { delta: null as number | null, deltaPercent: null as number | null, intervalMs };
  }
  const delta = current - previous;
  const deltaPercent = previous === 0 ? null : (delta / previous) * 100;
  return { delta, deltaPercent, intervalMs };
}
