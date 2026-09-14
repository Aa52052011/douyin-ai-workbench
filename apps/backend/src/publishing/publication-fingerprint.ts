export type PublicationFingerprintInput = {
  videoId: string | null;
  platformAccountId: string | null;
  platform: string;
  mode: string;
  title: string;
  description: string;
  hashtags: string[];
  visibility: string;
};

export function publicationFingerprint(input: PublicationFingerprintInput): string {
  const payload: Record<string, unknown> = {
    videoId: input.videoId,
    platform: input.platform,
    mode: input.mode,
    title: input.title,
    description: input.description,
    hashtags: [...input.hashtags].sort(),
    visibility: input.visibility,
  };
  if (input.mode === 'API') {
    payload.platformAccountId = input.platformAccountId;
  }
  return JSON.stringify(payload);
}

export function samePublicationRequest(
  existing: PublicationFingerprintInput,
  incoming: PublicationFingerprintInput,
): boolean {
  return publicationFingerprint(existing) === publicationFingerprint(incoming);
}
