import { intersectNormalized, iouNormalized } from '../../visual/crop/rect-math.js';
import { rectArea } from '../../visual/geometry/rects.js';
import type { NormalizedRect } from '../../visual/geometry/types.js';

export const REGION_RELATIONSHIP_CONFIG = {
  iouDisjoint: 0.05,
  containmentRatio: 0.8,
  iouNearDuplicate: 0.85,
  iouConflict: 0.5,
  adjacentGap: 0.03,
} as const;

export type RegionRelationshipKind =
  | 'DISJOINT'
  | 'ADJACENT'
  | 'OVERLAPPING'
  | 'CONTAINS'
  | 'CONTAINED_BY'
  | 'NEAR_DUPLICATE_REGION';

export type RegionRelationshipResult = {
  relationship: RegionRelationshipKind;
  iou: number;
  intersectionRatioA: number;
  intersectionRatioB: number;
  edgeGap: number;
};

const EXCLUSIVE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['BROWSER_CHROME', 'NAVIGATION'],
  ['BROWSER_CHROME', 'PRODUCT_UI'],
  ['OS_CHROME', 'NAVIGATION'],
];

function intervalGap(a0: number, a1: number, b0: number, b1: number): number {
  if (a1 < b0) return b0 - a1;
  if (b1 < a0) return a0 - b1;
  return 0;
}

export function edgeGapNormalized(a: NormalizedRect, b: NormalizedRect): number {
  const gx = intervalGap(a.x, a.x + a.width, b.x, b.x + b.width);
  const gy = intervalGap(a.y, a.y + a.height, b.y, b.y + b.height);
  if (gx === 0 && gy === 0) return 0;
  if (gx > 0 && gy > 0) return Math.hypot(gx, gy);
  return gx + gy;
}

export function classifyRegionRelationship(a: NormalizedRect, b: NormalizedRect): RegionRelationshipResult {
  const iou = iouNormalized(a, b);
  const inter = intersectNormalized(a, b);
  const areaA = rectArea(a);
  const areaB = rectArea(b);
  const interArea = inter ? rectArea(inter) : 0;
  const intersectionRatioA = areaA > 0 ? interArea / areaA : 0;
  const intersectionRatioB = areaB > 0 ? interArea / areaB : 0;
  const gap = edgeGapNormalized(a, b);
  const base = { iou, intersectionRatioA, intersectionRatioB, edgeGap: gap };

  if (iou >= REGION_RELATIONSHIP_CONFIG.iouNearDuplicate) {
    return { ...base, relationship: 'NEAR_DUPLICATE_REGION' };
  }
  if (intersectionRatioB >= REGION_RELATIONSHIP_CONFIG.containmentRatio && areaA >= areaB) {
    return { ...base, relationship: 'CONTAINS' };
  }
  if (intersectionRatioA >= REGION_RELATIONSHIP_CONFIG.containmentRatio && areaB >= areaA) {
    return { ...base, relationship: 'CONTAINED_BY' };
  }
  if (inter && iou >= REGION_RELATIONSHIP_CONFIG.iouDisjoint) {
    return { ...base, relationship: 'OVERLAPPING' };
  }
  if (!inter && gap <= REGION_RELATIONSHIP_CONFIG.adjacentGap) {
    return { ...base, relationship: 'ADJACENT' };
  }
  return { ...base, relationship: 'DISJOINT' };
}

export function typesMutuallyExclusive(typeA: string, typeB: string): boolean {
  return EXCLUSIVE_PAIRS.some(
    ([left, right]) => (typeA === left && typeB === right) || (typeA === right && typeB === left),
  );
}

export function isSemanticRegionConflictCandidate(input: {
  typeA: string;
  typeB: string;
  relationship: RegionRelationshipKind;
  iou: number;
}): boolean {
  if (!typesMutuallyExclusive(input.typeA, input.typeB)) return false;
  if (
    input.relationship === 'CONTAINS' ||
    input.relationship === 'CONTAINED_BY' ||
    input.relationship === 'ADJACENT' ||
    input.relationship === 'DISJOINT'
  ) {
    return false;
  }
  return input.iou >= REGION_RELATIONSHIP_CONFIG.iouConflict;
}
