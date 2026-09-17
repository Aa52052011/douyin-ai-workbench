import { isCurrentVerticalAcceptance, type VideoFinalAcceptanceRow } from '../videos/video-final-acceptance.js';

export function canUseVideoAsManualPublicationSource(input: {
  videoId: string;
  status: string;
  acceptance: VideoFinalAcceptanceRow | null | undefined;
}): boolean {
  if (input.status !== 'COMPLETED') {
    return false;
  }
  if (!isCurrentVerticalAcceptance(input.acceptance)) {
    return false;
  }
  return input.acceptance!.videoId === input.videoId;
}

export function sourceBindingFromAcceptance(input: {
  videoId: string;
  scriptId: string | null;
  acceptance: Pick<VideoFinalAcceptanceRow, 'acceptedArtifactId'>;
}): { videoId: string; scriptId: string | null; productionArtifactId: string } {
  return {
    videoId: input.videoId,
    scriptId: input.scriptId,
    productionArtifactId: input.acceptance.acceptedArtifactId,
  };
}

export function isPublicationSourceBound(input: {
  videoId?: string | null;
  productionArtifactId?: string | null;
}): boolean {
  return Boolean(input.videoId);
}

export function boundVideoDisplayTitle(bound: boolean, title?: string | null): string {
  if (!bound) {
    return '未绑定成片';
  }
  const name = title?.trim();
  return name || '已绑定成片';
}
