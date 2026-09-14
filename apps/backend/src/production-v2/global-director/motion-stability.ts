export const MOTION_STABILITY_VERSION = 'director.motion-stability:v1' as const;

export const UI_DEMO_SURFACES = [
  'SCREEN_RECORDING_UI_DEMO',
  'PRODUCT_UI_DEMO',
  'DASHBOARD_DEMO',
  'SOFTWARE_TUTORIAL',
  'SCREENSHOT_MOTION',
] as const;

export const FORBIDDEN_UI_DEMO_MOTION = [
  'CONTINUOUS_MICRO_ZOOM',
  'CONTINUOUS_MICRO_PAN',
  'SUBPIXEL_DRIFT',
  'FRAME_BY_FRAME_CROP_WOBBLE',
  'UNNECESSARY_CAMERA_FLOAT',
  'HANDHELD_SIMULATION',
  'RANDOMIZED_MOTION',
  'OSCILLATING_REFRAME',
] as const;

/** Exact O2G opening filter (B2-15O2G screenshotArgs). Do not treat as guess. */
export const O2G_OPENING_ZOOMPAN_EXPR =
  "zoompan=z='min(1.05,1+0.0003*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";

export const MICRO_SCALE_DELTA = 0.002;
export const MICRO_PIXEL_DELTA = 1;
export const AFFECTED_RANGE_MS = { startMs: 5_000, endMs: 15_000 } as const;
export const OPENING_RANGE_MS = { startMs: 5_960, endMs: 14_312 } as const;

export type MotionBudgetV1 = 'STATIC' | 'LOW' | 'MEDIUM' | 'HIGH';
export type StabilityGateStatusV1 =
  | 'PASS'
  | 'PASS_WITH_LIMITATIONS'
  | 'REJECT_MICRO_JITTER'
  | 'REJECT_MICRO_DRIFT'
  | 'REJECT_OSCILLATION'
  | 'REJECT_UNJUSTIFIED_MOTION';

export type MotionSampleV1 = { frame: number; scale: number; cropX: number; cropY: number };

export type DirectorMotionDecisionV1 = {
  shotId: string;
  sourceType: (typeof UI_DEMO_SURFACES)[number] | string;
  motionRequired: boolean;
  semanticPurpose: string;
  motionType: 'STATIC_HOLD' | 'SINGLE_SMOOTH_ZOOM' | 'SINGLE_SMOOTH_PAN' | 'DELIBERATE_CUT' | 'FORBIDDEN';
  startMs: number;
  endMs: number;
  startCrop: { x: number; y: number; width: number; height: number };
  endCrop: { x: number; y: number; width: number; height: number };
  startScale: number;
  endScale: number;
  easing: 'none' | 'ease-in-out';
  pixelSnap: boolean;
  microMotionAllowed: false;
  stabilityPriority: 'UI_DEMO_STABILITY_FIRST';
  motionBudget: MotionBudgetV1;
  reason: string;
};

export function directorMotionBoundaryPolicy() {
  return {
    schemaVersion: 'director.motion-boundary-policy:v1',
    principle: 'UI_DEMO_STABILITY_FIRST',
    rank: ['UI_READABILITY', 'SEMANTIC_EXPRESSION', 'STABILITY', 'NECESSARY_MOTION', 'DECORATIVE_MOTION'],
    forbidden: [...FORBIDDEN_UI_DEMO_MOTION],
    allowed: [
      'STATIC_HOLD',
      'DELIBERATE_CUT',
      'SINGLE_SMOOTH_ZOOM',
      'SINGLE_SMOOTH_PAN',
      'FOCUS_TRANSITION',
      'SHORT_EASED_REFRAME',
      'SECTION_CHANGE_TRANSITION',
    ],
    noDecorativeMicroMotion: 'NO_DECORATIVE_MICRO_MOTION_IN_UI_DEMOS',
    motionRequiresSemanticPurpose: true,
    ifSemanticPurposeNone: 'FORBIDDEN',
    appliesTo: [...UI_DEMO_SURFACES],
    globalNotContent01Only: true,
  };
}

export function uiDemoMotionStabilityPolicy() {
  return {
    schemaVersion: 'ui-demo.motion-stability-policy:v1',
    defaultMotionRequired: false,
    screenRecordingUiDemoDefault: { motionRequired: false, budget: 'STATIC' as MotionBudgetV1 },
    granularity: 'ZERO_OR_ONE_PRIMARY_MOTION_PER_SHOT',
    stableHoldWhenUiAlreadyInformative: true,
    doNotStabilizeByBlur: true,
    doNotUseGenericHandheldStabilizerFirst: true,
  };
}

