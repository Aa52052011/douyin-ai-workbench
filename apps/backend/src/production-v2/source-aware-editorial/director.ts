import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import { cropForScale } from '../editorial-shot-director/crop-for-scale.js';
import { buildNarrationUnits } from '../editorial-shot-director/narration-units.js';
import type { NarrationVisualUnitV1 } from '../editorial-shot-director/types.js';
import {
  BACKGROUND_COMPOSITION_VERSION,
  DOUYIN_MOBILE_SIMULATOR_VERSION,
} from '../editorial-shot-director/policy.js';
import type { NormalizedRect } from '../visual/geometry/types.js';
import {
  SOURCE_AWARE_EDITORIAL_DIRECTOR_VERSION,
  type ShotDecisionKindV2,
  type SourceVisualTypeV1,
} from './constants.js';
import { resolveSourceVisualType } from './source-type.js';
import { policyFor } from './policy.js';
import { CONTENT_01_CONTAINERS, contains } from './containers.js';
import { auditCropIntegrity, expandUntilIntegrity, type IntegrityResultV1 } from './integrity.js';
import { smartUiFit } from './smart-ui-fit.js';
import { reframeHasPositiveValue, valueOfBrokenUiCrop, type EditorialValueV1 } from './reframe-value.js';

export type SourceAwareShotDecisionV2 = {
  decision: ShotDecisionKindV2;
  reason: string;
  sourceType: SourceVisualTypeV1;
  narrationRefs: string[];
  claimRefs: string[];
  semanticContainerRef?: string;
  integrityResult: IntegrityResultV1;
  readabilityTarget: string;
  editorialValue: EditorialValueV1;
  warnings: string[];
  sourceStartMs: number;
  sourceEndMs: number;
  normalizedCrop: NormalizedRect;
  fitMode: 'CONTAIN' | 'COVER';
};

export type SourceAwareEditorialPlanV2 = {
  schemaVersion: typeof SOURCE_AWARE_EDITORIAL_DIRECTOR_VERSION;
  assetId: string;
  sourceVisualType: SourceVisualTypeV1;
  defaultStrategy: string;
  mediumIsDefault: false | boolean;
  shotQuota: 'REMOVED';
  coverage: { startMs: number; endMs: number; fullSource: boolean };
  simulator: { precision: 'APPROXIMATE_DOUYIN_MOBILE_VIEW'; modes: ['CLEAN_9_16', 'DOUYIN_APPROX'] };
  backgroundComposition: { schemaVersion: typeof BACKGROUND_COMPOSITION_VERSION; byScale: Record<string, string> };
  decisions: SourceAwareShotDecisionV2[];
  shots: SourceAwareShotDecisionV2[];
  warnings: string[];
  humanFeedbackPreserved: string[];
  provenance: { visionCalls: 0; llmCalls: 0; ffmpegCalls: 0; director: 'source-aware-editorial-v2' };
};

function sameCrop(a: NormalizedRect, b: NormalizedRect): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.width - b.width) < 1e-6 && Math.abs(a.height - b.height) < 1e-6;
}

