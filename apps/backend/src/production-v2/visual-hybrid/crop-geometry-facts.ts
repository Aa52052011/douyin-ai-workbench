import type { GeometryCandidateSummary, GeometryProfile } from './hybrid.types.js';

export function coverRetainedAreaRatio(profile: GeometryProfile): number {
  const sourceAspect = profile.sourceWidth / profile.sourceHeight;
  const targetAspect = profile.targetWidth / profile.targetHeight;
  if (sourceAspect > targetAspect) {
    return (profile.sourceHeight * targetAspect) / profile.sourceWidth;
  }
  return profile.sourceWidth / targetAspect / profile.sourceHeight;
}

export function containOccupancy(profile: GeometryProfile): number {
  const scale = Math.min(profile.targetWidth / profile.sourceWidth, profile.targetHeight / profile.sourceHeight);
  const outW = profile.sourceWidth * scale;
  const outH = profile.sourceHeight * scale;
  return (outW * outH) / (profile.targetWidth * profile.targetHeight);
}

export function buildGeometryCandidates(profile: GeometryProfile): GeometryCandidateSummary[] {
  const retainedCover = coverRetainedAreaRatio(profile);
  const occupancyContain = containOccupancy(profile);
  return [
    {
      id: 'geom:center-cover',
      type: 'CENTER',
      fitMode: 'COVER',
      retainedAreaRatio: retainedCover,
      outputOccupancy: 1,
      source: 'DETERMINISTIC_FACT',
      note: 'NOT_FINAL_DIRECTOR_SELECTION',
    },
    {
      id: 'geom:contain',
      type: 'CONTAIN',
      fitMode: 'CONTAIN',
      retainedAreaRatio: 1,
      outputOccupancy: occupancyContain,
      source: 'DETERMINISTIC_FACT',
      note: 'NOT_FINAL_DIRECTOR_SELECTION',
    },
  ];
}

export const RULE_CENTER_COVER_EVIDENCE_LOSS = 'RULE_CENTER_COVER_LOW_RETAINED_AREA';
export const RULE_CONTAIN_READABILITY = 'RULE_CONTAIN_LOW_OCCUPANCY_READABILITY';
export const RULE_CHROME_PREFER_EXCLUDE = 'RULE_BROWSER_CHROME_PREFER_EXCLUDE';
export const RULE_LOCALHOST_PREFER_EXCLUDE = 'RULE_LOCALHOST_PREFER_EXCLUDE';
export const RULE_PRODUCT_SHOULD_KEEP = 'RULE_PRODUCT_UI_SHOULD_KEEP';
export const RULE_NAV_SHOULD_KEEP = 'RULE_NAVIGATION_SHOULD_KEEP';
export const RULE_NO_MUST_KEEP_UNVALIDATED_CLAIM = 'RULE_NO_MUST_KEEP_FOR_UNSUPPORTED_CLAIM';
export const RULE_STALE_BLOCK = 'RULE_STALE_MOCK_PRODUCTION_BLOCK';
export const RULE_OVERRIDE_NO_BYPASS = 'RULE_OVERRIDE_CANNOT_BYPASS_HARD_BLOCK';
