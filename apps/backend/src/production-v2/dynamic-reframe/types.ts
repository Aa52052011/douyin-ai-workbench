import type { NormalizedRect } from '../visual/geometry/types.js';

export const HUMAN_MOBILE_READABILITY_VERSION = 'human.mobile-readability:v1' as const;
export const HUMAN_VISUAL_REVIEW_FEEDBACK_VERSION = 'human.visual-review-feedback:v1' as const;
export const VISUAL_REPAIR_PLAN_VERSION = 'visual.repair-plan:v1' as const;
export const DYNAMIC_REFRAME_PLAN_VERSION = 'dynamic.reframe-plan:v1' as const;

export const MOBILE_READABILITY_STANDARD = 'DOUYIN_DEFAULT_MOBILE_VIEW' as const;
export type HumanMobileReadabilityStandard = typeof MOBILE_READABILITY_STANDARD;

export const HUMAN_FEEDBACK_SOURCES = ['EXPLICIT_USER_MESSAGE', 'USER_UI_APPROVE_ACTION', 'SYSTEM_INFERENCE', 'DIRECTOR_DRY_RUN'] as const;
export type HumanFeedbackSource = (typeof HUMAN_FEEDBACK_SOURCES)[number];

export const HUMAN_VISUAL_DECISIONS = ['REQUEST_CHANGES', 'APPROVED', 'REJECT_ASSET', 'PRODUCTION_READY'] as const;
export type HumanVisualDecision = (typeof HUMAN_VISUAL_DECISIONS)[number];

export const MOBILE_READABILITY_FAIL_CODES = [
  'DESKTOP_ONLY_READABLE',
  'FULLSCREEN_ONLY_READABLE',
  'PAUSE_REQUIRED_FOR_BASIC_READING',
  'MANUAL_ZOOM_REQUIRED',
  'KEY_UI_TOO_SMALL',
  'CLAIM_CRITICAL_TEXT_UNREADABLE',
] as const;
export type MobileReadabilityFailCode = (typeof MOBILE_READABILITY_FAIL_CODES)[number];

export const HUMAN_FINDING_CODES = [
  'PRODUCT_UI_TOO_SMALL',
  'TEXT_UNREADABLE_ON_DOUYIN_DEFAULT_MOBILE_VIEW',
  'STATIC_CROP_INSUFFICIENT',
  'BACKGROUND_VISUAL_SEPARATION_WEAK',
  'DYNAMIC_REFRAME_REQUIRED',
  'NO_DYNAMIC_LOCAL_FOCUS',
] as const;
export type HumanFindingCode = (typeof HUMAN_FINDING_CODES)[number];

export const READABILITY_TARGETS = ['CONTEXT_ONLY', 'IDENTIFIABLE', 'READABLE', 'CLAIM_CRITICAL_READABLE'] as const;
export type ReadabilityTarget = (typeof READABILITY_TARGETS)[number];

export const REFRAME_INTENTS = [
  'ESTABLISH_CONTEXT',
  'FOCUS_PRODUCT_UI',
  'FOCUS_NAVIGATION',
  'FOCUS_TEXT',
  'FOCUS_ACTION',
  'RETURN_TO_CONTEXT',
] as const;
export type ReframeIntent = (typeof REFRAME_INTENTS)[number];

export const TRANSITION_KINDS = ['CUT', 'EASED_PAN', 'EASED_ZOOM', 'HOLD', 'RETURN_TO_CONTEXT'] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

export const TIMING_PRECISION = 'SAMPLED' as const;

export const STATIC_CANDIDATE_HUMAN_STATES = ['HUMAN_REVIEW_REQUESTED_CHANGES', 'NOT_REVIEWED', 'HUMAN_WATCHABILITY_FAIL'] as const;

export type HumanMobileReadabilityStandardV1 = {
  schemaVersion: typeof HUMAN_MOBILE_READABILITY_VERSION;
  standard: HumanMobileReadabilityStandard;
  meaning: 'DOUYIN_DEFAULT_PORTRAIT_PLAYBACK_SIZE';
  notDesktopPreview: true;
  notBrowserFullscreen: true;
  passRequiresNoManualZoom: true;
  passRequiresNoPauseForBasicReading: true;
  failCodes: typeof MOBILE_READABILITY_FAIL_CODES;
};

export type HumanVisualReviewFeedbackV1 = {
  schemaVersion: typeof HUMAN_VISUAL_REVIEW_FEEDBACK_VERSION;
  source: 'EXPLICIT_USER_MESSAGE';
  reviewTarget: {
    assetId: string;
    sessionId: string;
    candidateId: string;
    strategy: string;
    background: string;
    previewStatus: string;
  };
  decision: 'REQUEST_CHANGES';
  mobileReadabilityStandard: HumanMobileReadabilityStandard;
  findings: HumanFindingCode[];
  requestedRepairDirection: 'DYNAMIC_REFRAME';
  approved: false;
  persistence: {
    humanDecisionIntegrated: false;
    reason: 'EXPLICIT_USER_MESSAGE_NOT_USER_UI_ACTION';
    humanCropApprovalCreated: false;
  };
};

export type VisualRepairPlanV1 = {
  schemaVersion: typeof VISUAL_REPAIR_PLAN_VERSION;
  sourceFeedbackRef: string;
  repairType: 'DYNAMIC_REFRAME';
  requiredChanges: string[];
  prohibitedChanges: string[];
  reanalysisRequired: false;
  executionRequired: false;
  humanReviewRequiredAfterRepair: true;
  backgroundDecisionDeferred: true;
  provenance: { source: 'EXPLICIT_USER_MESSAGE'; visionCalls: 0; llmCalls: 0 };
};

export type DynamicReframeSegmentV1 = {
  segmentId: string;
  startMs: number;
  endMs: number;
  intent: ReframeIntent;
  focusRegionRef: string;
  cropRectNormalized: NormalizedRect;
  zoomLevel: number;
  fitMode: 'COVER' | 'CONTAIN';
  targetReadability: ReadabilityTarget;
  transitionIn: TransitionKind;
  transitionOut: TransitionKind;
  evidenceRefs: string[];
  claimRefs: string[];
  confidence: number;
  safetyPrecision: typeof TIMING_PRECISION;
  warnings: string[];
  requestShotSplit?: boolean;
};

export type DynamicReframePlanV1 = {
  schemaVersion: typeof DYNAMIC_REFRAME_PLAN_VERSION;
  assetId: string;
  sourceCandidateRef: string;
  targetProfile: { width: number; height: number };
  mobileReadabilityStandard: HumanMobileReadabilityStandard;
  segments: DynamicReframeSegmentV1[];
  coverage: { startMs: number; endMs: number; fullSource: boolean; gaps: Array<{ startMs: number; endMs: number; reason: string }> };
  globalConstraints: {
    safetyFirst: true;
    truthFirst: true;
    timingPrecision: typeof TIMING_PRECISION;
    antiMechanical: true;
    noFakeUi: true;
    c5MustNotBoost: true;
  };
  transitions: { preferred: TransitionKind[]; avoided: string[]; executedThisStep: false };
  humanReviewRequirements: { requiredAfterRepair: true; priorStaticApprovalReusable: false };
  provenance: { planner: 'deterministic'; visionCalls: 0; llmCalls: 0; ffmpegCalls: 0 };
};
