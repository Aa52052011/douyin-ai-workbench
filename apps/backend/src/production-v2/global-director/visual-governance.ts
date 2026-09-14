import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import { CONTENT_01_CONTAINERS } from '../source-aware-editorial/containers.js';
import { SELECTED_V2_SHARPEN } from '../audio-calibration/audio-integration.js';
import { FROZEN_SCRIPT_ID } from '../audio-calibration/audio-integration.js';

export const PRODUCT_INFO_IMAGE_ID = 'b10d7b09-6dc8-41a4-b786-83077e53be73';
export const REJECTED_SECTION4_CANDIDATE = 'ai-image/section4_neutral_evidence_candidate_01.png';

export const VISUAL_AUTHENTICITY_PRIORITY = [
  'REAL_PRODUCT_UI',
  'REAL_SCREEN_RECORDING',
  'REAL_PRODUCT_SCREENSHOT',
  'REAL_SCREENSHOT_PLUS_MOTION',
  'UI_CONSISTENT_GENERATED_GRAPHIC',
  'GENERIC_AI_IMAGE',
] as const;
export type VisualAuthenticityPriorityKindV1 = (typeof VISUAL_AUTHENTICITY_PRIORITY)[number];

export const STYLE_MISMATCH_REASONS = [
  'PRODUCT_UI_INCONSISTENT',
  'POSTER_LIKE',
  'ADVERTISEMENT_LIKE',
  'OVER_STYLIZED',
  'AI_GENERATED_LOOK_TOO_STRONG',
  'COLOR_LANGUAGE_MISMATCH',
  'TYPOGRAPHY_MISMATCH',
  'REALISM_MISMATCH',
  'TRUTH_VISUAL_CONFLICT',
  'UNNECESSARY_GENERATION',
] as const;
export type StyleMismatchReasonV1 = (typeof STYLE_MISMATCH_REASONS)[number];

export const FORBIDDEN_STYLE_ELEMENTS = [
  'TROPHY',
  'GOLD_COIN',
  'MONEY_SYMBOL',
  'FIRE',
  'EXPLOSION',
  'SUCCESS_CONFETTI',
  'HYPER_GROWTH_ARROW',
  'FAKE_REVENUE_CHART',
  'BIG_MARKETING_POSTER',
  'LUXURY_SUCCESS_METAPHOR',
  'FAKE_PRODUCT_SCREEN',
] as const;

export const C6_IMPLICATIONS = [
  'GUARANTEED_GROWTH_IMPLICATION',
  'SUCCESS_CERTAINTY_IMPLICATION',
  'REVENUE_IMPLICATION',
  'VIRALITY_IMPLICATION',
  'WEALTH_SYMBOLISM',
  'WINNER_TROPHY_SYMBOLISM',
  'UNSUPPORTED_UPWARD_CHART',
  'UNSUPPORTED_METRIC_BOOST',
] as const;

export const DIRECTOR_ASSET_RULES = {
  REAL_ASSET_SUFFICIENT: 'NO_GENERATION',
  REAL_ASSET_PARTIAL: 'TRANSFORM_FIRST',
  REAL_ASSET_INSUFFICIENT: 'GENERATION_ALLOWED',
} as const;

export const GOVERNED_CAPABILITIES = [
  'AI_IMAGE',
  'AI_VIDEO',
  'DIGITAL_HUMAN_BACKGROUND',
  'GENERATED_BROLL',
  'MOTION_GRAPHIC_GENERATION',
  'COMPOSITE_GENERATION',
] as const;

export function visualAuthenticityPriority() {
  return {
    schemaVersion: 'visual.authenticity-priority:v1',
    productVisualLanguageIsPrimary: true,
    aiGenerationRole: 'AI_GENERATION_IS_SEMANTIC_GAP_FILLER',
    not: 'AI_GENERATION_IS_DEFAULT_VISUAL_REPLACEMENT',
    order: [...VISUAL_AUTHENTICITY_PRIORITY],
    genericAiImage: 'LAST_RESORT',
  };
}

export function aiVisualStyleGovernance() {
  return {
    schemaVersion: 'ai.visual-style-governance:v1',
    policy: 'PRODUCT_VISUAL_LANGUAGE_IS_PRIMARY',
    appliesTo: [...GOVERNED_CAPABILITIES],
    advertisingIntensityDefault: 'LOW' as const,
    content01GenericAiVisualAllowed: false,
    styleReferenceRequired: true,
    doNotInventUi: true,
    forbiddenStyleElements: [...FORBIDDEN_STYLE_ELEMENTS],
  };
}

