import type { SourceAwareEditorialPlanV2, SourceAwareShotDecisionV2 } from './director.js';
import { auditCropIntegrity } from './integrity.js';
import { smartUiFit } from './smart-ui-fit.js';
import type { ShotDecisionKindV2 } from './constants.js';

export type RuntimeTimelineSegmentV1 = {
  segmentId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  decision: ShotDecisionKindV2;
  compositionFrom: 'INITIAL_SMART_UI_FIT' | 'PREVIOUS_KEEP' | 'EXPLICIT_REFRAME';
  normalizedCrop: SourceAwareShotDecisionV2['normalizedCrop'];
  fitMode: 'CONTAIN' | 'COVER';
  backgroundTreatment: 'BLUR_SOURCE_DARKENED' | 'BLUR_SOURCE_FRAMING' | 'OPTIONAL_NONE';
  integrityOk: boolean;
  fallback: 'NONE' | 'SMART_UI_FIT_WIDE';
  reason: string;
  narrationRefs: string[];
};

export function mapPlanToRuntimeTimeline(plan: SourceAwareEditorialPlanV2): {
  decisionCount: number;
  keepCurrentCount: number;
  explicitReframeCount: number;
  timelineSegmentCount: number;
  renderedShotCount: number;
  coverage: { startMs: number; endMs: number; continuous: boolean };
  initialComposition: 'SMART_UI_FIT' | 'MISSING';
  segments: RuntimeTimelineSegmentV1[];
} {
  const fit = smartUiFit();
  const segments: RuntimeTimelineSegmentV1[] = [];
  for (const item of plan.decisions) {
    const last = segments[segments.length - 1];
    let crop = item.normalizedCrop;
    let fitMode = item.fitMode;
    let decision = item.decision;
    let compositionFrom: RuntimeTimelineSegmentV1['compositionFrom'] =
      item.decision === 'KEEP_CURRENT_COMPOSITION' ? 'PREVIOUS_KEEP' : item.decision === 'WIDE_CONTEXT' ? 'INITIAL_SMART_UI_FIT' : 'EXPLICIT_REFRAME';
    let fallback: RuntimeTimelineSegmentV1['fallback'] = 'NONE';
    if (!last && item.decision === 'KEEP_CURRENT_COMPOSITION') {
      crop = fit.crop;
      fitMode = 'CONTAIN';
      decision = 'WIDE_CONTEXT';
      compositionFrom = 'INITIAL_SMART_UI_FIT';
    }
    if (item.decision === 'KEEP_CURRENT_COMPOSITION' && last) {
      crop = last.normalizedCrop;
      fitMode = last.fitMode;
      compositionFrom = 'PREVIOUS_KEEP';
    }
    if (decision === 'MEDIUM_FOCUS' || decision === 'DETAIL_READABLE') {
      const integrity = auditCropIntegrity(crop);
      if (!integrity.ok) {
        crop = fit.crop;
        fitMode = 'CONTAIN';
        decision = 'WIDE_CONTEXT';
        fallback = 'SMART_UI_FIT_WIDE';
        compositionFrom = 'INITIAL_SMART_UI_FIT';
      }
    }
    const same =
      last &&
      Math.abs(last.normalizedCrop.x - crop.x) < 1e-6 &&
      Math.abs(last.normalizedCrop.width - crop.width) < 1e-6 &&
      last.fitMode === fitMode;
    if (same && last) {
      last.sourceEndMs = item.sourceEndMs;
      last.narrationRefs = [...new Set([...last.narrationRefs, ...item.narrationRefs])];
      continue;
    }
    segments.push({
      segmentId: `rt:${String(segments.length + 1).padStart(2, '0')}`,
      sourceStartMs: item.sourceStartMs,
      sourceEndMs: item.sourceEndMs,
      decision: decision === 'KEEP_CURRENT_COMPOSITION' ? 'WIDE_CONTEXT' : decision,
      compositionFrom,
      normalizedCrop: crop,
      fitMode,
      backgroundTreatment: decision === 'DETAIL_READABLE' ? 'OPTIONAL_NONE' : decision === 'MEDIUM_FOCUS' ? 'BLUR_SOURCE_FRAMING' : 'BLUR_SOURCE_DARKENED',
      integrityOk: auditCropIntegrity(crop).ok,
      fallback,
      reason: item.reason,
      narrationRefs: [...item.narrationRefs],
    });
  }
  if (segments.length) {
    segments[0].sourceStartMs = plan.coverage.startMs;
    segments[segments.length - 1].sourceEndMs = plan.coverage.endMs;
  }
  let cursor = plan.coverage.startMs;
  let continuous = segments.length > 0;
  for (const item of segments) {
    if (Math.abs(item.sourceStartMs - cursor) > 2) continuous = false;
    cursor = item.sourceEndMs;
  }
  if (Math.abs(cursor - plan.coverage.endMs) > 2) continuous = false;
  const keepCurrentCount = plan.decisions.filter((item) => item.decision === 'KEEP_CURRENT_COMPOSITION').length;
  const explicitReframeCount = plan.decisions.filter((item) => item.decision !== 'KEEP_CURRENT_COMPOSITION').length;
  return {
    decisionCount: plan.decisions.length,
    keepCurrentCount,
    explicitReframeCount,
    timelineSegmentCount: segments.length,
    renderedShotCount: segments.length,
    coverage: { startMs: plan.coverage.startMs, endMs: plan.coverage.endMs, continuous },
    initialComposition: segments[0] ? 'SMART_UI_FIT' : 'MISSING',
    segments,
  };
}
