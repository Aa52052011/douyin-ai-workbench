import type { NormalizedRect, Point, Rect } from './types.js';

export function rectArea(rect: Rect | NormalizedRect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

export function calculateRetainedAreaRatio(visible: NormalizedRect): number {
  return Math.min(1, Math.max(0, rectArea(visible)));
}

export function rectCenter(rect: Rect | NormalizedRect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function intersectRects(a: Rect, b: Rect): Rect | undefined {
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

export function containsRect(outer: Rect, inner: Rect, epsilon = 1e-9): boolean {
  return (
    inner.x >= outer.x - epsilon &&
    inner.y >= outer.y - epsilon &&
    inner.x + inner.width <= outer.x + outer.width + epsilon &&
    inner.y + inner.height <= outer.y + outer.height + epsilon
  );
}

export function scaleRect(rect: Rect, scale: number): Rect {
  return {
    x: rect.x * scale,
    y: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

export function translateRect(rect: Rect, dx: number, dy: number): Rect {
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height };
}
