import type { NormalizedRect } from '../visual/geometry/types.js';
import type { ReadabilityTarget } from '../dynamic-reframe/types.js';
import type { EditorialShotScale } from './policy.js';
import {
  BACKGROUND_COMPOSITION_VERSION,
  DOUYIN_MOBILE_SIMULATOR_VERSION,
  EDITORIAL_SHOT_PLAN_VERSION,
  NARRATION_VISUAL_UNIT_VERSION,
} from './policy.js';

export type NarrationVisualUnitV1 = {
  schemaVersion: typeof NARRATION_VISUAL_UNIT_VERSION;
  unitId: string;
  startMs?: number;
  endMs?: number;
  textRef: string;
  summary: string;
  claimRefs: string[];
  requiredEvidenceRefs: string[];
  preferredShotScale?: EditorialShotScale;
  readabilityRequirement: ReadabilityTarget;
  contextNeed: 'ESTABLISH' | 'MAINTAIN' | 'RECOVER' | 'CLOSE';
  provenance: {
    source: 'FROZEN_SCRIPT_BEATS' | 'FROZEN_SCRIPT_SECTIONS';
    timingPrecision: 'ESTIMATED_ALIGNMENT' | 'SAMPLED';
    frameAccurate: false;
  };
};

export type EditorialShotV1 = {
  shotId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  narrationUnitRefs: string[];
  claimRefs: string[];
  shotScale: EditorialShotScale;
  intent: string;
  shotPurpose: string;
  focusRegionRef: string;
  normalizedCrop: NormalizedRect;
  fitMode: 'CONTAIN' | 'COVER';
  readabilityTarget: ReadabilityTarget;
  backgroundTreatment: 'BLUR_SOURCE_DARKENED' | 'BLUR_SOURCE_FRAMING' | 'OPTIONAL_NONE';
  transitionIn: 'CUT' | 'HOLD' | 'SHORT_EASED_ZOOM' | 'SHORT_EASED_PAN';
  transitionOut: 'CUT' | 'HOLD';
  contextRecoveryReason?: string;
  evidenceRefs: string[];
  safetyPrecision: 'SAMPLED' | 'ESTIMATED_ALIGNMENT';
  warnings: string[];
  foregroundOccupancyBand: EditorialShotScale;
};

export type EditorialShotPlanV1 = {
  schemaVersion: typeof EDITORIAL_SHOT_PLAN_VERSION;
  assetId: string;
  mobileReadabilityStandard: 'DOUYIN_DEFAULT_MOBILE_VIEW';
  simulator: {
    schemaVersion: typeof DOUYIN_MOBILE_SIMULATOR_VERSION;
    precision: 'APPROXIMATE_DOUYIN_MOBILE_VIEW';
    modes: ['CLEAN_9_16', 'DOUYIN_APPROX'];
  };
  backgroundComposition: {
    schemaVersion: typeof BACKGROUND_COMPOSITION_VERSION;
    byScale: Record<EditorialShotScale, string>;
  };
  coverage: { startMs: number; endMs: number; fullSource: boolean };
  shots: EditorialShotV1[];
  warnings: string[];
  humanFeedbackPreserved: string[];
  provenance: { visionCalls: 0; llmCalls: 0; ffmpegCalls: 0; director: 'deterministic-editorial-v1' };
};
