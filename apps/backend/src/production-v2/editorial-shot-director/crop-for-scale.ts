import { normalizeToTargetAspect } from '../visual-crop-candidate/aspect-normalize.js';
import type { GeometryProfile } from '../visual-hybrid/hybrid.types.js';
import type { NormalizedRect } from '../visual/geometry/types.js';
import type { EditorialShotScale } from './policy.js';
import { EDITORIAL_SHOT_POLICY } from './policy.js';

const PRODUCT_UI: NormalizedRect = { x: 0.085, y: 0.106, width: 0.82, height: 0.894 };
const NAVIGATION: NormalizedRect = { x: 0.085, y: 0.106, width: 0.14, height: 0.72 };
const CONTENT_PANEL: NormalizedRect = { x: 0.24, y: 0.28, width: 0.66, height: 0.7 };
const TEXT_REGION: NormalizedRect = { x: 0.22, y: 0.12, width: 0.4, height: 0.06 };

function union(a: NormalizedRect, b: NormalizedRect): NormalizedRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: x2 - x, height: y2 - y };
}

function pad(rect: NormalizedRect, amount: number): NormalizedRect {
  const x = Math.max(0, rect.x - rect.width * amount);
  const y = Math.max(0, rect.y - rect.height * amount);
  const x2 = Math.min(1, rect.x + rect.width * (1 + amount));
  const y2 = Math.min(1, rect.y + rect.height * (1 + amount));
  return { x, y, width: x2 - x, height: y2 - y };
}

const PROFILE: GeometryProfile = { sourceWidth: 1920, sourceHeight: 1040, targetWidth: 720, targetHeight: 1280 };

export function cropForScale(scale: EditorialShotScale): { crop: NormalizedRect; fitMode: 'CONTAIN' | 'COVER'; focusRegionRef: string } {
  if (scale === 'WIDE_CONTEXT') {
    return { crop: PRODUCT_UI, fitMode: 'CONTAIN', focusRegionRef: 'region:PRODUCT_UI' };
  }
  if (scale === 'MEDIUM_FOCUS') {
    const seed = pad(union(NAVIGATION, CONTENT_PANEL), 0.04);
    return {
      crop: normalizeToTargetAspect(seed, PROFILE, []).rect,
      fitMode: 'COVER',
      focusRegionRef: 'region:NAVIGATION+CONTENT_PANEL',
    };
  }
  return {
    crop: normalizeToTargetAspect(pad(TEXT_REGION, 0.35), PROFILE, []).rect,
    fitMode: 'COVER',
    focusRegionRef: 'region:TEXT_REGION',
  };
}

export function occupancyForScale(scale: EditorialShotScale): number {
  const { crop, fitMode } = cropForScale(scale);
  if (fitMode === 'CONTAIN') {
    const sourceAspect = 1920 / 1040;
    const targetAspect = 720 / 1280;
    return sourceAspect > targetAspect ? targetAspect / sourceAspect : sourceAspect / targetAspect;
  }
  return 1;
}

export function occupancyInBand(scale: EditorialShotScale): boolean {
  const wideArea = PRODUCT_UI.width * PRODUCT_UI.height;
  const mediumArea = cropForScale('MEDIUM_FOCUS').crop.width * cropForScale('MEDIUM_FOCUS').crop.height;
  const detailArea = cropForScale('DETAIL_READABLE').crop.width * cropForScale('DETAIL_READABLE').crop.height;
  if (scale === 'WIDE_CONTEXT') {
    const value = occupancyForScale('WIDE_CONTEXT');
    return value >= EDITORIAL_SHOT_POLICY.occupancy.WIDE_CONTEXT.min && value <= EDITORIAL_SHOT_POLICY.occupancy.WIDE_CONTEXT.max;
  }
  if (scale === 'MEDIUM_FOCUS') return mediumArea < wideArea && mediumArea > detailArea;
  return detailArea < mediumArea;
}
