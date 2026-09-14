import type { NormalizedRect, Rect, Size } from './types.js';

export type NormalizedRectValidation = {
  ok: boolean;
  errors: string[];
};

export function validateNormalizedRect(rect: NormalizedRect): NormalizedRectValidation {
  const errors: string[] = [];
  if (!Number.isFinite(rect.x) || rect.x < 0) {
    errors.push('x');
  }
  if (!Number.isFinite(rect.y) || rect.y < 0) {
    errors.push('y');
  }
  if (!Number.isFinite(rect.width) || rect.width <= 0) {
    errors.push('width');
  }
  if (!Number.isFinite(rect.height) || rect.height <= 0) {
    errors.push('height');
  }
  if (rect.x + rect.width > 1 + 1e-9) {
    errors.push('x+width');
  }
  if (rect.y + rect.height > 1 + 1e-9) {
    errors.push('y+height');
  }
  return { ok: errors.length === 0, errors };
}

/** Explicit clamp only. Do not call from Director/validator paths. */
export function clampNormalizedRect(rect: NormalizedRect): NormalizedRect {
  const x = Math.min(1, Math.max(0, rect.x));
  const y = Math.min(1, Math.max(0, rect.y));
  const width = Math.min(1 - x, Math.max(1e-9, rect.width));
  const height = Math.min(1 - y, Math.max(1e-9, rect.height));
  return { x, y, width, height };
}

export function normalizedRectToPixel(rect: NormalizedRect, source: Size): Rect {
  return {
    x: rect.x * source.width,
    y: rect.y * source.height,
    width: rect.width * source.width,
    height: rect.height * source.height,
  };
}

export function pixelRectToNormalized(rect: Rect, source: Size): NormalizedRect {
  return {
    x: source.width === 0 ? 0 : rect.x / source.width,
    y: source.height === 0 ? 0 : rect.y / source.height,
    width: source.width === 0 ? 0 : rect.width / source.width,
    height: source.height === 0 ? 0 : rect.height / source.height,
  };
}
