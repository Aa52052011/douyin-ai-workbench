import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import {
  BACKGROUND_COMPOSITION_VERSION,
  DOUYIN_MOBILE_SIMULATOR_VERSION,
  EDITORIAL_SHOT_PLAN_VERSION,
  EDITORIAL_SHOT_POLICY,
  type EditorialShotScale,
} from './policy.js';
import { cropForScale } from './crop-for-scale.js';
import { buildNarrationUnits } from './narration-units.js';
import { auditShotSafeArea } from './safe-area.js';
import { requiresContextRecovery } from './validator.js';
import type { EditorialShotPlanV1, EditorialShotV1, NarrationVisualUnitV1 } from './types.js';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function backgroundFor(scale: EditorialShotScale): EditorialShotV1['backgroundTreatment'] {
  return EDITORIAL_SHOT_POLICY.backgroundByScale[scale];
}

function emit(input: {
  index: number;
  start: number;
  end: number;
  scale: EditorialShotScale;
  unit: NarrationVisualUnitV1;
  purpose: string;
  intent: string;
  recovery?: string;
}): EditorialShotV1 {
  const geo = cropForScale(input.scale);
  const shot: EditorialShotV1 = {
    shotId: `ed:${String(input.index).padStart(2, '0')}:${input.scale}`,
    sourceStartMs: input.start,
    sourceEndMs: input.end,
    narrationUnitRefs: [input.unit.unitId],
    claimRefs: input.unit.claimRefs.filter((id) => id !== 'C5' && id !== 'C6'),
    shotScale: input.scale,
    intent: input.intent,
    shotPurpose: input.purpose,
    focusRegionRef: geo.focusRegionRef,
    normalizedCrop: geo.crop,
    fitMode: geo.fitMode,
    readabilityTarget: EDITORIAL_SHOT_POLICY.readabilityByScale[input.scale],
    backgroundTreatment: backgroundFor(input.scale),
    transitionIn: input.scale === 'DETAIL_READABLE' ? 'SHORT_EASED_ZOOM' : 'CUT',
    transitionOut: 'HOLD',
    contextRecoveryReason: input.recovery,
    evidenceRefs: input.unit.requiredEvidenceRefs,
    safetyPrecision: 'ESTIMATED_ALIGNMENT',
    warnings: ['ESTIMATED_NARRATION_ALIGNMENT', 'SAMPLED_VISUAL_EVIDENCE'],
    foregroundOccupancyBand: input.scale,
  };
  if (input.scale === 'DETAIL_READABLE') {
    shot.warnings.push('TEXT_SPLIT_SUPERSEDED_BY_MEDIUM_PLUS_DETAIL');
  }
  const safe = auditShotSafeArea(shot);
  shot.warnings.push(...safe.warnings);
  return shot;
}

