import { calculateContainScale, calculateCoverScale } from '../geometry/simulate-fit.js';
import { calculateRetainedAreaRatio } from '../geometry/rects.js';
import { validateNormalizedRect } from '../geometry/normalized-rect.js';
import type { FitMode, NormalizedRect } from '../geometry/types.js';
import type { PlatformAvoidRegion, PlatformConflict } from './crop.types.js';
import { intersectNormalized } from './rect-math.js';

export type WindowSimulation = {
  fitMode: FitMode;
  sourceRect: NormalizedRect;
  retainedAreaRatio: number;
  outputOccupancy: number;
  effectiveScale: number;
  renderedWidth: number;
  renderedHeight: number;
  destOnCanvas: NormalizedRect;
  letterbox: boolean;
  pillarbox: boolean;
};

export function simulateContainWindow(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  sourceRect: NormalizedRect,
): WindowSimulation {
  const check = validateNormalizedRect(sourceRect);
  if (!check.ok) {
    throw new Error(`INVALID_CROP_RECT:${check.errors.join(',')}`);
  }
  const cropW = sourceRect.width * sourceWidth;
  const cropH = sourceRect.height * sourceHeight;
  const scale = calculateContainScale(cropW, cropH, targetWidth, targetHeight);
  const renderedWidth = cropW * scale;
  const renderedHeight = cropH * scale;
  const destOnCanvas: NormalizedRect = {
    x: (targetWidth - renderedWidth) / 2 / targetWidth,
    y: (targetHeight - renderedHeight) / 2 / targetHeight,
    width: renderedWidth / targetWidth,
    height: renderedHeight / targetHeight,
  };
  return {
    fitMode: sourceRect.width === 1 && sourceRect.height === 1 ? 'CONTAIN' : 'CUSTOM',
    sourceRect,
    retainedAreaRatio: calculateRetainedAreaRatio(sourceRect),
    outputOccupancy: (renderedWidth * renderedHeight) / (targetWidth * targetHeight),
    effectiveScale: scale,
    renderedWidth,
    renderedHeight,
    destOnCanvas,
    letterbox: renderedHeight + 1e-6 < targetHeight,
    pillarbox: renderedWidth + 1e-6 < targetWidth,
  };
}

export function simulateCoverWindow(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  sourceRect: NormalizedRect,
): WindowSimulation {
  const check = validateNormalizedRect(sourceRect);
  if (!check.ok) {
    throw new Error(`INVALID_CROP_RECT:${check.errors.join(',')}`);
  }
  const scale = calculateCoverScale(
    sourceRect.width * sourceWidth,
    sourceRect.height * sourceHeight,
    targetWidth,
    targetHeight,
  );
  const visW = targetWidth / scale / sourceWidth;
  const visH = targetHeight / scale / sourceHeight;
  const visible: NormalizedRect = {
    x: sourceRect.x + (sourceRect.width - visW) / 2,
    y: sourceRect.y + (sourceRect.height - visH) / 2,
    width: visW,
    height: visH,
  };
  const visCheck = validateNormalizedRect(visible);
  if (!visCheck.ok) {
    throw new Error(`INVALID_CROP_RECT:${visCheck.errors.join(',')}`);
  }
  return {
    fitMode: 'COVER',
    sourceRect: visible,
    retainedAreaRatio: calculateRetainedAreaRatio(visible),
    outputOccupancy: 1,
    effectiveScale: scale,
    renderedWidth: targetWidth,
    renderedHeight: targetHeight,
    destOnCanvas: { x: 0, y: 0, width: 1, height: 1 },
    letterbox: false,
    pillarbox: false,
  };
}

export function evaluatePlatformConflicts(
  destOnCanvas: NormalizedRect,
  avoidRegions: PlatformAvoidRegion[],
): PlatformConflict[] {
  const conflicts: PlatformConflict[] = [];
  for (const region of avoidRegions) {
    const hit = intersectNormalized(destOnCanvas, region.rect);
    const overlapRatio = hit ? (hit.width * hit.height) / Math.max(1e-9, region.rect.width * region.rect.height) : 0;
    if (overlapRatio <= 0.02) {
      continue;
    }
    const severity = overlapRatio >= 0.5 ? 'HIGH' : overlapRatio >= 0.15 ? 'MEDIUM' : 'LOW';
    conflicts.push({
      regionType: region.regionType,
      overlapRatio,
      severity,
      reason: 'EXPOSES_CONTENT_INTO_AVOID_REGION',
    });
  }
  return conflicts;
}
