import { describe, expect, it } from 'vitest';
import {
  applyActionableReview,
  buildActionableRecommendations,
  collectAcceptedPerformanceFeedback,
  formatCountChange,
  isAcceptedReviewStatus,
  mergePersistedRecommendations,
} from './actionable-recommendation.mapper.js';
import type { MetricSnapshotInputV1 } from './performance-analysis.types.js';

const snap1: MetricSnapshotInputV1 = {
  id: 's1',
  publishedPostId: '01a0a54e-5f54-78c1-a558-76a8d5fcf686',
  capturedAt: '2026-09-15T14:11:00.000Z',
  source: 'MANUAL_ENTRY',
  playCount: 96,
  likeCount: 31,
  commentCount: 10,
  shareCount: 3,
  collectCount: 3,
  followerDelta: 0,
};

const snap2: MetricSnapshotInputV1 = {
  ...snap1,
  id: 's2',
  capturedAt: '2026-09-15T14:20:00.000Z',
  playCount: 115,
  likeCount: 42,
  commentCount: 12,
  shareCount: 5,
  collectCount: 6,
  followerDelta: 1,
};

describe('actionable recommendation mapper', () => {
  it('binds each metric to its own evidence and an executable action', () => {
    const recs = buildActionableRecommendations([snap1, snap2]);
    const byId = Object.fromEntries(recs.map((row) => [row.recommendationId, row]));
    expect(byId['rec-views-format']?.observation).toBe('播放量从 96 到 115（+19 / +19.8%）');
    expect(byId['rec-likes-engagement']?.evidence[0]).toBe('点赞从 31 到 42（+11 / +35.5%）');
    expect(byId['rec-comments-cta']?.evidence[0]).toBe('评论从 10 到 12（+2 / +20%）');
    expect(byId['rec-shares-shareability']?.evidence[0]).toBe('分享从 3 到 5（+2 / +66.7%）');
    expect(byId['rec-favorites-content']?.evidence[0]).toBe('收藏从 3 到 6（+3 / +100%）');
    expect(byId['rec-followers-audience']?.evidence[0]).toBe('新增粉丝从 0 到 1（+1）');
    expect(byId['rec-comments-cta']?.evidence[0]?.includes('96')).toBe(false);
    expect(byId['rec-likes-engagement']?.recommendedAction.includes('表现较好')).toBe(false);
    expect(byId['rec-comments-cta']?.recommendedAction.includes('提问式 CTA')).toBe(true);
    expect(recs.every((row) => row.requiresHumanReview)).toBe(true);
    expect(JSON.stringify(recs).includes('因为')).toBe(false);
  });

  it('keeps zero and negative values', () => {
    expect(formatCountChange('新增粉丝', 0, 1, false)).toBe('新增粉丝从 0 到 1（+1）');
    expect(formatCountChange('点赞', 5, 3, true)).toBe('点赞从 5 到 3（-2 / -40%）');
  });

  it('emits insufficient recommendation when only one snapshot exists', () => {
    const recs = buildActionableRecommendations([snap1]);
    expect(recs).toHaveLength(1);
    expect(recs[0]?.category).toBe('DATA_INSUFFICIENT');
    expect(recs[0]?.recommendedAction).toContain('继续收集后续数据');
    expect(recs[0]?.confidence).toBe('UNKNOWN');
  });

  it('persists decision history and accepted-only handoff', () => {
    const recs = buildActionableRecommendations([snap1, snap2]);
    const accepted = applyActionableReview(recs, 'rec-comments-cta', 'APPROVE', {
      reviewedBy: 'user-1',
      reviewedAt: '2026-09-15T15:00:00.000Z',
    });
    const rejected = applyActionableReview(accepted, 'rec-likes-engagement', 'REJECT', {
      reviewedBy: 'user-1',
      reviewedAt: '2026-09-15T15:01:00.000Z',
    });
    const deferred = applyActionableReview(rejected, 'rec-shares-shareability', 'DEFER', {
      reviewedBy: 'user-1',
      reviewedAt: '2026-09-15T15:02:00.000Z',
    });
    const changed = applyActionableReview(deferred, 'rec-comments-cta', 'REJECT', {
      reviewedBy: 'user-1',
      reviewedAt: '2026-09-15T15:03:00.000Z',
    });
    const comments = changed.find((row) => row.recommendationId === 'rec-comments-cta');
    expect(comments?.reviewHistory).toHaveLength(2);
    expect(comments?.reviewStatus).toBe('REJECTED');
    const handoff = collectAcceptedPerformanceFeedback({
      sourcePublicationId: snap1.publishedPostId,
      sourceAnalysisId: 'analysis-1',
      recommendations: deferred,
    });
    expect(handoff).toHaveLength(1);
    expect(handoff[0]?.recommendedAction).toContain('提问式 CTA');
    expect(handoff[0]?.recommendationId).toBe('rec-comments-cta');
    expect(isAcceptedReviewStatus('PENDING')).toBe(false);
    expect(isAcceptedReviewStatus('REJECTED')).toBe(false);
    expect(isAcceptedReviewStatus('DEFERRED')).toBe(false);
    expect(isAcceptedReviewStatus('ACCEPTED')).toBe(true);
    const merged = mergePersistedRecommendations(
      [{ recommendationId: 'rec-comments-cta', reviewStatus: 'PENDING' }],
      [{ recommendationId: 'rec-comments-cta', reviewStatus: 'ACCEPTED', reviewedAt: '2026-09-15T16:00:00.000Z', reviewHistory: comments?.reviewHistory }],
    );
    expect(merged[0]?.reviewStatus).toBe('ACCEPTED');
    expect(merged[0]?.reviewHistory?.length).toBe(2);
  });

  it('does not treat pending as accepted', () => {
    const recs = buildActionableRecommendations([snap1, snap2]);
    expect(
      collectAcceptedPerformanceFeedback({
        sourcePublicationId: 'p',
        sourceAnalysisId: 'a',
        recommendations: recs,
      }),
    ).toEqual([]);
  });

  it('includes only persisted ACCEPTED reviewStatus in planning handoff', () => {
    const recs = buildActionableRecommendations([snap1, snap2]).map((row) => {
      if (row.recommendationId === 'rec-comments-cta') return { ...row, reviewStatus: 'ACCEPTED' as const };
      if (row.recommendationId === 'rec-likes-engagement') return { ...row, reviewStatus: 'REJECTED' as const };
      if (row.recommendationId === 'rec-shares-shareability') return { ...row, reviewStatus: 'DEFERRED' as const };
      return { ...row, reviewStatus: 'PENDING' as const };
    });
    const handoff = collectAcceptedPerformanceFeedback({
      sourcePublicationId: snap1.publishedPostId,
      sourceAnalysisId: 'analysis-1',
      recommendations: recs,
    });
    expect(handoff).toHaveLength(1);
    expect(handoff[0]?.recommendationId).toBe('rec-comments-cta');
    expect(handoff.map((item) => item.recommendationId)).not.toContain('rec-likes-engagement');
    expect(handoff.map((item) => item.recommendationId)).not.toContain('rec-shares-shareability');
    expect(handoff.map((item) => item.recommendationId)).not.toContain('rec-views-format');
  });
});