export function stableCropPolicy() {
  return {
    schemaVersion: 'stable.crop-policy:v1',
    whenSemanticTargetUnchanged: 'FIXED_CROP_RECTANGLE',
    forbidPerFrameCropCenterNudge: true,
    pixelAlignment: 'INTEGER_OR_EVEN_GRID',
  };
}

export function motionQuantizationPolicy() {
  return {
    schemaVersion: 'motion.quantization-policy:v1',
    integerPixelSnap: true,
    minMeaningfulDeltaPx: MICRO_PIXEL_DELTA,
    minMeaningfulDeltaScale: MICRO_SCALE_DELTA,
    microMotionNoSemanticValue: 'REJECT',
    easing: 'ease-in-out',
    forbidOscillationBounceOvershoot: true,
  };
}

export function motionBudgetPolicy() {
  return {
    schemaVersion: 'motion.budget-policy:v1',
    uiDemoDefault: 'STATIC_OR_LOW' as const,
    vocabulary: ['STATIC', 'LOW', 'MEDIUM', 'HIGH'] as MotionBudgetV1[],
    highRequiresExplicitReason: true,
    screenRecordingUiDemoHighDefaultForbidden: true,
  };
}

export function snapEvenPixel(value: number): number {
  const rounded = Math.round(value);
  return rounded - (rounded % 2);
}

export function simulateO2gOpeningZoompan(frames: number, iw = 1080, ih = 1920): MotionSampleV1[] {
  const samples: MotionSampleV1[] = [];
  for (let on = 0; on < frames; on += 1) {
    const scale = Math.min(1.05, 1 + 0.0003 * on);
    samples.push({
      frame: on,
      scale,
      cropX: iw / 2 - iw / scale / 2,
      cropY: ih / 2 - ih / scale / 2,
    });
  }
  return samples;
}

export function simulateStaticHold(frames: number): MotionSampleV1[] {
  return Array.from({ length: frames }, (_, frame) => ({ frame, scale: 1, cropX: 0, cropY: 0 }));
}

export function analyzeMotionSamples(samples: MotionSampleV1[]) {
  const scaleDeltas: number[] = [];
  const cropDeltas: number[] = [];
  let directionReversals = 0;
  let prevSign = 0;
  let microDeltaCount = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const ds = samples[i].scale - samples[i - 1].scale;
    const dx = samples[i].cropX - samples[i - 1].cropX;
    const dy = samples[i].cropY - samples[i - 1].cropY;
    const dist = Math.hypot(dx, dy);
    scaleDeltas.push(ds);
    cropDeltas.push(dist);
    const moving = Math.abs(ds) > 1e-12 || dist > 1e-12;
    const micro =
      moving && Math.abs(ds) < MICRO_SCALE_DELTA && dist < MICRO_PIXEL_DELTA;
    if (micro) microDeltaCount += 1;
    const sign = Math.sign(dx) || Math.sign(dy);
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) directionReversals += 1;
    if (sign !== 0) prevSign = sign;
  }
  const median = (arr: number[]) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? 0;
  };
  const variance = (arr: number[]) => {
    if (!arr.length) return 0;
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  };
  return {
    frameCount: samples.length,
    motionEventCount: cropDeltas.filter((d) => d > 1e-9).length,
    largestCropDelta: cropDeltas.reduce((a, b) => Math.max(a, b), 0),
    medianCropDelta: median(cropDeltas),
    cropVariance: variance(cropDeltas),
    scaleVariance: variance(scaleDeltas),
    largestScaleDelta: scaleDeltas.reduce((a, b) => Math.max(a, Math.abs(b)), 0),
    medianScaleDelta: median(scaleDeltas.map(Math.abs)),
    directionReversals,
    microDeltaCount,
    start: samples[0] ?? null,
    end: samples[samples.length - 1] ?? null,
  };
}

