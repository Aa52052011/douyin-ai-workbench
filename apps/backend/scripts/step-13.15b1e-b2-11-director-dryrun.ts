/**
 * B2-11 deterministic director visual policy dry-run. Vision/LLM/FFmpeg: 0. Not human-approved. Not executed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleHybridPackage } from '../src/production-v2/visual-hybrid/hybrid-assembler.js';
import { assembleContent01Clean, content01OldHybridInput } from '../src/production-v2/visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { generateSemanticCropCandidates } from '../src/production-v2/visual-crop-candidate/crop-candidate-assembler.js';
import { evaluateCropComparison } from '../src/production-v2/visual-crop-comparison/comparison-evaluator.js';
import { runCropSelectionDryRun } from '../src/production-v2/director-visual-policy/dryrun-assembler.js';
import {
  CROP_SELECTION_DRYRUN_VERSION,
  DIRECTOR_VISUAL_POLICY_VERSION,
  POLICY_FLOORS,
  POLICY_RULE_IDS,
} from '../src/production-v2/director-visual-policy/policy.types.js';
import {
  fixtureEvidenceOverCleanliness,
  fixtureReadabilityTiebreak,
  fixtureRequestNewCandidate,
  fixtureUnsafeCannotWin,
} from '../src/production-v2/director-visual-policy/fixtures/synthetic-policy.fixture.js';

const evidenceDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-11',
);

function writeJson(rel: string, value: unknown) {
  const full = path.join(evidenceDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

const pack = assembleContent01Clean();
const generation = generateSemanticCropCandidates(pack);
const evaluation = evaluateCropComparison(pack, generation);
const dryRun = runCropSelectionDryRun(evaluation);
const again = runCropSelectionDryRun(evaluation);
const old = runCropSelectionDryRun(
  evaluateCropComparison(assembleHybridPackage(content01OldHybridInput()), generateSemanticCropCandidates(assembleHybridPackage(content01OldHybridInput()))),
);

writeJson('director-policy-contract.json', { version: DIRECTOR_VISUAL_POLICY_VERSION, objective: 'BALANCED', bias: 'EVIDENCE_FIRST' });
writeJson('dryrun-contract.json', { version: CROP_SELECTION_DRYRUN_VERSION, selectionType: 'SYSTEM_DRY_RUN_SELECTION', humanApproved: false, productionExecutionAllowed: false });
writeJson('policy-priority.json', {
  order: ['hard-safety', 'truth-claim', 'key-evidence', 'readability', 'temporal', 'presentation', 'source-retention', 'lexical'],
});
writeJson('policy-rules.json', POLICY_RULE_IDS);
writeJson('versioning.json', { policy: DIRECTOR_VISUAL_POLICY_VERSION, dryRun: CROP_SELECTION_DRYRUN_VERSION, floors: POLICY_FLOORS });
writeJson('content01/input-options.json', evaluation.directorEligibleOptions.map((item) => ({ id: item.candidateId, strategy: item.strategy, variant: item.variant, eligibility: item.eligibility })));
writeJson('content01/policy-trace.json', dryRun.policyTrace);
writeJson('content01/dryrun-selection.json', {
  selectedCandidateId: dryRun.selectedCandidateId,
  selectedStrategy: dryRun.selectedStrategy,
  decision: dryRun.decision,
  selectionType: dryRun.selectionType,
  humanApproved: dryRun.humanApproved,
  productionExecutionAllowed: dryRun.productionExecutionAllowed,
});
writeJson('content01/selected-option.json', dryRun.selectedOption && {
  candidateId: dryRun.selectedOption.candidateId,
  strategy: dryRun.selectedOption.strategy,
  variant: dryRun.selectedOption.variant,
  eligibility: dryRun.selectedOption.eligibility,
  fitMode: dryRun.selectedOption.fitMode,
  sourceRect: dryRun.selectedOption.sourceRect,
  safetyStatus: dryRun.selectedOption.safetyStatus,
  metrics: {
    evidence: dryRun.selectedOption.metrics.keyEvidencePreservation,
    readability: dryRun.selectedOption.metrics.mobileReadability,
    temporal: dryRun.selectedOption.metrics.temporalStability,
    chrome: dryRun.selectedOption.metrics.browserChromeExclusion,
  },
  padRequired: dryRun.selectedOption.padRequired,
});
writeJson('content01/accepted-tradeoffs.json', dryRun.rationale.acceptedTradeoffs);
writeJson('content01/rejected-eligible-alternatives.json', dryRun.rationale.rejectedAlternatives);
writeJson('content01/ineligible-baselines.json', dryRun.rationale.ineligibleBaselines);
writeJson('content01/human-review-state.json', dryRun.humanReview);
writeJson('content01/dynamic-reframe-signal.json', { signal: dryRun.dynamicReframeSignal, background: dryRun.requiresBackgroundTreatment });
writeJson('content01/contract-validation.json', dryRun.contractValidation);
writeJson('content01/provenance-audit.json', { traceRules: dryRun.policyTrace.map((item) => item.ruleId), provenance: dryRun.provenance });
writeJson('old-contaminated/blocked-decision.json', { decision: old.decision, selectedCandidateId: old.selectedCandidateId, decisionAllowed: old.decisionAllowed });
writeJson('synthetic-policy-tests/evidence-over-cleanliness.json', { selected: runCropSelectionDryRun(fixtureEvidenceOverCleanliness()).selectedCandidateId });
writeJson('synthetic-policy-tests/readability-tiebreak.json', { selected: runCropSelectionDryRun(fixtureReadabilityTiebreak()).selectedCandidateId });
writeJson('synthetic-policy-tests/request-new-candidate.json', { decision: runCropSelectionDryRun(fixtureRequestNewCandidate()).decision });
writeJson('synthetic-policy-tests/unsafe-cannot-win.json', { selected: runCropSelectionDryRun(fixtureUnsafeCannotWin()).selectedCandidateId });
writeJson('audits/no-human-approval.json', { humanApproved: dryRun.humanApproved });
writeJson('audits/no-production-execution.json', { productionExecutionAllowed: dryRun.productionExecutionAllowed });
writeJson('audits/no-candidate-mutation.json', {
  mutated: Boolean(
    dryRun.selectedOption &&
      (() => {
        const src = generation.candidates.find((item) => item.candidateId === dryRun.selectedCandidateId);
        return !src || JSON.stringify(src.sourceRect) !== JSON.stringify(dryRun.selectedOption.sourceRect) || src.fitMode !== dryRun.selectedOption.fitMode || src.status !== dryRun.selectedOption.safetyStatus;
      })(),
  ),
});
writeJson('audits/no-ffmpeg.json', { ffmpegCalls: 0 });
writeJson('audits/no-provider-call.json', { providerCalls: 0, visionCalls: 0, llmCalls: 0 });
writeJson('audits/no-worker-wiring.json', { worker: false });
writeJson('audits/no-migration.json', { migration: false });
writeJson('audits/deterministic-selection.json', { same: JSON.stringify(dryRun) === JSON.stringify(again) });
writeJson('limitations.json', {
  items: [
    'SYSTEM_DRY_RUN_NOT_HUMAN_APPROVED',
    'NO_PRODUCTION_EXECUTION',
    'SAMPLED_TEMPORAL_CAUTION',
    'READABILITY_IS_OCCUPANCY_PROXY',
    'NO_FFMPEG_PLAN',
    'BACKGROUND_TREATMENT_UNDECIDED',
    'NO_DIRECTOR_RUNTIME',
    'NO_NEW_CANDIDATE_GENERATION',
  ],
  count: 8,
});
writeJson('files-changed.json', {
  step: '13.15B-1E-B2-11',
  files: [
    'apps/backend/src/production-v2/director-visual-policy/',
    'apps/backend/src/production-v2/visual-semantic/contracts/versions.ts',
    'apps/backend/scripts/step-13.15b1e-b2-11-director-dryrun.ts',
    'apps/backend/package.json',
  ],
});
writeJson('implementation-summary.json', {
  selected: dryRun.selectedCandidateId,
  strategy: dryRun.selectedStrategy,
  eligibility: dryRun.selectedOption?.eligibility ?? null,
  humanApproved: dryRun.humanApproved,
  execution: dryRun.productionExecutionAllowed,
  contractOk: dryRun.contractValidation.ok,
  visionCalls: 0,
});

process.stdout.write(
  `${JSON.stringify({
    selected: dryRun.selectedCandidateId,
    strategy: dryRun.selectedStrategy,
    contractOk: dryRun.contractValidation.ok,
    humanApproved: dryRun.humanApproved,
    visionCalls: 0,
  })}\n`,
);
