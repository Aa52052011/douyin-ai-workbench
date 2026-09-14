export const EDITORIAL_SHOT_PLAN_VERSION = 'editorial.shot-plan:v1' as const;
export const BACKGROUND_COMPOSITION_VERSION = 'background.composition:v1' as const;
export const DOUYIN_MOBILE_SIMULATOR_VERSION = 'douyin.mobile-simulator:v1' as const;
export const NARRATION_VISUAL_UNIT_VERSION = 'narration.visual-unit:v1' as const;

export const EDITORIAL_SHOT_SCALES = ['WIDE_CONTEXT', 'MEDIUM_FOCUS', 'DETAIL_READABLE'] as const;
export type EditorialShotScale = (typeof EDITORIAL_SHOT_SCALES)[number];

export const EDITORIAL_SHOT_POLICY = {
  defaultScale: 'MEDIUM_FOCUS' as const,
  maxConsecutiveDetailShots: 2,
  maxContinuousDetailDurationMs: 7000,
  suggestedShotCount: { min: 6, max: 10 },
  durationMs: {
    WIDE_CONTEXT: { min: 1000, max: 3000 },
    MEDIUM_FOCUS: { min: 2000, max: 6000 },
    DETAIL_READABLE: { min: 1500, max: 4000 },
  },
  occupancy: {
    WIDE_CONTEXT: { min: 0.22, max: 0.48 },
    MEDIUM_FOCUS: { min: 0.5, max: 0.8 },
    DETAIL_READABLE: { min: 0.82, max: 1 },
  },
  establishingWideMs: 1600,
  antiChoppinessAvgMinMs: 1800,
  selectionPriority: [
    'TRUTH_EVIDENCE_SAFETY',
    'NARRATION_CLAIM_ALIGNMENT',
    'MOBILE_READABILITY',
    'SPATIAL_CONTEXT',
    'EDITORIAL_RHYTHM',
    'VISUAL_POLISH',
  ] as const,
  readabilityByScale: {
    WIDE_CONTEXT: 'CONTEXT_ONLY',
    MEDIUM_FOCUS: 'READABLE',
    DETAIL_READABLE: 'CLAIM_CRITICAL_READABLE',
  } as const,
  backgroundByScale: {
    WIDE_CONTEXT: 'BLUR_SOURCE_DARKENED',
    MEDIUM_FOCUS: 'BLUR_SOURCE_FRAMING',
    DETAIL_READABLE: 'OPTIONAL_NONE',
  } as const,
  transitions: ['CUT', 'HOLD', 'SHORT_EASED_ZOOM', 'SHORT_EASED_PAN'] as const,
  motionPrinciple: 'STABLE_HOLD_PLUS_PURPOSEFUL_CUT',
  timingPrecision: 'ESTIMATED_ALIGNMENT' as const,
  mobileStandard: 'DOUYIN_DEFAULT_MOBILE_VIEW' as const,
  simulatorPrecision: 'APPROXIMATE_DOUYIN_MOBILE_VIEW' as const,
} as const;

export const DOUYIN_APPROX_OVERLAY = {
  topSafe: 0.08,
  rightRail: 0.12,
  bottomCaption: 0.2,
  bottomSafe: 0.04,
} as const;
