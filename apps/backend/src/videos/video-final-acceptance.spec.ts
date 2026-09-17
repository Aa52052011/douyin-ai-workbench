import { describe, expect, it } from 'vitest';
import { isPublicationCandidateVideo, isCurrentVerticalAcceptance, isIdempotentCurrentAccept } from './video-final-acceptance.js';

function acceptance(partial: { current: boolean; videoId?: string }) {
  return {
    id: 'acc',
    videoId: partial.videoId ?? 'v1',
    acceptedArtifactId: 'a1',
    variant: 'VERTICAL',
    status: 'ACCEPTED',
    current: partial.current,
    acceptedAt: new Date('2026-09-15T00:00:00.000Z'),
  };
}

describe('video final acceptance publication candidates', () => {
  it('excludes COMPLETED video without acceptance', () => {
    expect(
      isPublicationCandidateVideo({
        status: 'COMPLETED',
        outputReady: true,
        acceptance: null,
        hasActivePublication: false,
      }),
    ).toBe(false);
  });

  it('includes current accepted video as candidate', () => {
    expect(
      isPublicationCandidateVideo({
        status: 'COMPLETED',
        outputReady: true,
        acceptance: acceptance({ current: true }),
        hasActivePublication: false,
      }),
    ).toBe(true);
  });

  it('counts only the current accepted among many completed', () => {
    const versions = [
      { id: 'v1', status: 'COMPLETED', outputReady: true, acceptance: null },
      { id: 'v2', status: 'COMPLETED', outputReady: true, acceptance: null },
      { id: 'v3', status: 'COMPLETED', outputReady: true, acceptance: null },
      { id: 'v4', status: 'COMPLETED', outputReady: true, acceptance: null },
      { id: 'v5', status: 'COMPLETED', outputReady: true, acceptance: null },
      { id: 'v6', status: 'COMPLETED', outputReady: true, acceptance: acceptance({ current: true, videoId: 'v6' }) },
    ];
    const candidates = versions.filter((item) =>
      isPublicationCandidateVideo({
        status: item.status,
        outputReady: item.outputReady,
        acceptance: item.acceptance,
        hasActivePublication: false,
      }),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe('v6');
  });

  it('keeps old accepted current when a newer completed video is not accepted', () => {
    expect(
      isPublicationCandidateVideo({
        status: 'COMPLETED',
        outputReady: true,
        acceptance: acceptance({ current: true, videoId: 'old' }),
        hasActivePublication: false,
      }),
    ).toBe(true);
    expect(
      isPublicationCandidateVideo({
        status: 'COMPLETED',
        outputReady: true,
        acceptance: null,
        hasActivePublication: false,
      }),
    ).toBe(false);
  });

  it('drops superseded historical acceptance from candidates', () => {
    expect(isCurrentVerticalAcceptance(acceptance({ current: false }))).toBe(false);
    expect(
      isPublicationCandidateVideo({
        status: 'COMPLETED',
        outputReady: true,
        acceptance: acceptance({ current: false }),
        hasActivePublication: false,
      }),
    ).toBe(false);
  });

  it('duplicate accept of the same current version is idempotent', () => {
    const row = acceptance({ current: true });
    expect(isIdempotentCurrentAccept(row, 'a1')).toBe(true);
    expect(isIdempotentCurrentAccept(row, 'other')).toBe(false);
  });

  it('accepted video is not published', () => {
    expect(
      isPublicationCandidateVideo({
        status: 'COMPLETED',
        outputReady: true,
        acceptance: acceptance({ current: true }),
        hasActivePublication: false,
      }),
    ).toBe(true);
    expect(
      isPublicationCandidateVideo({
        status: 'COMPLETED',
        outputReady: true,
        acceptance: acceptance({ current: true }),
        hasActivePublication: true,
      }),
    ).toBe(false);
  });

  it('download does not imply publication', () => {
    expect(
      isPublicationCandidateVideo({
        status: 'COMPLETED',
        outputReady: true,
        acceptance: acceptance({ current: true }),
        hasActivePublication: false,
      }),
    ).toBe(true);
  });
});
