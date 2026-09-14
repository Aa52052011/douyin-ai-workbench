import type { HybridVisualRegion } from '../visual-hybrid/hybrid.types.js';
import type { NormalizedRect } from '../visual/geometry/types.js';
import { coverageOf, unionRects } from './rect-math.js';

export function regionsWithRect(regions: readonly HybridVisualRegion[]): HybridVisualRegion[] {
  return regions.filter((item) => item.rect);
}

export function meanCoverage(crop: NormalizedRect, regions: readonly HybridVisualRegion[]): number | null {
  const usable = regions.filter((item) => item.rect);
  if (usable.length === 0) return null;
  const sum = usable.reduce((acc, item) => acc + coverageOf(crop, item.rect!), 0);
  return sum / usable.length;
}

export function minCoverage(crop: NormalizedRect, regions: readonly HybridVisualRegion[]): number | null {
  const usable = regions.filter((item) => item.rect);
  if (usable.length === 0) return null;
  return Math.min(...usable.map((item) => coverageOf(crop, item.rect!)));
}

export function coverageByType(crop: NormalizedRect, regions: readonly HybridVisualRegion[], type: string): number | null {
  return meanCoverage(
    crop,
    regions.filter((item) => item.semanticType === type),
  );
}

export function evidenceRegions(regions: readonly HybridVisualRegion[]): HybridVisualRegion[] {
  return regions.filter((item) => item.flags.evidenceBearing && item.semanticType !== 'PRODUCT_UI');
}

export function computeSemanticEnvelope(regions: readonly HybridVisualRegion[]): {
  rect: NormalizedRect | null;
  regionIds: string[];
} {
  const usable = regionsWithRect(regions);
  const rect = unionRects(usable.map((item) => item.rect!));
  return { rect, regionIds: usable.map((item) => item.id) };
}
