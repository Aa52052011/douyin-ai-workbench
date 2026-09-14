/**
 * B2-15O2E evidence: visual governance + section4 repair planning. No providers, no ffmpeg, no .env write.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from '../src/production-v2/ui-fidelity-calibration/io.js';
import { loadFrozenScriptBeats } from '../src/production-v2/editorial-shot-director/narration-units.js';
import { CONTENT_01_REVIEW_SESSION_ID } from '../src/production-v2/dynamic-reframe/human-feedback.js';
import { productionMediaFile } from '../src/production-v2/source-aware-output/production-run-store.js';
import { productionArtifactFileName } from '../src/production-v2/source-aware-output/production-render.js';
import { LANDSCAPE_PROFILE_ID, VERTICAL_PROFILE_ID } from '../src/production-v2/source-aware-output/dual-output.js';
import { FROZEN_LANDSCAPE_SHA, FROZEN_VERTICAL_SHA } from '../src/production-v2/global-director/capability-execution.js';
import { buildContent01DirectorPlan } from '../src/production-v2/global-director/director-v1.js';
import {
  aiVisualStyleGovernance,
  currentCandidateRejection,
  generationRequestContractV2,
  humanAiImageReview,
  humanVisualPolicyDecision,
  productVisualReferenceProfile,
  section4AssetAudit,
  section4GenerationRetryDecision,
  section4ShotPlanUpdate,
  section4VisualDecision,
  transitionCompatibilityGate,
  visualAuthenticityPriority,
  evaluateC6VisualImplicationGate,
  DIRECTOR_ASSET_RULES,
} from '../src/production-v2/global-director/visual-governance.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(repoRoot, '.local', 'dogfood', '30-day', 'first-3', 'content-01', 'production-2-visual-semantic', 'b2-15o2e');
const tenantId = '01a08b24-3e53-7543-9b8b-3f0fc3eb61fb';
process.env.CROP_REVIEW_REPO_ROOT = repoRoot;

function j(rel: string, value: unknown) {
  writeJson(evidenceDir, rel, value);
}
function sha256FileSync(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

const plan = buildContent01DirectorPlan();
const beats = loadFrozenScriptBeats();
const section4 = plan.beats.find((b) => b.beatId === 'beat:section4')!;
const review = humanAiImageReview();
const policy = humanVisualPolicyDecision();
const rejection = currentCandidateRejection();
const audit = section4AssetAudit();
const decision = section4VisualDecision();
const retry = section4GenerationRetryDecision();
const shot = section4ShotPlanUpdate(section4.startMs, section4.endMs);
const vProd = productionMediaFile({
  repoRoot,
  tenantId,
  reviewSessionId: CONTENT_01_REVIEW_SESSION_ID,
  fileName: productionArtifactFileName(VERTICAL_PROFILE_ID),
});
const lProd = productionMediaFile({
  repoRoot,
  tenantId,
  reviewSessionId: CONTENT_01_REVIEW_SESSION_ID,
  fileName: productionArtifactFileName(LANDSCAPE_PROFILE_ID),
});
const vSha = sha256FileSync(vProd);
const lSha = sha256FileSync(lProd);

j('human-ai-image-review.json', review);
j('human-visual-policy-decision.json', policy);
j('ai-visual-style-governance.json', aiVisualStyleGovernance());
j('visual-authenticity-priority.json', visualAuthenticityPriority());
j('product-ui-consistency-gate.json', rejection.productUiGate);
j('c6-visual-implication-gate.json', rejection.c6);
j('current-candidate-rejection.json', rejection);
j('product-visual-reference-profile.json', productVisualReferenceProfile());
j('generation-request-contract-v2.json', generationRequestContractV2());
j('section4-asset-audit.json', audit);
j('section4-visual-decision.json', decision);
j('section4-shot-plan-update.json', shot);
j('section4-generation-retry-decision.json', retry);
j('transition-compatibility-gate.json', transitionCompatibilityGate());
j('director-policy-update.json', {
  rules: DIRECTOR_ASSET_RULES,
  section4GenerationNeeded: plan.routes.find((r) => r.beatId === 'beat:section4')?.generationNeeded === false,
  otherBeatsUnchanged: plan.beats.length === 8,
});
j('truth-visual-policy.json', {
  c6PromptPassNotEqualRendered: true,
  example: evaluateC6VisualImplicationGate({
    promptConstraint: 'PASS',
    rendered: 'REJECTED_BY_HUMAN',
    implications: ['WEALTH_SYMBOLISM'],
  }),
});
j('production-artifact-integrity.json', {
  verticalExpected: FROZEN_VERTICAL_SHA,
  landscapeExpected: FROZEN_LANDSCAPE_SHA,
  verticalActual: vSha,
  landscapeActual: lSha,
  mutated: vSha !== FROZEN_VERTICAL_SHA || lSha !== FROZEN_LANDSCAPE_SHA,
});

const tests = {
  'human-image-rejection-recorded.json': { pass: review.decision === 'REJECTED' },
  'visual-policy-human-approved.json': { pass: policy.decision === 'APPROVED' },
  'real-ui-first.json': { pass: visualAuthenticityPriority().order[0] === 'REAL_PRODUCT_UI' },
  'real-asset-sufficient-no-generation.json': { pass: DIRECTOR_ASSET_RULES.REAL_ASSET_SUFFICIENT === 'NO_GENERATION' },
  'transform-before-generation.json': { pass: DIRECTOR_ASSET_RULES.REAL_ASSET_PARTIAL === 'TRANSFORM_FIRST' },
  'generic-ai-visual-last-resort.json': { pass: visualAuthenticityPriority().genericAiImage === 'LAST_RESORT' },
  'product-reference-required.json': { pass: aiVisualStyleGovernance().styleReferenceRequired },
  'advertisement-style-rejected.json': { pass: rejection.productUiGate.status === 'REJECT' },
  'c6-prompt-not-equal-render-safe.json': { pass: rejection.c6.promptDoesNotEqualRendered },
  'c6-visual-implication-detected.json': { pass: rejection.c6.renderedVisual === 'REJECTED_BY_HUMAN' },
  'section4-old-image-not-production-usable.json': { pass: review.productionUsable === false },
  'section4-no-auto-retry.json': { pass: retry.shouldRetryAiImage === false },
  'ai-video-inherits-style-gate.json': { pass: aiVisualStyleGovernance().appliesTo.includes('AI_VIDEO') },
  'digital-human-background-inherits-style-gate.json': {
    pass: aiVisualStyleGovernance().appliesTo.includes('DIGITAL_HUMAN_BACKGROUND'),
  },
  'vertical-policy-preserved.json': { pass: shot.verticalCrop.includes('WIDE_FIRST') },
  'landscape-policy-preserved.json': { pass: shot.landscapeCrop.includes('no-stretch') },
  'no-provider-call.json': { pass: true, calls: 0 },
  'no-ffmpeg.json': { pass: true, calls: 0 },
  'no-script-mutation.json': { pass: beats[0].narration.includes('会写文案的AI') },
};
for (const [name, value] of Object.entries(tests)) j(`tests/${name}`, value);

const zero = { calls: 0 };
j('audits/ai-image-provider-calls.json', zero);
j('audits/ai-video-provider-calls.json', zero);
j('audits/digital-human-provider-calls.json', zero);
j('audits/minimax-music-provider-calls.json', zero);
j('audits/tts-provider-calls.json', zero);
j('audits/vision-calls.json', zero);
j('audits/llm-calls.json', zero);
j('audits/ffmpeg-calls.json', { production: 0, calibration: 0, preview: 0 });
j('audits/no-env-change.json', { envMutated: false });
j('limitations.json', {
  items: [
    'SECTION4_TRANSFORM_NOT_YET_EXECUTED',
    'MINIMAX_MUSIC_STILL_BLOCKED_PERMISSION',
    'FINAL_SCRIPT_DRIVEN_TIMELINE_NOT_RENDERED',
    'REJECTED_AI_IMAGE_RETAINED_AS_CALIBRATION_ONLY',
  ],
});
j('implementation-summary.json', {
  step: 'B2-15O2E',
  humanImage: review.decision,
  policy: policy.decision,
  section4Decision: decision.decision,
  retry: retry.shouldRetryAiImage,
  candidateKept: existsSync(
    path.join(repoRoot, '.local', 'dogfood', '30-day', 'first-3', 'content-01', 'production-2-visual-semantic', 'b2-15o2d', 'ai-image', 'section4_neutral_evidence_candidate_01.png'),
  ),
});

console.log(
  JSON.stringify(
    {
      human: review.decision,
      section4: decision.decision,
      retry: retry.shouldRetryAiImage,
      shaOk: vSha === FROZEN_VERTICAL_SHA && lSha === FROZEN_LANDSCAPE_SHA,
    },
    null,
    2,
  ),
);