export function directSourceAwareEditorialPlan(input?: {
  assetId?: string;
  durationMs?: number;
  units?: NarrationVisualUnitV1[];
}): SourceAwareEditorialPlanV2 {
  const assetId = input?.assetId ?? CONTENT_01_NEW_ASSET_ID;
  const durationMs = input?.durationMs ?? 35107;
  const units = input?.units ?? buildNarrationUnits({ durationMs });
  const source = resolveSourceVisualType({ assetId, humanSourceHint: 'SOFTWARE_OR_WEB_RECORDING' });
  const policy = policyFor(source.sourceVisualType);
  const wide = smartUiFit();
  const decisions: SourceAwareShotDecisionV2[] = [];

  for (const unit of units) {
    const start = unit.startMs ?? 0;
    const end = unit.endMs ?? durationMs;
    const previous = decisions[decisions.length - 1];
    const preferred = unit.preferredShotScale;
    let candidateScale: ShotDecisionKindV2 = 'WIDE_CONTEXT';
    let crop = wide.crop;
    let fitMode: 'CONTAIN' | 'COVER' = 'CONTAIN';
    let containerRef = wide.containerRef;
    let reason = 'WIDE_FIRST: keep complete UI unless a complete container reframe has positive editorial value';
    let value: EditorialValueV1 = {
      improvesComprehension: true,
      improvesClaimEvidence: policy.wholeUiIsPositiveEvidence,
      improvesReadability: false,
      improvesEmphasis: false,
    };

    if (policy.defaultStrategy === 'WIDE_FIRST' && (preferred === 'MEDIUM_FOCUS' || preferred === 'DETAIL_READABLE')) {
      const geo = cropForScale(preferred);
      const expanded = expandUntilIntegrity(geo.crop);
      const effectivelyWide = contains(expanded.crop, wide.crop) || sameCrop(expanded.crop, wide.crop);
      const integrity = expanded.integrity;
      const proposedValue = integrity.ok && !effectivelyWide
        ? {
            improvesComprehension: preferred === 'DETAIL_READABLE',
            improvesClaimEvidence: unit.readabilityRequirement === 'CLAIM_CRITICAL_READABLE',
            improvesReadability: preferred === 'DETAIL_READABLE',
            improvesEmphasis: true,
          }
        : valueOfBrokenUiCrop();
      if (!integrity.ok || effectivelyWide || !reframeHasPositiveValue(proposedValue)) {
        candidateScale = previous ? 'KEEP_CURRENT_COMPOSITION' : 'WIDE_CONTEXT';
        crop = previous?.normalizedCrop ?? wide.crop;
        fitMode = 'CONTAIN';
        reason = !integrity.ok
          ? `Reframe rejected (${integrity.codes.join(',')}): EXPAND_TO_SEMANTIC_CONTAINER then WIDE/KEEP fallback`
          : 'No positive editorial value versus staying on complete UI';
        value = valueOfBrokenUiCrop();
      } else {
        candidateScale = preferred;
        crop = expanded.crop;
        fitMode = geo.fitMode;
        containerRef = expanded.integrity.cutContainers[0] ?? geo.focusRegionRef;
        reason = `Complete container ${preferred} improves evidence`;
        value = proposedValue;
      }
    } else if (previous && sameCrop(previous.normalizedCrop, wide.crop)) {
      candidateScale = 'KEEP_CURRENT_COMPOSITION';
      crop = previous.normalizedCrop;
      reason = 'Current complete UI still matches narration; no forced cut per unit';
    }

    const integrity = auditCropIntegrity(crop);
    decisions.push({
      decision: candidateScale,
      reason,
      sourceType: source.sourceVisualType,
      narrationRefs: [unit.unitId],
      claimRefs: unit.claimRefs.filter((id) => id !== 'C5' && id !== 'C6'),
      semanticContainerRef: containerRef,
      integrityResult: integrity,
      readabilityTarget: candidateScale === 'DETAIL_READABLE' ? 'CLAIM_CRITICAL_READABLE' : candidateScale === 'MEDIUM_FOCUS' ? 'READABLE' : 'CONTEXT_ONLY',
      editorialValue: value,
      warnings: ['ESTIMATED_NARRATION_ALIGNMENT', ...(integrity.ok ? [] : integrity.codes)],
      sourceStartMs: start,
      sourceEndMs: end,
      normalizedCrop: crop,
      fitMode,
    });
  }

  const shots: SourceAwareShotDecisionV2[] = [];
  for (const item of decisions) {
    const last = shots[shots.length - 1];
    if (item.decision === 'KEEP_CURRENT_COMPOSITION' && last && sameCrop(last.normalizedCrop, item.normalizedCrop)) {
      last.sourceEndMs = item.sourceEndMs;
      last.narrationRefs = [...new Set([...last.narrationRefs, ...item.narrationRefs])];
      last.claimRefs = [...new Set([...last.claimRefs, ...item.claimRefs])].sort();
      continue;
    }
    if (last && item.decision !== 'KEEP_CURRENT_COMPOSITION' && sameCrop(last.normalizedCrop, item.normalizedCrop) && last.decision === item.decision) {
      last.sourceEndMs = item.sourceEndMs;
      last.narrationRefs = [...new Set([...last.narrationRefs, ...item.narrationRefs])];
      last.claimRefs = [...new Set([...last.claimRefs, ...item.claimRefs])].sort();
      continue;
    }
    shots.push({ ...item, narrationRefs: [...item.narrationRefs], claimRefs: [...item.claimRefs] });
  }
  if (shots.length) shots[shots.length - 1].sourceEndMs = durationMs;

  return {
    schemaVersion: SOURCE_AWARE_EDITORIAL_DIRECTOR_VERSION,
    assetId,
    sourceVisualType: source.sourceVisualType,
    defaultStrategy: policy.defaultStrategy,
    mediumIsDefault: policy.mediumIsDefault,
    shotQuota: 'REMOVED',
    coverage: { startMs: 0, endMs: durationMs, fullSource: true },
    simulator: {
      precision: 'APPROXIMATE_DOUYIN_MOBILE_VIEW',
      modes: ['CLEAN_9_16', 'DOUYIN_APPROX'],
    },
    backgroundComposition: {
      schemaVersion: BACKGROUND_COMPOSITION_VERSION,
      byScale: {
        WIDE_CONTEXT: 'BLUR_SOURCE_DARKENED',
        MEDIUM_FOCUS: 'BLUR_SOURCE_FRAMING',
        DETAIL_READABLE: 'OPTIONAL_NONE',
        KEEP_CURRENT_COMPOSITION: 'BLUR_SOURCE_DARKENED',
      },
    },
    decisions,
    shots,
    warnings: ['ESTIMATED_NARRATION_ALIGNMENT', 'NO_SHOT_QUOTA', 'WIDE_FIRST_SCREEN_RECORDING'],
    humanFeedbackPreserved: [
      'EDITORIAL_PREVIEW_BLANK_GAP',
      'MEDIUM_CROP_BREAKS_TEXT',
      'UI_SEMANTIC_CONTAINER_BROKEN',
      'SHOT_SCALE_QUOTA_OVER_CONTENT_QUALITY',
      'SCREEN_RECORDING_NEEDS_WIDE_FIRST_POLICY',
      'SOURCE_TYPE_AWARE_DIRECTION_REQUIRED',
    ],
    provenance: { visionCalls: 0, llmCalls: 0, ffmpegCalls: 0, director: 'source-aware-editorial-v2' },
  };
}

export function countDecisions(plan: SourceAwareEditorialPlanV2) {
  return {
    shotCount: plan.shots.length,
    wide: plan.shots.filter((item) => item.decision === 'WIDE_CONTEXT').length,
    medium: plan.shots.filter((item) => item.decision === 'MEDIUM_FOCUS').length,
    detail: plan.shots.filter((item) => item.decision === 'DETAIL_READABLE').length,
    keep: plan.decisions.filter((item) => item.decision === 'KEEP_CURRENT_COMPOSITION').length,
  };
}

export { CONTENT_01_CONTAINERS };
