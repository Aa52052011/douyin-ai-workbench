import type { GeometryProfile } from '../visual-hybrid/hybrid.types.js';
import type { NormalizedRect, Rect } from '../visual/geometry/types.js';
import { CropRectValidationError } from './crop-candidate.types.js';

export function assertValidNormalizedRect(rect: NormalizedRect, label = 'rect'): void {
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (values.some((item) => !Number.isFinite(item))) {
    throw new CropRectValidationError('NAN_OR_INFINITE', `${label} contains NaN/Infinity`);
  }
  if (rect.width <= 0 || rect.height <= 0) {
    throw new CropRectValidationError('NON_POSITIVE_SIZE', `${label} width/height must be > 0`);
  }
  if (rect.x < 0 || rect.y < 0) {
    throw new CropRectValidationError('NEGATIVE_ORIGIN', `${label} origin is negative`);
  }
  if (rect.x + rect.width > 1 + 1e-12 || rect.y + rect.height > 1 + 1e-12) {
    throw new CropRectValidationError('OUT_OF_BOUNDS', `${label} exceeds unit square`);
  }
}

export function rectArea(rect: NormalizedRect): number {
  return rect.width * rect.height;
}

export function intersectRects(a: NormalizedRect, b: NormalizedRect): NormalizedRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const width = x2 - x;
  const height = y2 - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

export function containsRect(outer: NormalizedRect, inner: NormalizedRect, epsilon = 1e-9): boolean {
  return (
    inner.x + epsilon >= outer.x &&
    inner.y + epsilon >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width + epsilon &&
    inner.y + inner.height <= outer.y + outer.height + epsilon
  );
}

export function coverageOf(crop: NormalizedRect, region: NormalizedRect): number {
  const inter = intersectRects(crop, region);
  if (!inter) return 0;
  const area = rectArea(region);
  if (area <= 0) return 0;
  return rectArea(inter) / area;
}

export function rectsIou(a: NormalizedRect, b: NormalizedRect): number {
  const inter = intersectRects(a, b);
  if (!inter) return 0;
  const union = rectArea(a) + rectArea(b) - rectArea(inter);
  return union <= 0 ? 0 : rectArea(inter) / union;
}

export function unionRects(rects: readonly NormalizedRect[]): NormalizedRect | null {
  if (rects.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const rect of rects) {
    x1 = Math.min(x1, rect.x);
    y1 = Math.min(y1, rect.y);
    x2 = Math.max(x2, rect.x + rect.width);
    y2 = Math.max(y2, rect.y + rect.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function clampRectToUnit(rect: NormalizedRect): NormalizedRect {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const x2 = Math.min(1, rect.x + rect.width);
  const y2 = Math.min(1, rect.y + rect.height);
  if (x2 <= x || y2 <= y) {
    throw new CropRectValidationError('CLAMP_EMPTY', 'explicit bound clip produced empty rect');
  }
  return { x, y, width: x2 - x, height: y2 - y };
}

export function targetNormalizedAspect(profile: GeometryProfile): number {
  return (profile.targetWidth / profile.targetHeight) * (profile.sourceHeight / profile.sourceWidth);
}

export function retainedAreaRatio(crop: NormalizedRect): number {
  return rectArea(crop);
}

export function occupancyForContain(crop: NormalizedRect, profile: GeometryProfile): number {
  const pixelW = crop.width * profile.sourceWidth;
  const pixelH = crop.height * profile.sourceHeight;
  const scale = Math.min(profile.targetWidth / pixelW, profile.targetHeight / pixelH);
  const outW = pixelW * scale;
  const outH = pixelH * scale;
  return (outW * outH) / (profile.targetWidth * profile.targetHeight);
}

export function toPixelRect(norm: NormalizedRect, profile: GeometryProfile): Rect {
  assertValidNormalizedRect(norm, 'normalizedCropRect');
  const x = Math.round(norm.x * profile.sourceWidth);
  const y = Math.round(norm.y * profile.sourceHeight);
  const x2 = Math.round((norm.x + norm.width) * profile.sourceWidth);
  const y2 = Math.round((norm.y + norm.height) * profile.sourceHeight);
  const pixel: Rect = { x, y, width: x2 - x, height: y2 - y };
  if (pixel.width <= 0 || pixel.height <= 0) {
    throw new CropRectValidationError('PIXEL_EMPTY', 'pixel rect has non-positive size');
  }
  if (pixel.x < 0 || pixel.y < 0 || pixel.x + pixel.width > profile.sourceWidth || pixel.y + pixel.height > profile.sourceHeight) {
    throw new CropRectValidationError('PIXEL_OUT_OF_BOUNDS', 'pixel rect exceeds source; no silent clamp');
  }
  return pixel;
}

export function centerCoverRect(profile: GeometryProfile): NormalizedRect {
  const sourceAspect = profile.sourceWidth / profile.sourceHeight;
  const targetAspect = profile.targetWidth / profile.targetHeight;
  let width = 1;
  let height = 1;
  let x = 0;
  let y = 0;
  if (sourceAspect > targetAspect) {
    width = (profile.sourceHeight * targetAspect) / profile.sourceWidth;
    x = (1 - width) / 2;
  } else if (sourceAspect < targetAspect) {
    height = profile.sourceWidth / targetAspect / profile.sourceHeight;
    y = (1 - height) / 2;
  }
  const rect = { x, y, width, height };
  assertValidNormalizedRect(rect, 'centerCover');
  return rect;
}

export function fullSourceRect(): NormalizedRect {
  return { x: 0, y: 0, width: 1, height: 1 };
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
