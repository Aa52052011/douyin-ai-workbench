import { describe, expect, it } from 'vitest';
import {
  boundVideoDisplayTitle,
  canUseVideoAsManualPublicationSource,
  isPublicationSourceBound,
  sourceBindingFromAcceptance,
} from './publication-source-binding.js';

function acceptance(partial: { current: boolean; videoId?: string }) {
  return {
    id: 'acc',
    videoId: partial.videoId ?? 'accepted-video',
    acceptedArtifactId: 'artifact-1',
    variant: 'VERTICAL',
    status: 'ACCEPTED',
    current: partial.current,
    acceptedAt: new Date('2026-09-15T00:00:00.000Z'),
  };
}

describe('manual publication source binding', () => {
  it('binds current accepted video as publication source', () => {
    expect(
      canUseVideoAsManualPublicationSource({
        videoId: 'accepted-video',
        status: 'COMPLETED',
        acceptance: acceptance({ current: true, videoId: 'accepted-video' }),
      }),
    ).toBe(true);
    expect(
      sourceBindingFromAcceptance({
        videoId: 'accepted-video',
        scriptId: 'script-1',
        acceptance: acceptance({ current: true }),
      }),
    ).toEqual({
      videoId: 'accepted-video',
      scriptId: 'script-1',
      productionArtifactId: 'artifact-1',
    });
  });

  it('rejects historical COMPLETED video without current acceptance', () => {
    expect(
      canUseVideoAsManualPublicationSource({
        videoId: 'old',
        status: 'COMPLETED',
        acceptance: null,
      }),
    ).toBe(false);
  });

  it('rejects superseded acceptance', () => {
    expect(
      canUseVideoAsManualPublicationSource({
        videoId: 'old',
        status: 'COMPLETED',
        acceptance: acceptance({ current: false, videoId: 'old' }),
      }),
    ).toBe(false);
  });

  it('requires current VideoFinalAcceptance for the same video', () => {
    expect(
      canUseVideoAsManualPublicationSource({
        videoId: 'other',
        status: 'COMPLETED',
        acceptance: acceptance({ current: true, videoId: 'accepted-video' }),
      }),
    ).toBe(false);
  });

  it('does not invent a binding when publication has no videoId', () => {
    expect(isPublicationSourceBound({ videoId: null, productionArtifactId: null })).toBe(false);
    expect(boundVideoDisplayTitle(false, '餐饮店不会拍视频，现场生成一周内容方案')).toBe('未绑定成片');
  });

  it('shows bound video title without claiming platform verification', () => {
    expect(isPublicationSourceBound({ videoId: 'accepted-video', productionArtifactId: 'artifact-1' })).toBe(true);
    expect(boundVideoDisplayTitle(true, '餐饮店不会拍视频，现场生成一周内容方案')).toBe(
      '餐饮店不会拍视频，现场生成一周内容方案',
    );
  });
});
