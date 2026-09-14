import type { NormalizedRect } from '../geometry/types.js';
import { rectArea } from '../geometry/rects.js';

export function intersectNormalized(a: NormalizedRect, b: NormalizedRect): NormalizedRect | undefined {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return { x, y, width, height };
}

export function iouNormalized(a: NormalizedRect, b: NormalizedRect): number {
  const inter = intersectNormalized(a, b);
  if (!inter) {
    return 0;
  }
  const union = rectArea(a) + rectArea(b) - rectArea(inter);
  return union <= 0 ? 0 : rectArea(inter) / union;
}

export function clamp01(value: number): number {
  return Math.min(5, Math.max(0, value));
}

export function score01(value: number): number {
  return clamp01(5 * Math.min(1, Math.max(0, value)));
}
