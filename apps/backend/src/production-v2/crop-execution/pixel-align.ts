import type { PixelCropRect } from './execution-plan.types.js';

export class ExecutionGeometryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ExecutionGeometryError';
    this.code = code;
  }
}

export function assertPixelCrop(rect: PixelCropRect, sourceWidth: number, sourceHeight: number): void {
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (values.some((item) => !Number.isFinite(item))) {
    throw new ExecutionGeometryError('NAN', 'crop rect contains NaN/Infinity');
  }
  if (rect.x < 0 || rect.y < 0) throw new ExecutionGeometryError('NEGATIVE', 'crop origin negative');
  if (rect.width <= 0 || rect.height <= 0) throw new ExecutionGeometryError('NON_POSITIVE', 'crop size must be > 0');
  if (rect.x + rect.width > sourceWidth || rect.y + rect.height > sourceHeight) {
    throw new ExecutionGeometryError('OUT_OF_BOUNDS', 'crop exceeds source; no silent clamp');
  }
}

/** Even-dimension alignment: at most 1px inward. */
export function alignEvenPixelCrop(
  rect: PixelCropRect,
  sourceWidth: number,
  sourceHeight: number,
): { rect: PixelCropRect; adjusted: boolean } {
  assertPixelCrop(rect, sourceWidth, sourceHeight);
  let { x, y, width, height } = rect;
  let adjusted = false;
  if (width % 2 === 1) {
    width -= 1;
    adjusted = true;
  }
  if (height % 2 === 1) {
    height -= 1;
    adjusted = true;
  }
  const aligned = { x, y, width, height };
  assertPixelCrop(aligned, sourceWidth, sourceHeight);
  return { rect: aligned, adjusted };
}