export function evaluateProductUiConsistencyGate(input: {
  candidateId: string;
  findings: StyleMismatchReasonV1[];
  advertisingLike: boolean;
  humanDecision: 'REJECTED' | 'PENDING' | 'ACCEPTED';
}): {
  schemaVersion: 'product.ui-consistency-gate:v1';
  status: 'PASS' | 'PASS_WITH_LIMITATIONS' | 'REJECT' | 'HUMAN_REVIEW_REQUIRED';
  checks: Record<string, 'PASS' | 'FAIL'>;
} {
  const fail = input.findings.length > 0 || input.advertisingLike || input.humanDecision === 'REJECTED';
  return {
    schemaVersion: 'product.ui-consistency-gate:v1',
    status: fail ? 'REJECT' : 'PASS',
    checks: {
      colorCompatibility: fail ? 'FAIL' : 'PASS',
      uiDensityCompatibility: fail ? 'FAIL' : 'PASS',
      typographyBehavior: fail ? 'FAIL' : 'PASS',
      compositionLanguage: fail ? 'FAIL' : 'PASS',
      productRealism: fail ? 'FAIL' : 'PASS',
      advertisingIntensity: input.advertisingLike ? 'FAIL' : 'PASS',
      aiGeneratedAppearance: input.findings.includes('AI_GENERATED_LOOK_TOO_STRONG') ? 'FAIL' : 'PASS',
      truthImplication: input.findings.includes('TRUTH_VISUAL_CONFLICT') ? 'FAIL' : 'PASS',
      sourceAuthenticity: fail ? 'FAIL' : 'PASS',
      transitionCompatibility: fail ? 'FAIL' : 'PASS',
    },
  };
}

export function evaluateC6VisualImplicationGate(input: {
  promptConstraint: 'PASS' | 'FAIL';
  rendered: 'PENDING' | 'PASS' | 'REJECT' | 'REJECTED_BY_HUMAN';
  implications: Array<(typeof C6_IMPLICATIONS)[number]>;
}) {
  return {
    schemaVersion: 'c6.visual-implication-gate:v1',
    promptConstraint: input.promptConstraint,
    renderedVisual: input.rendered,
    promptDoesNotEqualRendered: true,
    implications: input.implications,
    reason: input.rendered === 'REJECTED_BY_HUMAN' ? 'VISUAL_IMPLICATION_CONFLICT' : null,
  };
}

export function humanAiImageReview() {
  return {
    schemaVersion: 'human.ai-image-review:v1',
    candidate: REJECTED_SECTION4_CANDIDATE,
    decision: 'REJECTED' as const,
    source: 'EXPLICIT_USER_REVIEW' as const,
    reasons: [
      'VISUAL_STYLE_MISMATCH',
      'OVER_ADVERTISING_STYLE',
      'PRODUCT_UI_INCONSISTENT',
      'AI_GENERATED_LOOK_TOO_STRONG',
      'C6_VISUAL_IMPLICATION_RISK',
    ] as const,
    productionUsable: false,
    lifecycle: 'REJECTED_CALIBRATION_ARTIFACT',
    mayEnterTimeline: false,
    mayBeFallbackSource: false,
    autoRetry: false,
  };
}

export function humanVisualPolicyDecision() {
  return {
    schemaVersion: 'human.visual-policy-decision:v1',
    policy: 'PRODUCT_VISUAL_LANGUAGE_IS_PRIMARY',
    decision: 'APPROVED' as const,
    source: 'EXPLICIT_USER_MESSAGE' as const,
    artifactApprovalImplied: false,
  };
}

export function productVisualReferenceProfile() {
  return {
    schemaVersion: 'product.visual-reference-profile:v1',
    productId: 'content-01-ai-workbench',
    referenceAssets: [
      { assetId: CONTENT_01_NEW_ASSET_ID, kind: 'REAL_SCREEN_RECORDING' },
      { assetId: PRODUCT_INFO_IMAGE_ID, kind: 'REAL_PRODUCT_SCREENSHOT' },
    ],
    layoutReferences: CONTENT_01_CONTAINERS.map((c) => c.ref),
    dominantUIStyle: 'dense-saas-workbench-cards-nav',
    backgroundBehavior: 'product-canvas-not-lifestyle-set',
    cardStyle: 'software-panel / dashboard-card',
    density: 'HIGH',
    typographyBehavior: 'ui-labels-not-poster-type',
    motionLanguage: 'subtle-focus-crop-zoom-not-kenburns-ad',
    preferredCameraBehavior: 'WIDE_FIRST then local emphasis',
    forbiddenStylePatterns: [...FORBIDDEN_STYLE_ELEMENTS],
    paletteExtraction: 'NOT_REQUIRED_REFERENCE_BASED',
    colorGuessByLlm: false,
  };
}

export function generationRequestContractV2() {
  return {
    schemaVersion: 'generation-request:v2',
    visualAuthenticityPolicy: 'PRODUCT_VISUAL_LANGUAGE_IS_PRIMARY',
    productReferenceAssetIds: [CONTENT_01_NEW_ASSET_ID, PRODUCT_INFO_IMAGE_ID],
    styleConsistencyRequired: true,
    advertisingIntensity: 'NONE' as const,
    truthVisualConstraints: ['C5', 'C6'],
    genericAIVisualAllowed: false,
    appliesToFuture: [...GOVERNED_CAPABILITIES],
  };
}

