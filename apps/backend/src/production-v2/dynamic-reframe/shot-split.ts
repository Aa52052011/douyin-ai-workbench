import type { GeometryProfile } from '../visual-hybrid/hybrid.types.js';
import type { NormalizedRect } from '../visual/geometry/types.js';
import { normalizeToTargetAspect } from '../visual-crop-candidate/aspect-normalize.js';
import type { DynamicReframePlanV1, DynamicReframeSegmentV1, ReframeIntent } from './types.js';
import { FROZEN_TEXT_REGION } from './render-config.js';

export type RuntimeShot = {
  shotId: string;
  sourceSegmentId: string;
  startMs: number;
  endMs: number;
  intent: ReframeIntent;
  cropRectNormalized: NormalizedRect;
  fitMode: 'COVER' | 'CONTAIN';
  targetReadability: DynamicReframeSegmentV1['targetReadability'];
  shotSplit: boolean;
};

function coverForBand(seed: NormalizedRect, profile: GeometryProfile): NormalizedRect {
  return normalizeToTargetAspect(seed, profile, []).rect;
}

/** Runtime expansion only. Does not rewrite the persisted 5-segment plan. */
export function expandRuntimeShots(plan: DynamicReframePlanV1, profile: GeometryProfile): RuntimeShot[] {
  const shots: RuntimeShot[] = [];
  for (const segment of plan.segments) {
    if (segment.requestShotSplit) {
      if (segment.intent !== 'FOCUS_TEXT') {
        throw new Error('SHOT_SPLIT_UNSUPPORTED');
      }
      const mid = Math.round((segment.startMs + segment.endMs) / 2);
      const left: NormalizedRect = {
        x: FROZEN_TEXT_REGION.x,
        y: FROZEN_TEXT_REGION.y,
        width: FROZEN_TEXT_REGION.width / 2,
        height: FROZEN_TEXT_REGION.height,
      };
      const right: NormalizedRect = {
        x: FROZEN_TEXT_REGION.x + FROZEN_TEXT_REGION.width / 2,
        y: FROZEN_TEXT_REGION.y,
        width: FROZEN_TEXT_REGION.width / 2,
        height: FROZEN_TEXT_REGION.height,
      };
      shots.push({
        shotId: `${segment.segmentId}:split-a`,
        sourceSegmentId: segment.segmentId,
        startMs: segment.startMs,
        endMs: mid,
        intent: segment.intent,
        cropRectNormalized: coverForBand(left, profile),
        fitMode: 'COVER',
        targetReadability: segment.targetReadability,
        shotSplit: true,
      });
      shots.push({
        shotId: `${segment.segmentId}:split-b`,
        sourceSegmentId: segment.segmentId,
        startMs: mid,
        endMs: segment.endMs,
        intent: segment.intent,
        cropRectNormalized: coverForBand(right, profile),
        fitMode: 'COVER',
        targetReadability: segment.targetReadability,
        shotSplit: true,
      });
      continue;
    }
    shots.push({
      shotId: segment.segmentId,
      sourceSegmentId: segment.segmentId,
      startMs: segment.startMs,
      endMs: segment.endMs,
      intent: segment.intent,
      cropRectNormalized: { ...segment.cropRectNormalized },
      fitMode: segment.fitMode,
      targetReadability: segment.targetReadability,
      shotSplit: false,
    });
  }
  return shots;
}

export function textFocusLargerThanContext(plan: DynamicReframePlanV1, shots: readonly RuntimeShot[]): boolean {
  const context = plan.segments.find((item) => item.intent === 'ESTABLISH_CONTEXT');
  const textShots = shots.filter((item) => item.intent === 'FOCUS_TEXT');
  if (!context || !textShots.length) return false;
  const contextArea = context.cropRectNormalized.width * context.cropRectNormalized.height;
  return textShots.every((shot) => shot.cropRectNormalized.width * shot.cropRectNormalized.height <= contextArea * 0.85);
}
