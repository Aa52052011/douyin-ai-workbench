import type { GeometryProfile } from '../visual-hybrid/hybrid.types.js';
import type { NormalizedRect } from '../visual/geometry/types.js';

export function even(value: number): number {
  return value - (value % 2);
}

export function pixelCropFromNormalized(rect: NormalizedRect, sourceWidth: number, sourceHeight: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let x = even(Math.max(0, Math.round(rect.x * sourceWidth)));
  let y = even(Math.max(0, Math.round(rect.y * sourceHeight)));
  let width = even(Math.max(2, Math.round(rect.width * sourceWidth)));
  let height = even(Math.max(2, Math.round(rect.height * sourceHeight)));
  if (x + width > sourceWidth) width = even(sourceWidth - x);
  if (y + height > sourceHeight) height = even(sourceHeight - y);
  if (width < 2) width = 2;
  if (height < 2) height = 2;
  return { x, y, width, height };
}

export function relativeComposition(rect: NormalizedRect, source: { width: number; height: number }, target: { width: number; height: number }) {
  const pixel = pixelCropFromNormalized(rect, source.width, source.height);
  return {
    xRatio: pixel.x / source.width,
    yRatio: pixel.y / source.height,
    wRatio: pixel.width / source.width,
    hRatio: pixel.height / source.height,
    target,
  };
}

export function compositionsMatch(
  rect: NormalizedRect,
  source: { width: number; height: number },
  preview: { width: number; height: number },
  production: { width: number; height: number },
): boolean {
  const a = relativeComposition(rect, source, preview);
  const b = relativeComposition(rect, source, production);
  return (
    Math.abs(a.xRatio - b.xRatio) < 1e-9 &&
    Math.abs(a.yRatio - b.yRatio) < 1e-9 &&
    Math.abs(a.wRatio - b.wRatio) < 1e-9 &&
    Math.abs(a.hRatio - b.hRatio) < 1e-9
  );
}

export function profileFromSource(sourceWidth: number, sourceHeight: number): GeometryProfile {
  return { sourceWidth, sourceHeight, targetWidth: 720, targetHeight: 1280 };
}
