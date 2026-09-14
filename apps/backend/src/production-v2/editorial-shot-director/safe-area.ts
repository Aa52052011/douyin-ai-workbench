import { DOUYIN_APPROX_OVERLAY } from './policy.js';
import { cropForScale } from './crop-for-scale.js';
import type { EditorialShotV1 } from './types.js';
import type { NormalizedRect } from '../visual/geometry/types.js';

const TEXT_REGION: NormalizedRect = { x: 0.22, y: 0.12, width: 0.4, height: 0.06 };

function mapSourcePointToFrame(point: { x: number; y: number }, crop: NormalizedRect, fitMode: 'CONTAIN' | 'COVER'): { x: number; y: number } {
  const nx = (point.x - crop.x) / crop.width;
  const ny = (point.y - crop.y) / crop.height;
  if (fitMode === 'COVER') return { x: nx, y: ny };
  const sourceAspect = 1920 / 1040;
  const targetAspect = 9 / 16;
  const letterbox = sourceAspect / targetAspect;
  const width = 1 / letterbox;
  const x0 = (1 - width) / 2;
  return { x: x0 + nx * width, y: ny };
}

export function auditShotSafeArea(shot: EditorialShotV1): { ok: boolean; warnings: string[] } {
  if (shot.readabilityTarget !== 'CLAIM_CRITICAL_READABLE' && shot.shotScale !== 'DETAIL_READABLE') {
    return { ok: true, warnings: [] };
  }
  const crop = shot.normalizedCrop;
  const center = mapSourcePointToFrame(
    { x: TEXT_REGION.x + TEXT_REGION.width / 2, y: TEXT_REGION.y + TEXT_REGION.height / 2 },
    crop,
    shot.fitMode,
  );
  const warnings: string[] = [];
  if (center.x > 1 - DOUYIN_APPROX_OVERLAY.rightRail) warnings.push('SAFE_AREA_RIGHT_RAIL');
  if (center.y > 1 - DOUYIN_APPROX_OVERLAY.bottomCaption) warnings.push('SAFE_AREA_BOTTOM_CAPTION');
  if (center.y < DOUYIN_APPROX_OVERLAY.topSafe && shot.shotScale === 'DETAIL_READABLE') {
    warnings.push('SAFE_AREA_TOP_MARGIN');
  }
  return { ok: warnings.length === 0, warnings };
}

export function auditPlanSafeArea(shots: readonly EditorialShotV1[]): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  for (const shot of shots) {
    const crop = cropForScale(shot.shotScale);
    void crop;
    const result = auditShotSafeArea(shot);
    warnings.push(...result.warnings.map((code) => `${shot.shotId}:${code}`));
  }
  return { ok: warnings.length === 0, warnings };
}