export function section4AssetAudit() {
  return {
    realUiSegmentDirectlyUsable: true,
    screenshotMotionAvailable: true,
    evidenceOrDataUiAvailable: 'PARTIAL' as const,
    evidenceNote:
      'Workbench CONTENT_PANEL / TABLE / STATUS_GROUP exist as real layout refs; no dedicated fake analytics page. Do not invent KPI dashboards.',
    sourceSegmentReextractUseful: true,
    coverage: 'REAL_ASSET_PARTIAL' as const,
    directorRule: DIRECTOR_ASSET_RULES.REAL_ASSET_PARTIAL,
  };
}

export function section4VisualDecision() {
  return {
    schemaVersion: 'section4.visual-decision:v1',
    decision: 'USE_REAL_UI_WITH_MOTION' as const,
    semanticGoal: 'EVIDENCE_OVER_PROMISE',
    not: 'SUCCESS_POSTER',
    preferred: 'REAL_PRODUCT_UI + highlight + crop/zoom/motion',
    advertisingIntensity: 'NONE' as const,
    textOverlay: 'OPTIONAL_LIGHT_ANNOTATION',
    exampleOverlay: '先执行，再看数据',
    overlayRequired: false,
  };
}

export function section4GenerationRetryDecision() {
  return {
    shouldRetryAiImage: false as const,
    reason: 'REAL_ASSET_PARTIAL_TRANSFORM_FIRST_NO_SEMANTIC_GAP_FOR_POSTER',
    humanRejectDoesNotAutoRetry: true,
  };
}

export function section4ShotPlanUpdate(startMs: number, endMs: number) {
  return {
    shotId: 'shot:beat:section4:primary',
    beatId: 'beat:section4',
    startMs,
    endMs,
    durationMs: endMs - startMs,
    sourceStrategy: 'REAL_SCREEN_RECORDING_TRANSFORM_FIRST',
    sourceAssetId: CONTENT_01_NEW_ASSET_ID,
    rejectedCandidate: REJECTED_SECTION4_CANDIDATE,
    generationRequestId: null,
    motionBehavior: 'subtle crop / zoom / pan / highlight / screen-focus',
    textOverlay: 'optional light UI annotation, no poster copy',
    verticalCrop: `WIDE_FIRST + local emphasis + ${SELECTED_V2_SHARPEN}`,
    landscapeCrop: 'source-native no-stretch; mild focus/zoom without breaking UI semantics',
    truthConstraint: ['C5', 'C6'],
    advertisingIntensity: 'NONE',
  };
}

export function transitionCompatibilityGate() {
  return {
    schemaVersion: 'transition.compatibility-gate:v1',
    section3ToSection4: {
      styleContinuity: 'PASS_IF_REAL_UI',
      brightnessContinuity: 'EXPECTED_SIMILAR',
      uiRealismContinuity: 'PASS_IF_REAL_UI',
      semanticContinuity: 'EVIDENCE_OVER_PROMISE',
    },
    section4ToSection5: {
      styleContinuity: 'PASS_IF_REAL_UI',
      posterJumpForbidden: true,
    },
    rejectedPosterWouldFail: true,
  };
}

export function directorGenerationRule(coverage: 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT') {
  if (coverage === 'SUFFICIENT') return DIRECTOR_ASSET_RULES.REAL_ASSET_SUFFICIENT;
  if (coverage === 'PARTIAL') return DIRECTOR_ASSET_RULES.REAL_ASSET_PARTIAL;
  return DIRECTOR_ASSET_RULES.REAL_ASSET_INSUFFICIENT;
}

export function currentCandidateRejection() {
  const review = humanAiImageReview();
  const gate = evaluateProductUiConsistencyGate({
    candidateId: REJECTED_SECTION4_CANDIDATE,
    findings: [
      'PRODUCT_UI_INCONSISTENT',
      'POSTER_LIKE',
      'ADVERTISEMENT_LIKE',
      'OVER_STYLIZED',
      'AI_GENERATED_LOOK_TOO_STRONG',
      'REALISM_MISMATCH',
      'TRUTH_VISUAL_CONFLICT',
      'UNNECESSARY_GENERATION',
    ],
    advertisingLike: true,
    humanDecision: 'REJECTED',
  });
  const c6 = evaluateC6VisualImplicationGate({
    promptConstraint: 'PASS',
    rendered: 'REJECTED_BY_HUMAN',
    implications: [
      'GUARANTEED_GROWTH_IMPLICATION',
      'SUCCESS_CERTAINTY_IMPLICATION',
      'REVENUE_IMPLICATION',
      'VIRALITY_IMPLICATION',
      'WEALTH_SYMBOLISM',
      'WINNER_TROPHY_SYMBOLISM',
      'UNSUPPORTED_UPWARD_CHART',
    ],
  });
  return {
    candidate: REJECTED_SECTION4_CANDIDATE,
    human: review,
    productUiGate: gate,
    c6,
    keepFile: true,
    productionUsable: false,
    scriptId: FROZEN_SCRIPT_ID,
  };
}
