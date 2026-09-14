import { describe, expect, it } from 'vitest';
import { assembleHybridPackage } from '../visual-hybrid/hybrid-assembler.js';
import {
  assembleContent01Clean,
  content01OldHybridInput,
  content01PublishHybridInput,
} from '../visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { coverRetainedAreaRatio, containOccupancy } from '../visual-hybrid/crop-geometry-facts.js';
import { CONTENT_01_GEOMETRY } from '../visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { generateSemanticCropCandidates, strategyStatus, coverageLostImportant, dedupSameStrategy } from './crop-candidate-assembler.js';
import { assertValidNormalizedRect, toPixelRect, CropRectValidationError } from './index.js';
import { CROP_SAFETY_THRESHOLDS } from './threshold-config.js';

describe('B2-9 semantic crop candidates + safety', () => {
  const pack = assembleContent01Clean();
  const result = generateSemanticCropCandidates(pack);

  it('generates required strategies for clean asset without blocking generation', () => {
    expect(result.generationStatus).toBe('READY');
    expect(result.candidates.length).toBeGreaterThanOrEqual(5);
    expect(result.candidates.length).toBeLessThanOrEqual(CROP_SAFETY_THRESHOLDS.maxCandidates);
    expect(strategyStatus(result, 'CONTAIN')).not.toBe('NOT_GENERATED');
    expect(strategyStatus(result, 'CENTER_COVER')).not.toBe('NOT_GENERATED');
    expect(strategyStatus(result, 'TOP_TRIM')).not.toBe('NOT_GENERATED');
    expect(strategyStatus(result, 'UI_FOCUS')).not.toBe('NOT_GENERATED');
    expect(strategyStatus(result, 'SAFE_REGION')).not.toBe('NOT_GENERATED');
  });

  it('marks CENTER_COVER high evidence-loss and important-region shortfall', () => {
    const center = result.candidates.find((item) => item.strategy === 'CENTER_COVER')!;
    expect(center.retainedAreaRatio).toBeCloseTo(coverRetainedAreaRatio(CONTENT_01_GEOMETRY), 3);
    expect(center.retainedAreaRatio).toBeCloseTo(0.3047, 3);
    expect(center.riskSignals.some((item) => item.code === 'EVIDENCE_LOSS_RISK' && (item.severity === 'HIGH' || item.severity === 'CRITICAL'))).toBe(true);
    expect(coverageLostImportant(pack, center)).toBe(true);
    expect(center.status === 'UNSAFE' || center.status === 'VALID_WITH_WARNINGS').toBe(true);
  });

  it('marks CONTAIN full retain with occupancy/readability risk, not risk-free best', () => {
    const contain = result.candidates.find((item) => item.strategy === 'CONTAIN')!;
    expect(contain.retainedAreaRatio).toBe(1);
    expect(contain.sourceOccupancy).toBeCloseTo(containOccupancy(CONTENT_01_GEOMETRY), 3);
    expect(contain.riskSignals.some((item) => item.code === 'READABILITY_LOSS' && item.severity === 'HIGH')).toBe(true);
    expect(contain.riskSignals.some((item) => item.code === 'LOW_OCCUPANCY')).toBe(true);
    expect(contain.status).toBe('VALID_WITH_WARNINGS');
    expect(contain.status).not.toBe('VALID');
  });

  it('lets TOP_TRIM lower browser chrome without treating it as truth failure', () => {
    const trim = result.candidates.find((item) => item.strategy === 'TOP_TRIM')!;
    const center = result.candidates.find((item) => item.strategy === 'CENTER_COVER')!;
    expect(trim.browserChromeCoverage ?? 1).toBeLessThan(center.browserChromeCoverage ?? 0);
    expect(trim.positiveSignals).toContain('BROWSER_CHROME_EXCLUDED');
    expect(trim.safety.hardViolations.some((item) => item.includes('TRUTH'))).toBe(false);
    expect(trim.navigationCoverage ?? 0).toBeGreaterThanOrEqual(0.8);
    expect(trim.productUiCoverage ?? 0).toBeGreaterThanOrEqual(0.8);
  });

  it('builds UI_FOCUS from semantics, not as a copy of CENTER_COVER', () => {
    const focus = result.candidates.find((item) => item.strategy === 'UI_FOCUS')!;
    const center = result.candidates.find((item) => item.strategy === 'CENTER_COVER')!;
    expect(focus.sourceRect).not.toEqual(center.sourceRect);
    expect(focus.generatedFrom).not.toBe('geometry');
  });

  it('requires SAFE_REGION to cover key child regions', () => {
    const safe = result.candidates.find((item) => item.strategy === 'SAFE_REGION')!;
    expect(safe.navigationCoverage ?? 0).toBeGreaterThanOrEqual(0.8);
    expect(safe.evidenceCoverage ?? 0).toBeGreaterThanOrEqual(0.8);
    expect(safe.positiveSignals).toContain('KEY_EVIDENCE_PRESERVED');
  });

  it('blocks old contaminated asset generation', () => {
    const blocked = generateSemanticCropCandidates(assembleHybridPackage(content01OldHybridInput()));
    expect(blocked.generationStatus).toBe('BLOCKED_BY_ASSET_USAGE');
    expect(blocked.candidates).toEqual([]);
    expect(blocked.skipReason).toBe('PRODUCTION_ELIGIBILITY_BLOCKED');
  });

  it('does not elevate unsupported auto-publish UI to MUST_KEEP', () => {
    const publish = generateSemanticCropCandidates(assembleHybridPackage(content01PublishHybridInput()));
    const hybrid = assembleHybridPackage(content01PublishHybridInput());
    const c5 = hybrid.cropInput.claimLinks.find((item) => item.claimId === 'C5');
    expect(c5?.claimCritical).toBe(false);
    expect(hybrid.cropInput.constraints.some((item) => item.semanticType === 'BUTTON_LIKE_REGION' && item.kind === 'MUST_KEEP')).toBe(false);
    expect(publish.candidates.every((item) => !item.safety.hardViolations.some((code) => code.includes('C5')))).toBe(true);
  });

  it('attaches provenance and sampled precision', () => {
    expect(result.safetyPrecision).toBe('SAMPLED');
    expect(result.candidates.every((item) => item.safetyPrecision === 'SAMPLED')).toBe(true);
    expect(result.candidates.every((item) => item.notFrameAccurate)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('FRAME_ACCURATE');
    expect(result.candidates.every((item) => item.provenance.sourceRefs.length > 0 && item.provenance.ruleIds.length > 0)).toBe(true);
    expect(result.candidates.every((item) => item.safety.ruleIds.length > 0 && item.safety.sourceRefs.length > 0)).toBe(true);
    expect(result.candidates.every((item) => item.safety.perFrame.length > 0)).toBe(true);
    expect(result.candidates.every((item) => item.safety.aggregate.worstFrameId)).toBeTruthy();
  });

  it('does not emit a final crop winner or director fields', () => {
    const json = JSON.stringify(result);
    expect(result.winner).toBe('NOT_SELECTED');
    expect(result.finalFitMode).toBe('NOT_SELECTED');
    expect(result.directorDecision).toBe('NOT_PERFORMED');
    expect(result.ffmpegExecuted).toBe(false);
    expect(result.candidates.every((item) => item.winner === false && item.selected === false)).toBe(true);
    expect(json).not.toContain('"finalCrop"');
    expect(json).not.toContain('"selectedFitMode"');
    expect(json).not.toContain('"winner":true');
    expect(json).not.toContain('"selected":true');
  });

  it('is deterministic', () => {
    const again = generateSemanticCropCandidates(assembleContent01Clean());
    expect(again).toEqual(result);
    expect(again.candidates.map((item) => item.candidateId)).toEqual(result.candidates.map((item) => item.candidateId));
  });

  it('rejects invalid rects without silent clamp', () => {
    expect(() => assertValidNormalizedRect({ x: -0.1, y: 0, width: 0.5, height: 0.5 })).toThrow(CropRectValidationError);
    expect(() => assertValidNormalizedRect({ x: 0, y: 0, width: 1.2, height: 0.5 })).toThrow(CropRectValidationError);
    expect(() => assertValidNormalizedRect({ x: Number.NaN, y: 0, width: 0.5, height: 0.5 })).toThrow(CropRectValidationError);
    expect(() => toPixelRect({ x: 0, y: 0, width: 2, height: 1 }, CONTENT_01_GEOMETRY)).toThrow(CropRectValidationError);
  });

  it('dedups equivalent same-strategy candidates at IoU >= 0.95', () => {
    const contain = result.candidates.find((item) => item.strategy === 'CONTAIN')!;
    const clone = { ...contain, candidateId: 'crop:contain:dup' };
    const { unique, deduped } = dedupSameStrategy([contain, clone]);
    expect(unique).toHaveLength(1);
    expect(deduped).toEqual([{ droppedId: 'crop:contain:dup', keptId: contain.candidateId, iou: 1 }]);
  });

  it('computes key evidence coverage and per-frame/worst-frame safety', () => {
    expect(result.candidates.every((item) => item.evidenceCoverage !== undefined)).toBe(true);
    expect(result.staticCropAssessment).not.toBe('NOT_EVALUATED');
    expect(result.candidates[0].safety.aggregate.worstFrameId).toBeTruthy();
  });
});
