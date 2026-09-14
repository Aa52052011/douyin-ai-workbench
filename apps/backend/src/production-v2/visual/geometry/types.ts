export type Size = {
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type NormalizedPoint = {
  x: number;
  y: number;
};

/** Pixel-space rectangle. Origin top-left. */
export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Source-space rectangle. x,y,width,height in 0–1 relative to source size. */
export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FitMode = 'CONTAIN' | 'COVER' | 'CUSTOM';

export type MediaOrientation = 'PORTRAIT' | 'LANDSCAPE' | 'SQUARE' | 'OTHER';
