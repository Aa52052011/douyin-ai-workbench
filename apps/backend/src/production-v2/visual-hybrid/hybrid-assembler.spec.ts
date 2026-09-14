import { describe, expect, it } from 'vitest';
import { constraintOfType } from './crop-constraint-rules.js';
import { coverRetainedAreaRatio, containOccupancy } from './crop-geometry-facts.js';
import { assembleHybridPackage } from './hybrid-assembler.js';
import { riskLevel } from './crop-risk-rules.js';
import {
  CONTENT_01_GEOMETRY,
  assembleContent01Clean,
  content01CleanHybridInput,
  content01OldHybridInput,
  content01PublishHybridInput,
} from './fixtures/content01-hybrid.fixture.js';

describe('B2-8 hybrid visual assembly', () => {
  it('assembles READY hybrid for current clean recording without blocking', () => {
    const pack = assembleContent01Clean();
    expect(pack.hybrid.status).not.toBe('BLOCKED');
    expect(pack.hybrid.status).toBe('READY');
    expect(pack.hybrid.usageAssessment.status).toBe('PREFERRED');
    expect(pack.hybrid.productionEligibility).toBe('ALLOWED');
    expect(pack.hybrid.finalShotDecision).toBe('NOT_PERFORMED');
    expect(pack.hybrid.finalCropDecision).toBe('NOT_PERFORMED');
    expect(pack.cropInput.winner).toBe('NOT_SELECTED');
    expect(pack.cropInput.finalFitMode).toBe('NOT_SELECTED');
  });

  it('marks browser chrome PREFER_EXCLUDE not HARD_EXCLUDE', () => {
    const { cropInput } = assembleContent01Clean();
    expect(constraintOfType(cropInput.constraints, 'BROWSER_CHROME')).toBe('PREFER_EXCLUDE');
    expect(constraintOfType(cropInput.constraints, 'BROWSER_CHROME')).not.toBe('HARD_EXCLUDE');
  });

  it('marks PRODUCT_UI SHOULD_KEEP not blanket MUST_KEEP', () => {
    const { cropInput } = assembleContent01Clean();
    expect(constraintOfType(cropInput.constraints, 'PRODUCT_UI')).toBe('SHOULD_KEEP');
    expect(cropInput.constraints.filter((item) => item.semanticType === 'PRODUCT_UI').every((item) => item.kind !== 'MUST_KEEP')).toBe(true);
  });

  it('exposes CENTER/COVER evidence-loss and CONTAIN readability risks', () => {
    const { cropInput } = assembleContent01Clean();
    expect(coverRetainedAreaRatio(CONTENT_01_GEOMETRY)).toBeCloseTo(0.3047, 3);
    expect(containOccupancy(CONTENT_01_GEOMETRY)).toBeCloseTo(0.3047, 3);
    expect(riskLevel(cropInput.risks, 'CENTER/COVER', 'LOW_RETAINED_AREA')).toBe('HIGH');
    expect(riskLevel(cropInput.risks, 'CONTAIN', 'READABILITY_LOSS')).toBe('HIGH');
  });

  it('does not emit director or crop winner fields', () => {
    const json = JSON.stringify(assembleContent01Clean());
    expect(json).not.toContain('"selectedCrop"');
    expect(json).not.toContain('"finalCrop"');
    expect(json).not.toContain('"selectedFitMode"');
    expect(json).not.toContain('"shotDuration"');
    expect(json).not.toContain('"trimStart"');
    expect(json).not.toContain('"zoomPlan"');
    expect(json).not.toContain('"transitionPlan"');
  });

  it('keeps stale mock production blocked despite geometry', () => {
    const pack = assembleHybridPackage(content01OldHybridInput());
    expect(pack.hybrid.productionEligibility).toBe('BLOCKED');
    expect(pack.hybrid.status).toBe('BLOCKED');
    expect(pack.cropInput.status).toBe('BLOCKED');
    expect(pack.hybrid.usageAssessment.status).toBe('DO_NOT_USE');
  });

  it('does not make publish button MUST_KEEP for unsupported auto-publish claim', () => {
    const pack = assembleHybridPackage(content01PublishHybridInput());
    const c5 = pack.cropInput.claimLinks.find((item) => item.claimId === 'C5');
    expect(c5?.claimCritical).toBe(false);
    expect(c5?.support).not.toBe('SUPPORTED');
    expect(constraintOfType(pack.cropInput.constraints, 'BUTTON_LIKE_REGION')).not.toBe('MUST_KEEP');
  });

  it('is deterministic', () => {
    const a = assembleHybridPackage(content01CleanHybridInput());
    const b = assembleHybridPackage(content01CleanHybridInput());
    expect(a).toEqual(b);
  });

  it('attaches sourceRefs and ruleIds on constraints and risks', () => {
    const { cropInput } = assembleContent01Clean();
    expect(cropInput.constraints.every((item) => item.sourceRefs.length > 0 && item.ruleIds.length >= 0)).toBe(true);
    expect(cropInput.risks.every((item) => item.sourceRefs.length > 0 && item.ruleIds.length > 0)).toBe(true);
  });

  it('does not let FORCE_KEEP bypass stale hard exclude', () => {
    const input = content01OldHybridInput();
    input.regionOverrides = [{ kind: 'FORCE_KEEP_REGION', semanticType: 'PRODUCT_UI' }];
    const pack = assembleHybridPackage(input);
    expect(pack.cropInput.constraints.filter((item) => item.semanticType === 'PRODUCT_UI').every((item) => item.kind === 'HARD_EXCLUDE')).toBe(
      true,
    );
  });
});
