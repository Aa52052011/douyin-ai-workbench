import { AppError, ErrorCode } from '../common/errors/app-error.js';
import type { AnalysisWindowKind, DataSufficiencyV1, MetricSnapshotInputV1, WindowCoverage } from './performance-analysis.types.js';

export type RatioSet = {
  likeRate: number | null;
  commentRate: number | null;
  shareRate: number | null;
  collectRate: number | null;
  engagementRate: number | null;
};

export type PerformanceMetricsSummaryV1 = {
  schemaVersion: 'performance.metrics-calculator:v1';
  snapshotCount: number;
  latestPlayCount: number | null;
  latestLikeCount: number | null;
  latestCommentCount: number | null;
  latestShareCount: number | null;
  latestCollectCount: number | null;
  followerDelta: number | null;
  elapsedMs: number | null;
  playDelta: number | null;
  likeDelta: number | null;
  commentDelta: number | null;
  shareDelta: number | null;
  collectDelta: number | null;
  ratios: RatioSet;
  trend: {
    delta: number | null;
    deltaPerHour: number | null;
    growthRate: number | null;
    latestVsPrevious: number | null;
  };
  window: AnalysisWindowKind;
  windowCoverage: WindowCoverage;
  metricsAreUserEntered: boolean;
  officialVerified: false;
};

const HOUR_MS = 3_600_000;
const WINDOW_MS: Record<Exclude<AnalysisWindowKind, 'CUSTOM' | 'LATEST_ONLY'>, number> = {
  FIRST_24H: 24 * HOUR_MS,
  FIRST_48H: 48 * HOUR_MS,
  FIRST_7D: 7 * 24 * HOUR_MS,
};

export function dataSufficiencyFromCount(count: number): DataSufficiencyV1 {
  if (count <= 0) return 'EMPTY';
  if (count === 1) return 'SPARSE';
  if (count === 2) return 'BASIC';
  if (count <= 4) return 'GOOD';
  return 'RICH';
}

export function assertFiniteNonNegative(value: number | null, allowNegative = false): void {
  if (value == null) return;
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'metrics cannot be NaN');
  }
  if (!allowNegative && value < 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'metrics cannot be negative');
  }
  if (!Number.isInteger(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'metrics must be integers');
  }
}

export function sortSnapshots(rows: MetricSnapshotInputV1[]): MetricSnapshotInputV1[] {
  return [...rows].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
}

export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

export function computeRatios(plays: number | null, likes: number | null, comments: number | null, shares: number | null, collects: number | null): RatioSet {
  const engagementParts = [likes, comments, shares, collects].filter((n): n is number => n != null);
  const engagementSum = engagementParts.length ? engagementParts.reduce((a, b) => a + b, 0) : null;
  return {
    likeRate: ratio(likes, plays),
    commentRate: ratio(comments, plays),
    shareRate: ratio(shares, plays),
    collectRate: ratio(collects, plays),
    engagementRate: ratio(engagementSum, plays),
  };
}

export function filterWindow(
  rows: MetricSnapshotInputV1[],
  window: AnalysisWindowKind,
  originAt: Date | null,
  custom?: { from?: string; to?: string },
): { snapshots: MetricSnapshotInputV1[]; coverage: WindowCoverage } {
  const sorted = sortSnapshots(rows);
  if (window === 'LATEST_ONLY') {
    return { snapshots: sorted.slice(-1), coverage: 'COMPLETE' };
  }
  const start = originAt ?? (sorted[0] ? new Date(sorted[0].capturedAt) : null);
  if (!start) return { snapshots: [], coverage: 'PARTIAL_WINDOW' };
  let endMs: number;
  if (window === 'CUSTOM') {
    const from = custom?.from ? new Date(custom.from) : start;
    const to = custom?.to ? new Date(custom.to) : new Date();
    const inRange = sorted.filter((row) => {
      const t = new Date(row.capturedAt).getTime();
      return t >= from.getTime() && t <= to.getTime();
    });
    return { snapshots: inRange, coverage: 'PARTIAL_WINDOW' };
  }
  endMs = start.getTime() + WINDOW_MS[window];
  const inRange = sorted.filter((row) => {
    const t = new Date(row.capturedAt).getTime();
    return t >= start.getTime() && t <= endMs;
  });
  const last = inRange.at(-1);
  const covered = last != null && new Date(last.capturedAt).getTime() - start.getTime() >= WINDOW_MS[window] * 0.95;
  return { snapshots: inRange, coverage: covered ? 'COMPLETE' : 'PARTIAL_WINDOW' };
}