export function directEditorialShotPlan(input?: {
  assetId?: string;
  durationMs?: number;
  units?: NarrationVisualUnitV1[];
}): EditorialShotPlanV1 {
  const durationMs = input?.durationMs ?? 35107;
  const units = input?.units ?? buildNarrationUnits({ durationMs });
  const shots: EditorialShotV1[] = [];
  let lastScale: EditorialShotScale | null = null;
  let consecutiveDetail = 0;
  let continuousDetailMs = 0;

  const push = (shot: EditorialShotV1) => {
    if (shot.shotScale === 'DETAIL_READABLE') {
      consecutiveDetail += 1;
      continuousDetailMs += shot.sourceEndMs - shot.sourceStartMs;
    } else {
      consecutiveDetail = 0;
      continuousDetailMs = 0;
    }
    lastScale = shot.shotScale;
    shots.push(shot);
  };

  const wouldOveruseDetail = (extraMs: number) =>
    consecutiveDetail + 1 > EDITORIAL_SHOT_POLICY.maxConsecutiveDetailShots ||
    continuousDetailMs + extraMs > EDITORIAL_SHOT_POLICY.maxContinuousDetailDurationMs;

  for (const unit of units) {
    const start = unit.startMs ?? 0;
    const end = unit.endMs ?? durationMs;
    let cursor = start;
    const span = end - start;

    if (unit.contextNeed === 'ESTABLISH') {
      const wideMs = clamp(EDITORIAL_SHOT_POLICY.establishingWideMs, 1000, Math.min(3000, span));
      push(
        emit({
          index: shots.length + 1,
          start: cursor,
          end: cursor + wideMs,
          scale: 'WIDE_CONTEXT',
          unit,
          purpose: 'Establish product identity / full workbench',
          intent: 'ESTABLISH_CONTEXT',
        }),
      );
      cursor += wideMs;
      if (end - cursor >= 1200) {
        push(
          emit({
            index: shots.length + 1,
            start: cursor,
            end,
            scale: 'MEDIUM_FOCUS',
            unit,
            purpose: 'Show workbench modules after identity establish',
            intent: 'FOCUS_PRODUCT_UI',
          }),
        );
      }
      continue;
    }

    if (unit.contextNeed === 'RECOVER' || unit.contextNeed === 'CLOSE') {
      const wideMs = clamp(Math.min(span, 2800), 1000, 3000);
      push(
        emit({
          index: shots.length + 1,
          start: cursor,
          end: cursor + wideMs,
          scale: 'WIDE_CONTEXT',
          unit,
          purpose: unit.contextNeed === 'CLOSE' ? 'Return to product context for close' : 'Recover spatial context between function beats',
          intent: 'RETURN_TO_CONTEXT',
          recovery: lastScale === 'DETAIL_READABLE' ? 'AFTER_DETAIL_PUNCH_IN' : 'CHAPTER_BREATH',
        }),
      );
      cursor += wideMs;
      if (end - cursor >= 1500) {
        push(
          emit({
            index: shots.length + 1,
            start: cursor,
            end,
            scale: 'MEDIUM_FOCUS',
            unit,
            purpose: 'Hold medium context after wide recovery',
            intent: 'FOCUS_PRODUCT_UI',
          }),
        );
      }
      continue;
    }

    if (unit.readabilityRequirement === 'CLAIM_CRITICAL_READABLE') {
      const detailMs = clamp(2800, 1500, Math.min(4000, span));
      if (wouldOveruseDetail(detailMs) && end - cursor - detailMs >= 1500) {
        push(
          emit({
            index: shots.length + 1,
            start: cursor,
            end: cursor + 2000,
            scale: 'MEDIUM_FOCUS',
            unit,
            purpose: 'Context recovery before claim-critical punch-in',
            intent: 'RETURN_TO_CONTEXT',
            recovery: 'MAX_CONSECUTIVE_DETAIL_GUARD',
          }),
        );
        cursor += 2000;
      }
      if (cursor < end && !wouldOveruseDetail(detailMs)) {
        const detailEnd = Math.min(end, cursor + detailMs);
        push(
          emit({
            index: shots.length + 1,
            start: cursor,
            end: detailEnd,
            scale: 'DETAIL_READABLE',
            unit,
            purpose: 'Punch-in on claim-critical text / workflow labels',
            intent: 'FOCUS_TEXT',
          }),
        );
        cursor = detailEnd;
      }
      if (end - cursor >= 1500) {
        push(
          emit({
            index: shots.length + 1,
            start: cursor,
            end,
            scale: 'MEDIUM_FOCUS',
            unit,
            purpose: 'Return to spatial context after text evidence',
            intent: 'FOCUS_PRODUCT_UI',
            recovery: 'AFTER_DETAIL_PUNCH_IN',
          }),
        );
      }
      continue;
    }

    push(
      emit({
        index: shots.length + 1,
        start: cursor,
        end,
        scale: EDITORIAL_SHOT_POLICY.defaultScale,
        unit,
        purpose: 'Default medium: keep page relationship while focusing the function area',
        intent: 'FOCUS_PRODUCT_UI',
      }),
    );
  }

  while (shots.length > EDITORIAL_SHOT_POLICY.suggestedShotCount.max) {
    const idx = shots.findIndex((item, index) => index > 0 && item.shotScale === 'MEDIUM_FOCUS' && shots[index - 1].shotScale === 'MEDIUM_FOCUS');
    if (idx < 1) break;
    const prev = shots[idx - 1];
    const cur = shots[idx];
    shots.splice(idx - 1, 2, {
      ...prev,
      sourceEndMs: cur.sourceEndMs,
      narrationUnitRefs: [...new Set([...prev.narrationUnitRefs, ...cur.narrationUnitRefs])],
      claimRefs: [...new Set([...prev.claimRefs, ...cur.claimRefs])].sort(),
      evidenceRefs: [...new Set([...prev.evidenceRefs, ...cur.evidenceRefs])],
    });
  }
  shots.forEach((item, index) => {
    item.shotId = `ed:${String(index + 1).padStart(2, '0')}:${item.shotScale}`;
  });
  if (shots.length) {
    shots[shots.length - 1].sourceEndMs = durationMs;
  }

  const warnings: string[] = ['ESTIMATED_NARRATION_ALIGNMENT', 'NO_FRAME_ACCURATE_AUDIO_TIMELINE'];
  if (requiresContextRecovery(shots)) warnings.push('DETAIL_OVERUSE_WARNING');
  if (shots.some((item) => item.warnings.includes('SAFE_AREA_RIGHT_RAIL') || item.warnings.includes('SAFE_AREA_BOTTOM_CAPTION'))) {
    warnings.push('SAFE_AREA_RISK');
  }

  return {
    schemaVersion: EDITORIAL_SHOT_PLAN_VERSION,
    assetId: input?.assetId ?? CONTENT_01_NEW_ASSET_ID,
    mobileReadabilityStandard: 'DOUYIN_DEFAULT_MOBILE_VIEW',
    simulator: {
      schemaVersion: DOUYIN_MOBILE_SIMULATOR_VERSION,
      precision: 'APPROXIMATE_DOUYIN_MOBILE_VIEW',
      modes: ['CLEAN_9_16', 'DOUYIN_APPROX'],
    },
    backgroundComposition: {
      schemaVersion: BACKGROUND_COMPOSITION_VERSION,
      byScale: { ...EDITORIAL_SHOT_POLICY.backgroundByScale },
    },
    coverage: { startMs: 0, endMs: durationMs, fullSource: true },
    shots,
    warnings,
    humanFeedbackPreserved: [
      'READABILITY_IMPROVED',
      'DETAIL_OVERUSED',
      'CONTEXT_INSUFFICIENT',
      'NARRATION_ALIGNMENT_INSUFFICIENT',
      'BACKGROUND_UNDERUSED',
    ],
    provenance: { visionCalls: 0, llmCalls: 0, ffmpegCalls: 0, director: 'deterministic-editorial-v1' },
  };
}
