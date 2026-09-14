import type { DynamicReframePlanV1, DynamicReframeSegmentV1 } from './types.js';
import { DYNAMIC_PREVIEW_RENDER_CONFIG } from './render-config.js';

export function validateDynamicPlan(plan: DynamicReframePlanV1): { ok: true } | { ok: false; code: string } {
  if (plan.schemaVersion !== DYNAMIC_PREVIEW_RENDER_CONFIG.planVersion) return { ok: false, code: 'PLAN_VERSION_MISMATCH' };
  if (!plan.segments.length) return { ok: false, code: 'EMPTY_PLAN' };
  if (plan.mobileReadabilityStandard !== 'DOUYIN_DEFAULT_MOBILE_VIEW') return { ok: false, code: 'STANDARD_MISMATCH' };
  let cursor = plan.coverage.startMs;
  for (const segment of plan.segments) {
    const check = validateSegment(segment);
    if (!check.ok) return check;
    if (segment.startMs < cursor - 1) return { ok: false, code: 'ILLEGAL_OVERLAP' };
    if (segment.startMs > cursor + 1) return { ok: false, code: 'UNEXPLAINED_GAP' };
    cursor = segment.endMs;
    if (segment.endMs - segment.startMs < 1000) return { ok: false, code: 'MECHANICAL_REFRAME' };
  }
  if (Math.abs(cursor - plan.coverage.endMs) > 2) return { ok: false, code: 'COVERAGE_MISMATCH' };
  return { ok: true };
}

export function validateSegment(segment: DynamicReframeSegmentV1): { ok: true } | { ok: false; code: string } {
  if (!(segment.startMs < segment.endMs)) return { ok: false, code: 'INVALID_TIME_RANGE' };
  if (segment.safetyPrecision !== 'SAMPLED') return { ok: false, code: 'PRECISION_NOT_SAMPLED' };
  if (!segment.focusRegionRef) return { ok: false, code: 'MISSING_FOCUS_REGION' };
  if (!segment.targetReadability) return { ok: false, code: 'MISSING_READABILITY_TARGET' };
  const rect = segment.cropRectNormalized;
  if (!rect || rect.width <= 0 || rect.height <= 0) return { ok: false, code: 'INVALID_CROP_RECT' };
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > 1 + 1e-6 || rect.y + rect.height > 1 + 1e-6) {
    return { ok: false, code: 'CROP_OUT_OF_BOUNDS' };
  }
  if (segment.claimRefs.includes('C5') || segment.claimRefs.includes('C6')) return { ok: false, code: 'C5_C6_CLAIM_BOOST' };
  return { ok: true };
}