export function evaluateUiDemoMotionStabilityGate(input: {
  samples: MotionSampleV1[];
  decision: DirectorMotionDecisionV1;
}): { status: StabilityGateStatusV1; metrics: ReturnType<typeof analyzeMotionSamples>; reason: string } {
  const metrics = analyzeMotionSamples(input.samples);
  if (input.decision.motionBudget === 'HIGH' && !input.decision.reason) {
    return { status: 'REJECT_UNJUSTIFIED_MOTION', metrics, reason: 'HIGH_MOTION_WITHOUT_REASON' };
  }
  if (!input.decision.motionRequired && input.decision.semanticPurpose === 'NONE') {
    if (metrics.directionReversals > 0) return { status: 'REJECT_OSCILLATION', metrics, reason: 'DIRECTION_REVERSAL' };
    if (metrics.microDeltaCount > 8 && metrics.largestCropDelta < MICRO_PIXEL_DELTA) {
      return { status: 'REJECT_MICRO_JITTER', metrics, reason: 'MICRO_MOTION_NO_SEMANTIC_VALUE' };
    }
    if (metrics.motionEventCount > 8 && (input.samples.at(-1)?.cropX ?? 0) !== (input.samples[0]?.cropX ?? 0)) {
      return { status: 'REJECT_MICRO_DRIFT', metrics, reason: 'CONTINUOUS_CROP_ORIGIN_CREEP' };
    }
  }
  if (metrics.microDeltaCount === 0 && metrics.cropVariance === 0 && metrics.scaleVariance === 0) {
    return { status: 'PASS', metrics, reason: 'STATIC_HOLD' };
  }
  return { status: 'PASS_WITH_LIMITATIONS', metrics, reason: 'NONZERO_BUT_GATED' };
}

export function openingRepairDecision(): DirectorMotionDecisionV1 {
  return {
    shotId: 'slot:opening',
    sourceType: 'SCREENSHOT_MOTION',
    motionRequired: false,
    semanticPurpose: 'NONE',
    motionType: 'STATIC_HOLD',
    startMs: OPENING_RANGE_MS.startMs,
    endMs: OPENING_RANGE_MS.endMs,
    startCrop: { x: 0, y: 0, width: 1080, height: 1920 },
    endCrop: { x: 0, y: 0, width: 1080, height: 1920 },
    startScale: 1,
    endScale: 1,
    easing: 'none',
    pixelSnap: true,
    microMotionAllowed: false,
    stabilityPriority: 'UI_DEMO_STABILITY_FIRST',
    motionBudget: 'STATIC',
    reason: 'UI already informative; decorative Ken Burns zoompan forbidden',
  };
}

export function buildScreenshotStaticHoldFilter(width: number, height: number, durSec: number): string {
  const w = snapEvenPixel(width);
  const h = snapEvenPixel(height);
  return `scale=${w}:${h}:flags=lanczos:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,trim=duration=${durSec.toFixed(3)}[outv]`;
}

export function auditVerticalMotionRootCause() {
  const frames = Math.max(2, Math.round(((OPENING_RANGE_MS.endMs - OPENING_RANGE_MS.startMs) / 1000) * 30));
  const before = analyzeMotionSamples(simulateO2gOpeningZoompan(frames));
  return {
    schemaVersion: 'vertical.motion-root-cause-audit:v1',
    affectedHumanRangeMs: AFFECTED_RANGE_MS,
    primaryShot: 'slot:opening',
    primaryShotRangeMs: OPENING_RANGE_MS,
    checks: {
      perFrameCropX: 'DERIVED_FROM_ZOOMPAN_X_EXPR',
      perFrameCropY: 'DERIVED_FROM_ZOOMPAN_Y_EXPR',
      perFrameScale: "min(1.05,1+0.0003*on)",
      zoompanExpression: O2G_OPENING_ZOOMPAN_EXPR,
      panExpression: "x='iw/2-(iw/zoom/2)'; y='ih/2-(ih/zoom/2)'",
      keyframeInterpolation: 'ZOOMPAN_EVERY_OUTPUT_FRAME',
      subpixelCoordinateMovement: true,
      sourceSegmentBoundary: 'OPENING_SCREENSHOT_NOT_RECORDING_CUT_INTERIOR',
      reframeCenterShift: true,
      shotTransitionAlignment: 'CUT_AT_5.960_AND_14.312',
      sourceUiNativeMotion: 'NOT_APPLICABLE_STILL_IMAGE',
      secondaryMotionOverlay: 'NONE_BESIDES_ZOOMPAN',
      fpsResamplingInteraction: 'ZOOMPAN_FPS_30_MATCHES_OUTPUT',
    },
    rootCause:
      'O2G opening SCREENSHOT_MOTION used continuous Ken Burns zoompan (z=min(1.05,1+0.0003*on)) producing per-frame micro-scale and sub-pixel crop-origin drift across ~5960–14312ms, which sits inside the human 5–15s complaint window.',
    notGuess: true,
    evidence: {
      sourceFile: 'apps/backend/scripts/step-13.15b1e-b2-15o2g-full-timeline.ts screenshotArgs',
      expression: O2G_OPENING_ZOOMPAN_EXPR,
      beforeMetrics: before,
    },
    hookTailAndSection1Head: {
      note: '5000–5960ms is hook RECORDING with fixed even-pixel crop; 14312–15000ms is section1 RECORDING. Primary handheld look is opening zoompan.',
    },
  };
}
