export type VideoFinalAcceptancePublic = {
  id: string;
  current: boolean;
  acceptedArtifactId: string;
  variant: 'VERTICAL';
  status: 'ACCEPTED';
  acceptedAt: Date;
};

export type VideoFinalAcceptanceRow = {
  id: string;
  videoId: string;
  acceptedArtifactId: string;
  variant: string;
  status: string;
  current: boolean;
  acceptedAt: Date;
};

export function toPublicFinalAcceptance(row: VideoFinalAcceptanceRow | null): VideoFinalAcceptancePublic | null {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    current: row.current,
    acceptedArtifactId: row.acceptedArtifactId,
    variant: 'VERTICAL',
    status: 'ACCEPTED',
    acceptedAt: row.acceptedAt,
  };
}

export function isCurrentVerticalAcceptance(row: VideoFinalAcceptanceRow | null | undefined): boolean {
  return Boolean(row?.current && row.variant === 'VERTICAL' && row.status === 'ACCEPTED');
}

export function isPublicationCandidateVideo(input: {
  status: string;
  outputReady: boolean;
  acceptance: VideoFinalAcceptanceRow | null | undefined;
  hasActivePublication: boolean;
}): boolean {
  return (
    input.status === 'COMPLETED' &&
    input.outputReady &&
    isCurrentVerticalAcceptance(input.acceptance) &&
    !input.hasActivePublication
  );
}

export function isIdempotentCurrentAccept(
  existing: VideoFinalAcceptanceRow | null | undefined,
  artifactId: string,
): boolean {
  return Boolean(
    existing?.current && existing.acceptedArtifactId === artifactId && existing.status === "ACCEPTED",
  );
}
