import type { MediaOrientation } from './types.js';

const SQUARE_EPSILON = 1e-6;

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

export function getAspectRatio(width: number, height: number): {
  width: number;
  height: number;
  ratio: number;
  simplified: string;
} | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  const divisor = gcd(width, height);
  return {
    width,
    height,
    ratio: width / height,
    simplified: `${Math.round(width) / divisor}:${Math.round(height) / divisor}`,
  };
}

export function classifyOrientation(width: number, height: number): MediaOrientation {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'OTHER';
  }
  if (Math.abs(width - height) / Math.max(width, height) < SQUARE_EPSILON) {
    return 'SQUARE';
  }
  return width > height ? 'LANDSCAPE' : 'PORTRAIT';
}

export function normalizeAspect(width: number, height: number): { numerator: number; denominator: number } | undefined {
  const aspect = getAspectRatio(width, height);
  if (!aspect) {
    return undefined;
  }
  const [numerator, denominator] = aspect.simplified.split(':').map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return undefined;
  }
  return { numerator, denominator };
}
