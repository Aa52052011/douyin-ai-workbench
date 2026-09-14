import { describe, expect, it } from 'vitest';
import { assembleHybridPackage } from '../visual-hybrid/hybrid-assembler.js';
import { assembleContent01Clean, content01OldHybridInput, content01PublishHybridInput } from '../visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { generateSemanticCropCandidates } from '../visual-crop-candidate/crop-candidate-assembler.js';
import { evaluateCropComparison } from '../visual-crop-comparison/comparison-evaluator.js';
import { runCropSelectionDryRun } from './dryrun-assembler.js';
import {
  fixtureEvidenceOverCleanliness,
  fixtureReadabilityTiebreak,
  fixtureRequestNewCandidate,
  fixtureTemporalTiebreak,
  fixtureUnsafeCannotWin,
} from './fixtures/synthetic-policy.fixture.js';

function content01DryRun() {
  const pack = assembleContent01Clean();
  const generation = generateSemanticCropCandidates(pack);
  const evaluation = evaluateCropComparison(pack, generation);
  return { pack, generation, evaluation, dryRun: runCropSelectionDryRun(evaluation) };
}

describe('B2-11 director visual policy dry-run', () => {
  const { generation, evaluation, dryRun } = content01DryRun();

  it('selects only from the eligible pool and never ineligible baselines', () => {
    expect(evaluation.directorEligibleOptions.length).toBeGreaterThanOrEqual(2);
    if (dryRun.decision === 'SELECTED') {
      expect(dryRun.selectedCandidateId).toBeTruthy();
      expect(evaluation.directorEligibleOptions.some((item) => item.candidateId === dryRun.selectedCandidateId)).toBe(true);
      expect(dryRun.selectedOption?.eligibility === 'ELIGIBLE' || dryRun.selectedOption?.eligibility === 'ELIGIBLE_WITH_WARNINGS').toBe(true);
    }
    expect(dryRun.selectedOption?.strategy).not.toBe('CENTER_COVER');
    expect(dryRun.selectedCandidateId).not.toBe(evaluation.candidates.find((item) => item.strategy === 'CENTER_COVER')?.candidateId);
    const tight = evaluation.candidates.find((item) => item.strategy === 'UI_FOCUS' && item.variant === 'TIGHT');
    if (tight) expect(dryRun.selectedCandidateId).not.toBe(tight.candidateId);
    expect(dryRun.rationale.ineligibleBaselines.every((item) => item.reason === 'INELIGIBLE_BY_B2_9_SAFETY')).toBe(true);
  });

  it('keeps human review required, no approval, no execution', () => {
    expect(dryRun.humanReview.requiredBeforeProduction).toBe(true);
    expect(dryRun.humanReview.reasons).toEqual(expect.arrayContaining(['STATIC_CROP_WARNINGS', 'SAMPLED_SEMANTIC_PRECISION', 'HIGH_TEMPORAL_VARIANCE']));
    expect(dryRun.humanApproved).toBe(false);
    expect(dryRun.productionExecutionAllowed).toBe(false);
    expect(dryRun.selectionType).toBe('SYSTEM_DRY_RUN_SELECTION');
    expect(dryRun.temporalCaution).toBe(true);
  });

  it('does not mutate candidate geometry or safety', () => {
    if (!dryRun.selectedOption) return;
    const src = generation.candidates.find((item) => item.candidateId === dryRun.selectedCandidateId)!;
    expect(dryRun.selectedOption.sourceRect).toEqual(src.sourceRect);
    expect(dryRun.selectedOption.fitMode).toEqual(src.fitMode);
    expect(dryRun.selectedOption.safetyStatus).toEqual(src.status);
  });

  it('is deterministic and passes the director contract when a candidate is selected', () => {
    const again = runCropSelectionDryRun(evaluation);
    expect(again).toEqual(dryRun);
    if (dryRun.decision === 'SELECTED') expect(dryRun.contractValidation.ok).toBe(true);
    expect(dryRun.policyTrace.length).toBeGreaterThan(0);
    expect(dryRun.rationale.text.length).toBeGreaterThan(20);
    expect(dryRun.rationale.rejectedAlternatives.every((item) => item.reasons.length > 0)).toBe(true);
  });

  it('does not let C5 auto-publish steer selection', () => {
    const publish = runCropSelectionDryRun(
      evaluateCropComparison(assembleHybridPackage(content01PublishHybridInput()), generateSemanticCropCandidates(assembleHybridPackage(content01PublishHybridInput()))),
    );
    const c5 = publish.selectedOption?.claimSupportImpact.find((item) => item.claimId === 'C5');
    if (c5) expect(c5.status).toBe('NOT_APPLICABLE');
    expect(publish.policyTrace.some((item) => item.ruleId === 'DIRECTOR_C5_DOES_NOT_INFLUENCE_SELECTION')).toBe(true);
  });

  it('blocks old contaminated asset selection', () => {
    const old = runCropSelectionDryRun(
      evaluateCropComparison(assembleHybridPackage(content01OldHybridInput()), generateSemanticCropCandidates(assembleHybridPackage(content01OldHybridInput()))),
    );
    expect(old.decisionAllowed).toBe(false);
    expect(old.selectedCandidateId).toBeNull();
    expect(old.decision).toBe('BLOCKED_BY_ASSET_USAGE');
  });

  it('prefers complete evidence over cleaner framing in synthetic fixture', () => {
    const result = runCropSelectionDryRun(fixtureEvidenceOverCleanliness());
    expect(result.selectedCandidateId).toBe('chrome-but-complete');
  });

  it('prefers MEDIUM readability over LOW when evidence is equal', () => {
    const result = runCropSelectionDryRun(fixtureReadabilityTiebreak());
    expect(result.selectedCandidateId).toBe('med-read');
  });

  it('requests a new candidate when all options are below floors', () => {
    const result = runCropSelectionDryRun(fixtureRequestNewCandidate());
    expect(result.decision).toBe('REQUEST_NEW_CANDIDATE');
    expect(result.selectedCandidateId).toBeNull();
  });

  it('never lets an unsafe high-presentation candidate win', () => {
    const result = runCropSelectionDryRun(fixtureUnsafeCannotWin());
    expect(result.selectedCandidateId).toBe('ok-but-plain');
    expect(result.selectedOption?.safetyStatus).not.toBe('UNSAFE');
  });

  it('prefers higher temporal stability when other axes match', () => {
    const result = runCropSelectionDryRun(fixtureTemporalTiebreak());
    expect(result.selectedCandidateId).toBe('more-stable');
  });
});
