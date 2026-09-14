import { createHash } from 'node:crypto';

export const FROZEN_TOP_TRIM_CROP = { x: 0, y: 110, width: 1920, height: 930 } as const;
export const REVIEW_PREVIEW_SIZE = { width: 720, height: 1280 } as const;
export const BLUR_SOURCE_CONFIG = { type: 'BLUR_SOURCE' as const, blurSigma: 20, scaleMode: 'COVER_9_16' as const };
export const SOLID_BLACK_CONFIG = { type: 'SOLID' as const, color: '#000000' };
export const PLACEHOLDER_CONFIG = {
  type: 'REVIEW_PLACEHOLDER' as const,
  color: '#000000',
  mode: 'SMOKE_PLACEHOLDER_SOLID_BLACK' as const,
};

export type PreviewBackgroundConfig =
  | typeof PLACEHOLDER_CONFIG
  | typeof SOLID_BLACK_CONFIG
  | typeof BLUR_SOURCE_CONFIG
  | { type: 'STATIC_IMAGE'; assetId: string }
  | { type: 'DUPLICATE_BLUR' }
  | { type: 'AI_GENERATED' };

export function previewConfigPayload(input: {
  candidateId: string;
  candidateVersion: string;
  geometry: typeof FROZEN_TOP_TRIM_CROP;
  background: PreviewBackgroundConfig;
}): Record<string, unknown> {
  return {
    candidateId: input.candidateId,
    candidateVersion: input.candidateVersion,
    geometry: input.geometry,
    background: input.background,
    target: REVIEW_PREVIEW_SIZE,
    audioPolicy: 'MUTE_SOURCE_AUDIO',
    markerPolicy: 'REVIEW PREVIEW',
    productionUsable: false,
  };
}

export function previewConfigHash(input: {
  candidateId: string;
  candidateVersion: string;
  geometry?: typeof FROZEN_TOP_TRIM_CROP;
  background: PreviewBackgroundConfig;
}): string {
  const payload = previewConfigPayload({
    candidateId: input.candidateId,
    candidateVersion: input.candidateVersion,
    geometry: input.geometry ?? FROZEN_TOP_TRIM_CROP,
    background: input.background,
  });
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function isPreviewOfPreviewPath(filePath: string): boolean {
  const lower = filePath.replaceAll('\\', '/').toLowerCase();
  return (
    lower.includes('/review-preview/') ||
    lower.includes('/crop-review-previews/') ||
    lower.includes('/source-aware-previews/') ||
    lower.includes('/editorial-shot-previews/') ||
    lower.includes('/dynamic-reframe-previews/') ||
    lower.includes('/dynamic-reframe-preview/') ||
    lower.includes('/b2-13a/runtime-preview/') ||
    lower.includes('/production-derived/')
  );
}

export function backgroundConfigForSession(treatment: string, opts?: { solidColor?: string; staticImageAssetId?: string }): PreviewBackgroundConfig | { error: string } {
  if (treatment === 'UNRESOLVED') return PLACEHOLDER_CONFIG;
  if (treatment === 'SOLID') {
    if (!opts?.solidColor) return { error: 'SOLID_COLOR_REQUIRED' };
    if (opts.solidColor.toLowerCase() !== '#000000') return { error: 'SOLID_COLOR_UNSUPPORTED' };
    return SOLID_BLACK_CONFIG;
  }
  if (treatment === 'BLUR_SOURCE') return BLUR_SOURCE_CONFIG;
  if (treatment === 'DUPLICATE_BLUR') return { error: 'ALIAS_NOT_IMPLEMENTED' };
  if (treatment === 'STATIC_IMAGE') {
    if (!opts?.staticImageAssetId) return { error: 'BACKGROUND_ASSET_REQUIRED' };
    return { type: 'STATIC_IMAGE', assetId: opts.staticImageAssetId };
  }
  if (treatment === 'AI_GENERATED') return { error: 'BACKGROUND_UNSUPPORTED' };
  return { error: 'BACKGROUND_UNSUPPORTED' };
}

export function previewMatchesSelectedBackground(
  sidecar: { backgroundTreatment?: string; backgroundMode?: string; backgroundApprovalEligible?: boolean } | null,
  selected: string,
): boolean {
  if (!sidecar) return true;
  if (sidecar.backgroundMode === PLACEHOLDER_CONFIG.mode) return false;
  if (sidecar.backgroundApprovalEligible === false) return false;
  if (sidecar.backgroundTreatment && sidecar.backgroundTreatment !== selected) return false;
  return true;
}
