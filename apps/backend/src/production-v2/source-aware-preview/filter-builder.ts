import type { EditorialShotV1 } from '../editorial-shot-director/types.js';
import { buildEditorialFilterGraph, editorialFfmpegArgs } from '../editorial-shot-runtime/filter-builder.js';
import type { RuntimeTimelineSegmentV1 } from '../source-aware-editorial/timeline.js';

export function segmentsToEditorialShots(segments: readonly RuntimeTimelineSegmentV1[]): EditorialShotV1[] {
  return segments.map((item) => ({
    shotId: item.segmentId,
    sourceStartMs: item.sourceStartMs,
    sourceEndMs: item.sourceEndMs,
    narrationUnitRefs: item.narrationRefs,
    claimRefs: ['C1'],
    shotScale: item.decision === 'MEDIUM_FOCUS' ? 'MEDIUM_FOCUS' : item.decision === 'DETAIL_READABLE' ? 'DETAIL_READABLE' : 'WIDE_CONTEXT',
    intent: item.decision,
    shotPurpose: item.reason,
    focusRegionRef: 'container:PAGE',
    normalizedCrop: item.normalizedCrop,
    fitMode: item.fitMode,
    readabilityTarget: 'CONTEXT_ONLY',
    backgroundTreatment: item.backgroundTreatment,
    transitionIn: 'CUT',
    transitionOut: 'HOLD',
    evidenceRefs: ['PRODUCT_UI'],
    safetyPrecision: 'ESTIMATED_ALIGNMENT',
    warnings: [],
    foregroundOccupancyBand: item.decision === 'MEDIUM_FOCUS' ? 'MEDIUM_FOCUS' : item.decision === 'DETAIL_READABLE' ? 'DETAIL_READABLE' : 'WIDE_CONTEXT',
  }));
}

export function buildSourceAwareFilterGraph(input: {
  segments: readonly RuntimeTimelineSegmentV1[];
  sourceWidth: number;
  sourceHeight: number;
}) {
  const shots = segmentsToEditorialShots(input.segments);
  return buildEditorialFilterGraph({ shots, sourceWidth: input.sourceWidth, sourceHeight: input.sourceHeight });
}

export { editorialFfmpegArgs as sourceAwareFfmpegArgs };
