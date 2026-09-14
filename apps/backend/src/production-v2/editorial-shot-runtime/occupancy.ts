import type { EditorialShotV1 } from '../editorial-shot-director/types.js';
import { EDITORIAL_PREVIEW_RENDER_CONFIG as C } from './render-config.js';

function containOccupancy(crop: { width: number; height: number }, sourceW: number, sourceH: number): number {
  const cropW = crop.width * sourceW;
  const cropH = crop.height * sourceH;
  const scale = Math.min(C.reviewWidth / cropW, C.reviewHeight / cropH);
  return (cropW * scale * cropH * scale) / (C.reviewWidth * C.reviewHeight);
}

export function overlayOccupancy(shot: EditorialShotV1, sourceW = 1920, sourceH = 1040): number {
  if (shot.shotScale === 'DETAIL_READABLE') return 1;
  if (shot.shotScale === 'MEDIUM_FOCUS') return C.mediumOverlay * C.mediumOverlay;
  return containOccupancy(shot.normalizedCrop, sourceW, sourceH);
}

export function occupancyHierarchy(shots: readonly EditorialShotV1[], sourceW = 1920, sourceH = 1040): {
  ok: boolean;
  wide: number;
  medium: number;
  detail: number;
} {
  const wide = shots.filter((item) => item.shotScale === 'WIDE_CONTEXT').map((item) => overlayOccupancy(item, sourceW, sourceH));
  const medium = shots.filter((item) => item.shotScale === 'MEDIUM_FOCUS').map((item) => overlayOccupancy(item, sourceW, sourceH));
  const detail = shots.filter((item) => item.shotScale === 'DETAIL_READABLE').map((item) => overlayOccupancy(item, sourceW, sourceH));
  const w = Math.min(...wide);
  const m = Math.min(...medium);
  const d = Math.min(...detail);
  return { ok: w < m && m < d, wide: w, medium: m, detail: d };
}
