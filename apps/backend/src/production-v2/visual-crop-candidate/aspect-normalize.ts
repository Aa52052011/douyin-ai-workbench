import type { GeometryProfile, HybridVisualRegion } from '../visual-hybrid/hybrid.types.js';
import type { NormalizedRect } from '../visual/geometry/types.js';
import { CROP_SAFETY_THRESHOLDS } from './threshold-config.js';
import { clampRectToUnit, coverageOf, targetNormalizedAspect } from './rect-math.js';

function centroid(regions: readonly HybridVisualRegion[]): { x: number; y: number } | null {
  const usable = regions.filter((item) => item.rect);
  if (usable.length === 0) return null;
  let ax = 0;
  let ay = 0;
  let area = 0;
  for (const item of usable) {
    const rect = item.rect!;
    const a = rect.width * rect.height;
    ax += (rect.x + rect.width / 2) * a;
    ay += (rect.y + rect.height / 2) * a;
    area += a;
  }
  if (area <= 0) return null;
  return { x: ax / area, y: ay / area };
}

/** Expand/shrink to target 9:16. Prefer expansion; crop only after hitting source bounds. */
export function normalizeToTargetAspect(
  seed: NormalizedRect,
  profile: GeometryProfile,
  anchorRegions: readonly HybridVisualRegion[],
): { rect: NormalizedRect; aspectHandling: 'CROP_TO_ASPECT' | 'PAD_TO_ASPECT' | 'ALREADY_MATCHES'; padRequired: boolean } {
  const target = targetNormalizedAspect(profile);
  const current = seed.width / seed.height;
  if (Math.abs(current - target) < 1e-6) {
    return { rect: seed, aspectHandling: 'ALREADY_MATCHES', padRequired: false };
  }
  const anchor = centroid(anchorRegions) ?? { x: seed.x + seed.width / 2, y: seed.y + seed.height / 2 };

  if (current > target) {
    const neededH = seed.width / target;
    if (neededH <= 1 + 1e-9) {
      let y = anchor.y - neededH / 2;
      y = Math.min(Math.max(0, y), 1 - neededH);
      return { rect: { x: seed.x, y, width: seed.width, height: neededH }, aspectHandling: 'CROP_TO_ASPECT', padRequired: false };
    }
    const width = seed.height * target;
    let x = anchor.x - width / 2;
    x = Math.min(Math.max(seed.x, x), seed.x + seed.width - width);
    x = Math.min(Math.max(0, x), 1 - width);
    return { rect: { x, y: seed.y, width, height: seed.height }, aspectHandling: 'CROP_TO_ASPECT', padRequired: false };
  }

  const neededW = seed.height * target;
  if (neededW <= 1 + 1e-9) {
    let x = anchor.x - neededW / 2;
    x = Math.min(Math.max(0, x), 1 - neededW);
    return { rect: { x, y: seed.y, width: neededW, height: seed.height }, aspectHandling: 'CROP_TO_ASPECT', padRequired: false };
  }
  return { rect: seed, aspectHandling: 'PAD_TO_ASPECT', padRequired: true };
}

export function expandToCoverage(
  seed: NormalizedRect,
  regions: readonly HybridVisualRegion[],
  minCoverage: number = CROP_SAFETY_THRESHOLDS.shouldKeepMin,
): NormalizedRect {
  let x = seed.x;
  let y = seed.y;
  let x2 = seed.x + seed.width;
  let y2 = seed.y + seed.height;
  for (const region of regions) {
    if (!region.rect) continue;
    const current = { x, y, width: x2 - x, height: y2 - y };
    if (coverageOf(current, region.rect) >= minCoverage) continue;
    x = Math.min(x, region.rect.x);
    y = Math.min(y, region.rect.y);
    x2 = Math.max(x2, region.rect.x + region.rect.width);
    y2 = Math.max(y2, region.rect.y + region.rect.height);
  }
  return clampRectToUnit({ x, y, width: x2 - x, height: y2 - y });
}
