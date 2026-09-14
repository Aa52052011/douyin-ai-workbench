import { classifyOrientation } from './aspect-ratio.js';
import { validateNormalizedRect } from './normalized-rect.js';
import { calculateRetainedAreaRatio } from './rects.js';
import type { FitMode, NormalizedRect, Rect } from './types.js';

export type SimulateFitInput = {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  fitMode: FitMode;
  /** Normalized source-space crop. Required when fitMode is CUSTOM. Never silently clamped. */
  cropRect?: NormalizedRect;
};

export type SimulateFitResult = {
  fitMode: FitMode;
  effectiveScale: number;
  renderedWidth: number;
  renderedHeight: number;
  /** Visible region in source pixels. */
  visibleSourceRect: Rect;
  /** Same region in normalized source space. */
  visibleSourceNormalized: NormalizedRect;
  retainedAreaRatio: number;
  outputOccupancy: number;
  letterbox: boolean;
  pillarbox: boolean;
  /** Geometric proxy: output pixels per source pixel along the fitted axis. */
  estimatedDetailScale: number;
};

export function calculateContainScale(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): number {
  return Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
}

export function calculateCoverScale(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): number {
  return Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
}

/** Center COVER window in source pixels. Geometry only — not a recommended crop. */
export function calculateCenteredCoverRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Rect {
  const scale = calculateCoverScale(sourceWidth, sourceHeight, targetWidth, targetHeight);
  const visibleWidth = targetWidth / scale;
  const visibleHeight = targetHeight / scale;
  return {
    x: (sourceWidth - visibleWidth) / 2,
    y: (sourceHeight - visibleHeight) / 2,
    width: visibleWidth,
    height: visibleHeight,
  };
}

function assertPositiveSize(width: number, height: number, label: string): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`INVALID_MEDIA_DIMENSIONS:${label}`);
  }
}

export function simulateFit(input: SimulateFitInput): SimulateFitResult {
  assertPositiveSize(input.sourceWidth, input.sourceHeight, 'source');
  assertPositiveSize(input.targetWidth, input.targetHeight, 'target');

  if (input.fitMode === 'CUSTOM') {
    if (!input.cropRect) {
      throw new Error('INVALID_ASPECT_RATIO:CUSTOM_REQUIRES_CROP');
    }
    const check = validateNormalizedRect(input.cropRect);
    if (!check.ok) {
      throw new Error(`INVALID_ASPECT_RATIO:CROP_RECT:${check.errors.join(',')}`);
    }
    const cropW = input.cropRect.width * input.sourceWidth;
    const cropH = input.cropRect.height * input.sourceHeight;
    const scale = calculateCoverScale(cropW, cropH, input.targetWidth, input.targetHeight);
    const visible: Rect = {
      x: input.cropRect.x * input.sourceWidth,
      y: input.cropRect.y * input.sourceHeight,
      width: cropW,
      height: cropH,
    };
    const renderedWidth = cropW * scale;
    const renderedHeight = cropH * scale;
    const occupancy = Math.min(1, (Math.min(renderedWidth, input.targetWidth) * Math.min(renderedHeight, input.targetHeight)) / (input.targetWidth * input.targetHeight));
    return {
      fitMode: 'CUSTOM',
      effectiveScale: scale,
      renderedWidth: Math.min(renderedWidth, input.targetWidth),
      renderedHeight: Math.min(renderedHeight, input.targetHeight),
      visibleSourceRect: visible,
      visibleSourceNormalized: { ...input.cropRect },
      retainedAreaRatio: calculateRetainedAreaRatio(input.cropRect),
      outputOccupancy: occupancy,
      letterbox: renderedHeight + 1e-6 < input.targetHeight,
      pillarbox: renderedWidth + 1e-6 < input.targetWidth,
      estimatedDetailScale: scale,
    };
  }

  if (input.fitMode === 'CONTAIN') {
    const scale = calculateContainScale(input.sourceWidth, input.sourceHeight, input.targetWidth, input.targetHeight);
    const renderedWidth = input.sourceWidth * scale;
    const renderedHeight = input.sourceHeight * scale;
    const full: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };
    return {
      fitMode: 'CONTAIN',
      effectiveScale: scale,
      renderedWidth,
      renderedHeight,
      visibleSourceRect: { x: 0, y: 0, width: input.sourceWidth, height: input.sourceHeight },
      visibleSourceNormalized: full,
      retainedAreaRatio: 1,
      outputOccupancy: (renderedWidth * renderedHeight) / (input.targetWidth * input.targetHeight),
      letterbox: renderedHeight + 1e-6 < input.targetHeight,
      pillarbox: renderedWidth + 1e-6 < input.targetWidth,
      estimatedDetailScale: scale,
    };
  }

  const visible = calculateCenteredCoverRect(input.sourceWidth, input.sourceHeight, input.targetWidth, input.targetHeight);
  const scale = calculateCoverScale(input.sourceWidth, input.sourceHeight, input.targetWidth, input.targetHeight);
  const visibleNormalized: NormalizedRect = {
    x: visible.x / input.sourceWidth,
    y: visible.y / input.sourceHeight,
    width: visible.width / input.sourceWidth,
    height: visible.height / input.sourceHeight,
  };
  return {
    fitMode: 'COVER',
    effectiveScale: scale,
    renderedWidth: input.targetWidth,
    renderedHeight: input.targetHeight,
    visibleSourceRect: visible,
    visibleSourceNormalized: visibleNormalized,
    retainedAreaRatio: calculateRetainedAreaRatio(visibleNormalized),
    outputOccupancy: 1,
    letterbox: false,
    pillarbox: false,
    estimatedDetailScale: scale,
  };
}

export function sourceFitsPortraitCanvas(sourceWidth: number, sourceHeight: number): boolean {
  return classifyOrientation(sourceWidth, sourceHeight) === 'PORTRAIT';
}
