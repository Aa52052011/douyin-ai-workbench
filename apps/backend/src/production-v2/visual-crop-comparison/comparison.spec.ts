import { describe, expect, it } from 'vitest';
import { assembleHybridPackage } from '../visual-hybrid/hybrid-assembler.js';
import { assembleContent01Clean, content01OldHybridInput, content01PublishHybridInput } from '../visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { generateSemanticCropCandidates } from '../visual-crop-candidate/crop-candidate-assembler.js';
import { evaluateCropComparison } from './comparison-evaluator.js';
import { mockEligibleDecision, validateDirectorCropDecision } from './director-crop-validator.js';
import type { DirectorCropDecisionV1 } from './comparison.types.js';
import { containOccupancy } from '../visual-hybrid/crop-geometry-facts.js';
import { CONTENT_01_GEOMETRY } from '../visual-hybrid/fixtures/content01-hybrid.fixture.js';

function compareClean() {
  const pack = assembleContent01Clean();
  const generation = generateSemanticCropCandidates(pack);
  return { pack, generation, evaluation: evaluateCropComparison(pack, generation) };
}

describe('B2-10 crop comparison + director contract', () => {
  const { pack, generation, evaluation } = compareClean();

  it('maps B2-9 statuses to eligibility without mutating candidates', () => {
    const center = evaluation.candidates.find((item) => item.strategy === 'CENTER_COVER')!;
    const contain = evaluation.candidates.find((item) => item.strategy === 'CONTAIN')!;
    const tight = evaluation.candidates.find((item) => item.strategy === 'UI_FOCUS' && item.variant === 'TIGHT');
    expect(center.eligibility).toBe('INELIGIBLE');
    expect(center.safetyStatus).toBe('UNSAFE');
    expect(evaluation.directorEligibleOptions.some((item) => item.candidateId === center.candidateId)).toBe(false);
    expect(contain.eligibility).toBe('ELIGIBLE_WITH_WARNINGS');
    if (tight) expect(tight.eligibility).toBe('INELIGIBLE');
    const src = generation.candidates.find((item) => item.candidateId === contain.candidateId)!;
    expect(contain.sourceRect).toEqual(src.sourceRect);
    expect(contain.fitMode).toEqual(src.fitMode);
    expect(contain.safetyStatus).toEqual(src.status);
  });

  it('keeps CONTAIN occupancy readability from being HIGH', () => {
    const contain = evaluation.candidates.find((item) => item.strategy === 'CONTAIN')!;
    expect(contain.metrics.outputOccupancy.value).toBeCloseTo(containOccupancy(CONTENT_01_GEOMETRY), 3);
    expect(contain.metrics.mobileReadability.label).not.toBe('HIGH');
    expect(contain.metrics.mobileReadability.label).toBe('LOW');
  });

  it('scores TOP_TRIM chrome exclusion above chrome-retaining CONTAIN without declaring a winner', () => {
    const contain = evaluation.candidates.find((item) => item.strategy === 'CONTAIN')!;
    const topTrim = evaluation.candidates.find((item) => item.strategy === 'TOP_TRIM')!;
    expect(topTrim.metrics.browserChromeExclusion.value).toBeGreaterThan(contain.metrics.browserChromeExclusion.value);
    expect(evaluation.winner).toBe('NOT_SELECTED');
    expect(evaluation.currentDecision).toBe('NOT_PERFORMED');
    expect(evaluation.recommendationBoundary.selectedCandidateId).toBe('NOT_SELECTED');
    expect(evaluation.recommendationBoundary.bestCandidate).toBe(false);
    expect(evaluation.recommendationBoundary.rank).toBe(false);
  });

  it('lowers evidence preservation when navigation/critical evidence is lost', () => {
    const center = evaluation.candidates.find((item) => item.strategy === 'CENTER_COVER')!;
    const contain = evaluation.candidates.find((item) => item.strategy === 'CONTAIN')!;
    expect(center.metrics.keyEvidencePreservation.value).toBeLessThan(contain.metrics.keyEvidencePreservation.value);
    expect(center.metrics.navigationPreservation.value).toBeLessThan(0.8);
  });

  it('does not label temporal stability HIGH when variance is present', () => {
    expect(generation.temporalVariance).toBe(true);
    expect(evaluation.candidates.every((item) => item.metrics.temporalStability.label !== 'HIGH')).toBe(true);
  });

  it('emits pairwise CONTAIN vs TOP_TRIM tradeoffs without overall winner', () => {
    const pair = evaluation.tradeoffs.filter(
      (item) =>
        (item.optionA.includes('contain') && item.optionB.includes('top-trim')) ||
        (item.optionA.includes('top-trim') && item.optionB.includes('contain')),
    );
    expect(pair.some((item) => item.axis === 'SOURCE_RETENTION')).toBe(true);
    expect(pair.some((item) => item.axis === 'BROWSER_CHROME_EXCLUSION')).toBe(true);
    const json = JSON.stringify(evaluation);
    expect(json).not.toContain('"bestCandidateId"');
    expect(json).not.toContain('"winnerCandidate"');
    expect(json).not.toContain('"rank":1');
    expect(json).not.toContain('"rank": 1');
  });

  it('keeps INELIGIBLE out of Director Pareto eligible options', () => {
    const ineligible = evaluation.candidates.filter((item) => item.eligibility === 'INELIGIBLE').map((item) => item.candidateId);
    expect(evaluation.paretoSummary.eligibleIds.some((id) => ineligible.includes(id))).toBe(false);
    expect(evaluation.directorEligibleOptions.length).toBeGreaterThanOrEqual(2);
  });

  it('blocks old contaminated asset comparison', () => {
    const oldPack = assembleHybridPackage(content01OldHybridInput());
    const oldGen = generateSemanticCropCandidates(oldPack);
    const oldEval = evaluateCropComparison(oldPack, oldGen);
    expect(oldEval.directorEligibleOptions).toEqual([]);
    expect(oldEval.decisionAllowed).toBe(false);
    expect(oldEval.staticDynamicSuitability).toBe('BLOCKED');
  });

  it('does not let C5 auto-publish retention raise claim support', () => {
    const publishPack = assembleHybridPackage(content01PublishHybridInput());
    const publishGen = generateSemanticCropCandidates(publishPack);
    const publishEval = evaluateCropComparison(publishPack, publishGen);
    expect(publishEval.candidates.every((item) => item.claimSupportImpact.find((claim) => claim.claimId === 'C5')?.status === 'NOT_APPLICABLE')).toBe(
      true,
    );
  });

  it('is deterministic and preserves sampled static/dynamic warnings', () => {
    const again = evaluateCropComparison(pack, generateSemanticCropCandidates(pack));
    expect(again).toEqual(evaluation);
    expect(evaluation.staticDynamicSuitability).toBe('STATIC_WITH_WARNINGS');
    expect(evaluation.humanReviewRecommended).toBe(true);
    expect(evaluation.humanReviewTriggers).toContain('STATIC_CROP_WARNINGS');
    expect(evaluation.humanReviewTriggers).toContain('SAMPLED_SEMANTIC_PRECISION');
  });

  it('rejects unsafe, unknown, blocked, and missing-rationale director decisions', () => {
    const centerId = evaluation.candidates.find((item) => item.strategy === 'CENTER_COVER')!.candidateId;
    const base = mockEligibleDecision(evaluation)!;
    expect(validateDirectorCropDecision(evaluation, base).ok).toBe(true);

    const unsafe: DirectorCropDecisionV1 = { ...base, selectedCandidateId: centerId };
    expect(validateDirectorCropDecision(evaluation, unsafe).ok).toBe(false);

    const unknown: DirectorCropDecisionV1 = { ...base, selectedCandidateId: 'not-existing-id' };
    expect(validateDirectorCropDecision(evaluation, unknown).ok).toBe(false);

    const missing: DirectorCropDecisionV1 = {
      ...base,
      rationale: { ...base.rationale, text: '', sourceRefs: [] },
    };
    expect(validateDirectorCropDecision(evaluation, missing).ok).toBe(false);

    const oldPack = assembleHybridPackage(content01OldHybridInput());
    const oldEval = evaluateCropComparison(oldPack, generateSemanticCropCandidates(oldPack));
    const override: DirectorCropDecisionV1 = {
      ...base,
      objective: 'CLEAN_PRESENTATION',
      selectedCandidateId: oldEval.candidates[0]?.candidateId ?? 'crop:contain',
    };
    expect(validateDirectorCropDecision(oldEval, override).ok).toBe(false);
  });
});