export function calculatePerformanceMetricsV1(input: {
  snapshots: MetricSnapshotInputV1[];
  publishedPostId: string;
  window: AnalysisWindowKind;
  originAt?: Date | null;
}): PerformanceMetricsSummaryV1 {
  for (const row of input.snapshots) {
    if (row.publishedPostId !== input.publishedPostId) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'snapshot publishedPost mismatch');
    }
    assertFiniteNonNegative(row.playCount);
    assertFiniteNonNegative(row.likeCount);
    assertFiniteNonNegative(row.commentCount);
    assertFiniteNonNegative(row.shareCount);
    assertFiniteNonNegative(row.collectCount);
    assertFiniteNonNegative(row.followerDelta, true);
    if (Number.isNaN(new Date(row.capturedAt).getTime())) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'capturedAt invalid');
    }
  }
  const filtered = filterWindow(input.snapshots, input.window, input.originAt ?? null);
  const sorted = sortSnapshots(filtered.snapshots);
  const first = sorted[0];
  const latest = sorted.at(-1) ?? null;
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const elapsedMs =
    first && latest ? new Date(latest.capturedAt).getTime() - new Date(first.capturedAt).getTime() : null;
  const playDelta = latest && previous && latest.playCount != null && previous.playCount != null ? latest.playCount - previous.playCount : latest && first && latest.playCount != null && first.playCount != null && sorted.length > 1 ? latest.playCount - first.playCount : null;
  const hours = elapsedMs != null && elapsedMs > 0 ? elapsedMs / HOUR_MS : null;
  const sources = new Set(sorted.map((row) => row.source));
  const userEntered = [...sources].every((s) => s === 'MANUAL' || s === 'MANUAL_ENTRY' || s === 'IMPORT' || s === 'MANUAL_IMPORT');
  return {
    schemaVersion: 'performance.metrics-calculator:v1',
    snapshotCount: sorted.length,
    latestPlayCount: latest?.playCount ?? null,
    latestLikeCount: latest?.likeCount ?? null,
    latestCommentCount: latest?.commentCount ?? null,
    latestShareCount: latest?.shareCount ?? null,
    latestCollectCount: latest?.collectCount ?? null,
    followerDelta: latest?.followerDelta ?? null,
    elapsedMs,
    playDelta,
    likeDelta: delta(previous?.likeCount ?? first?.likeCount ?? null, latest?.likeCount ?? null, sorted.length),
    commentDelta: delta(previous?.commentCount ?? first?.commentCount ?? null, latest?.commentCount ?? null, sorted.length),
    shareDelta: delta(previous?.shareCount ?? first?.shareCount ?? null, latest?.shareCount ?? null, sorted.length),
    collectDelta: delta(previous?.collectCount ?? first?.collectCount ?? null, latest?.collectCount ?? null, sorted.length),
    ratios: computeRatios(latest?.playCount ?? null, latest?.likeCount ?? null, latest?.commentCount ?? null, latest?.shareCount ?? null, latest?.collectCount ?? null),
    trend: {
      delta: playDelta,
      deltaPerHour: playDelta != null && hours ? playDelta / hours : null,
      growthRate: previous?.playCount && previous.playCount !== 0 && latest?.playCount != null ? (latest.playCount - previous.playCount) / previous.playCount : null,
      latestVsPrevious: playDelta,
    },
    window: input.window,
    windowCoverage: filtered.coverage,
    metricsAreUserEntered: userEntered || sorted.length === 0,
    officialVerified: false,
  };
}

function delta(from: number | null, to: number | null, count: number): number | null {
  if (count < 2 || from == null || to == null) return null;
  return to - from;
}
