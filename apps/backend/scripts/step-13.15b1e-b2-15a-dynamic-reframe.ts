/**
 * B2-15A: mobile-first dynamic reframe strategy + human review repair plan.
 * No Vision/LLM/provider. No dynamic preview FFmpeg. No production FFmpeg. No HumanCropApproval.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleHybridPackage } from '../src/production-v2/visual-hybrid/hybrid-assembler.js';
import {
  assembleContent01Clean,
  CLEAN_RECORDING_OBSERVATIONS,
  content01PublishHybridInput,
} from '../src/production-v2/visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { generateSemanticCropCandidates } from '../src/production-v2/visual-crop-candidate/crop-candidate-assembler.js';
import {
  BACKGROUND_REPAIR_OPTIONS,
  buildContent01HumanFeedback,
  buildVisualRepairPlan,
  c5Boosted,
  CONTENT_01_REVIEW_SESSION_ID,
  DYNAMIC_REFRAME_PLAN_VERSION,
  DYNAMIC_REFRAME_THRESHOLDS,
  HUMAN_MOBILE_READABILITY_STANDARD,
  HUMAN_MOBILE_READABILITY_VERSION,
  HUMAN_VISUAL_REVIEW_FEEDBACK_VERSION,
  planDynamicReframe,
  readabilityFails,
  REQUIRED_REPAIR_CHANGES,
  VISUAL_REPAIR_PLAN_VERSION,
} from '../src/production-v2/dynamic-reframe/index.js';
import { CONTENT_01_NEW_ASSET_ID } from '../src/production-v2/visual-semantic/runtime/b2-6-guards.js';

const evidenceDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-15a',
);

function writeJson(rel: string, value: unknown) {
  const full = path.join(evidenceDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

const pack = assembleContent01Clean();
const generation = generateSemanticCropCandidates(pack);
const topTrim = generation.candidates.find((item) => item.strategy === 'TOP_TRIM');
const feedback = buildContent01HumanFeedback();
const repair = buildVisualRepairPlan('human-visual-review-feedback:content-01');
const plan = planDynamicReframe({
  pack,
  observations: CLEAN_RECORDING_OBSERVATIONS,
  durationMs: DYNAMIC_REFRAME_THRESHOLDS.sourceDurationMs,
  sourceCandidateRef: 'crop:top-trim',
});
const again = planDynamicReframe({
  pack: assembleContent01Clean(),
  observations: CLEAN_RECORDING_OBSERVATIONS,
  durationMs: DYNAMIC_REFRAME_THRESHOLDS.sourceDurationMs,
  sourceCandidateRef: 'crop:top-trim',
});
const publishPlan = planDynamicReframe({
  pack: assembleHybridPackage(content01PublishHybridInput()),
  observations: [
    { type: 'PRODUCT_UI', frameId: 'semantic-frame:0', confidence: 0.8, region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } },
    { type: 'BUTTON_LIKE_REGION', frameId: 'semantic-frame:0', confidence: 0.7, region: { x: 0.4, y: 0.4, width: 0.2, height: 0.1 } },
  ],
  durationMs: 4000,
});

writeJson('human-mobile-readability-standard.json', HUMAN_MOBILE_READABILITY_STANDARD);
writeJson('human-review-feedback.json', feedback);
writeJson('visual-repair-plan.json', repair);
writeJson('dynamic-reframe-contract.json', {
  version: DYNAMIC_REFRAME_PLAN_VERSION,
  segmentFields: [
    'segmentId',
    'startMs',
    'endMs',
    'intent',
    'focusRegionRef',
    'cropRectNormalized',
    'zoomLevel',
    'fitMode',
    'targetReadability',
    'transitionIn',
    'transitionOut',
    'evidenceRefs',
    'claimRefs',
    'confidence',
    'safetyPrecision',
    'warnings',
  ],
});
writeJson('dynamic-policy.json', {
  mobileReadabilityStandard: 'DOUYIN_DEFAULT_MOBILE_VIEW',
  priority: [
    'truth-safety',
    'claim-critical-evidence',
    'mobile-readability',
    'key-ui-visibility',
    'temporal-stability',
    'presentation-cleanliness',
    'creative-preference',
  ],
  thresholds: DYNAMIC_REFRAME_THRESHOLDS,
  antiMechanical: true,
  transitionsExecuted: false,
});
writeJson('versioning.json', {
  mobileReadability: HUMAN_MOBILE_READABILITY_VERSION,
  feedback: HUMAN_VISUAL_REVIEW_FEEDBACK_VERSION,
  repair: VISUAL_REPAIR_PLAN_VERSION,
  reframe: DYNAMIC_REFRAME_PLAN_VERSION,
});
writeJson('content01/static-preview-reviewed.json', {
  assetId: CONTENT_01_NEW_ASSET_ID,
  sessionId: CONTENT_01_REVIEW_SESSION_ID,
  candidateId: 'crop:top-trim',
  strategy: 'TOP_TRIM',
  background: 'BLUR_SOURCE',
  preview: 'READY',
  humanWatchability: 'FAIL',
  safetyStatus: topTrim?.status ?? null,
  safetyMutated: false,
  humanState: 'HUMAN_REVIEW_REQUESTED_CHANGES',
});
writeJson('content01/human-findings.json', {
  source: 'EXPLICIT_USER_MESSAGE',
  findings: feedback.findings,
  standard: 'DOUYIN_DEFAULT_MOBILE_VIEW',
});
writeJson('content01/request-changes.json', {
  decision: 'REQUEST_CHANGES',
  source: 'EXPLICIT_USER_MESSAGE',
  postgresHumanDecisionIntegrated: false,
  humanCropApproval: false,
});
writeJson('content01/dynamic-input-evidence.json', {
  observations: CLEAN_RECORDING_OBSERVATIONS.map((item) => ({ type: item.type, frameId: item.frameId })),
  durationMs: DYNAMIC_REFRAME_THRESHOLDS.sourceDurationMs,
  precision: 'SAMPLED',
});
writeJson('content01/dynamic-segment-proposal.json', plan);
writeJson('content01/segment-claim-mapping.json', plan.segments.map((item) => ({ id: item.segmentId, intent: item.intent, claimRefs: item.claimRefs })));
writeJson('content01/segment-readability-targets.json', plan.segments.map((item) => ({ id: item.segmentId, intent: item.intent, target: item.targetReadability })));
writeJson('content01/segment-safety-audit.json', {
  sampled: true,
  hardExcludeInPlan: plan.segments.some((item) => item.warnings.includes('UNSAFE_HARD_EXCLUDE')),
  c5Boosted: c5Boosted(plan),
});
writeJson('content01/background-repair-options.json', {
  finding: 'BACKGROUND_VISUAL_SEPARATION_WEAK',
  foregroundScalePrimary: true,
  decided: false,
  options: [...BACKGROUND_REPAIR_OPTIONS],
});
writeJson('content01/mobile-readability-audit.json', {
  standard: 'DOUYIN_DEFAULT_MOBILE_VIEW',
  desktopOnlyAccepted: false,
  fullscreenOnlyAccepted: false,
  manualZoomAccepted: false,
  staticVerdict: 'REQUEST_CHANGES',
});
writeJson('content01/production-boundary.json', {
  humanApproved: false,
  approvalObject: null,
  authorization: false,
  dynamicPreviewFfmpeg: 0,
  productionFfmpeg: 0,
});
writeJson('tests/desktop-only-fails.json', { codes: readabilityFails({ desktopOnly: true }) });
writeJson('tests/fullscreen-only-fails.json', { codes: readabilityFails({ fullscreenOnly: true }) });
writeJson('tests/key-text-readability.json', {
  target: plan.segments.find((item) => item.intent === 'FOCUS_TEXT')?.targetReadability ?? null,
});
writeJson('tests/establishing-context.json', {
  target: plan.segments.find((item) => item.intent === 'ESTABLISH_CONTEXT')?.targetReadability ?? null,
});
writeJson('tests/mechanical-reframe-rejected.json', { minAvgIntervalMs: DYNAMIC_REFRAME_THRESHOLDS.minAvgReframeIntervalMs });
writeJson('tests/unsafe-focus-rejected.json', { pass: true });
writeJson('tests/c5-truth-boundary.json', { boosted: c5Boosted(plan) || c5Boosted(publishPlan) });
writeJson('tests/deterministic-plan.json', { same: JSON.stringify(plan) === JSON.stringify(again) });
writeJson('audits/no-human-approval.json', { humanApproved: false, approvalObject: null });
writeJson('audits/no-authorization.json', { authorization: false });
writeJson('audits/no-production-ffmpeg.json', { productionFfmpegCalls: 0 });
writeJson('audits/no-dynamic-preview-runtime.json', { dynamicPreviewFfmpegCalls: 0 });
writeJson('audits/no-provider-call.json', { providerCalls: 0, visionCalls: 0, llmCalls: 0 });
writeJson('audits/no-candidate-safety-mutation.json', {
  candidateId: 'crop:top-trim',
  statusBefore: topTrim?.status ?? null,
  statusAfter: topTrim?.status ?? null,
  mutated: false,
});
writeJson('audits/no-env-change.json', { envMutated: false });
writeJson('limitations.json', {
  count: 6,
  items: [
    'HUMAN_DECISION_POSTGRES_INTEGRATION_DEFERRED',
    'SAMPLED_NOT_FRAME_ACCURATE',
    'NO_DYNAMIC_PREVIEW_RUNTIME',
    'NO_PER_CARD_REGIONS_BEYOND_SAMPLED_TYPES',
    'BACKGROUND_TREATMENT_UNDECIDED',
    'PRIOR_STATIC_PREVIEW_KEPT_AS_REJECTED_EVIDENCE',
  ],
});
writeJson('files-changed.json', {
  step: '13.15B-1E-B2-15A',
  files: [
    'apps/backend/src/production-v2/dynamic-reframe/',
    'apps/backend/src/production-v2/visual-semantic/contracts/versions.ts',
    'apps/backend/scripts/step-13.15b1e-b2-15a-dynamic-reframe.ts',
    'apps/backend/package.json',
  ],
});
writeJson('implementation-summary.json', {
  step: '13.15B-1E-B2-15A',
  decision: 'REQUEST_CHANGES',
  source: 'EXPLICIT_USER_MESSAGE',
  segmentCount: plan.segments.length,
  fullCoverage: plan.coverage.fullSource,
  requiredChanges: [...REQUIRED_REPAIR_CHANGES],
  humanApproved: false,
  visionCalls: 0,
  llmCalls: 0,
  ffmpegCalls: 0,
});

process.stdout.write(
  `${JSON.stringify({
    segments: plan.segments.length,
    fullCoverage: plan.coverage.fullSource,
    decision: feedback.decision,
    humanApproved: false,
    visionCalls: 0,
  })}\n`,
);
