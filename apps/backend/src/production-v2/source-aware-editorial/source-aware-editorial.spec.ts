import { describe, expect, it } from 'vitest';
import { cropForScale } from '../editorial-shot-director/crop-for-scale.js';
import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import { resolveSourceVisualType } from './source-type.js';
import { policyFor } from './policy.js';
import { auditCropIntegrity, expandUntilIntegrity } from './integrity.js';
import { CONTENT_01_CONTAINERS } from './containers.js';
import { countDecisions, directSourceAwareEditorialPlan } from './director.js';
import { reframeHasPositiveValue, valueOfBrokenUiCrop } from './reframe-value.js';
import { smartUiFit } from './smart-ui-fit.js';
import { isLikelyBlankFrame, isWhiteUiNotBlank, unexpectedBlankSequenceMs, ptsContinuity, filterHasConcatGapRisk } from '../editorial-shot-runtime/continuity.js';
import { buildEditorialFilterGraph } from '../editorial-shot-runtime/filter-builder.js';
import { loadFrozenEditorialPlan } from '../editorial-shot-runtime/plan-io.js';

describe('B2-15E source-aware director + integrity + blank-gap', () => {
  const plan = directSourceAwareEditorialPlan();
  const counts = countDecisions(plan);

  it('classifies Content #1 as SCREEN_RECORDING_UI_DEMO with WIDE_FIRST', () => {
    const resolved = resolveSourceVisualType({
      assetId: CONTENT_01_NEW_ASSET_ID,
      humanSourceHint: 'SOFTWARE_OR_WEB_RECORDING',
    });
    expect(resolved.sourceVisualType).toBe('SCREEN_RECORDING_UI_DEMO');
    expect(resolved.visionCalls).toBe(0);
    expect(policyFor('SCREEN_RECORDING_UI_DEMO').defaultStrategy).toBe('WIDE_FIRST');
    expect(policyFor('SCREEN_RECORDING_UI_DEMO').mediumIsDefault).toBe(false);
    expect(plan.mediumIsDefault).toBe(false);
  });

  it('does not force MEDIUM by quota', () => {
    expect(plan.shotQuota).toBe('REMOVED');
    expect(counts.medium).toBe(0);
    expect(counts.wide).toBeGreaterThan(0);
  });

  it('treats KEEP_CURRENT_COMPOSITION as legal', () => {
    expect(policyFor('SCREEN_RECORDING_UI_DEMO').keepCurrentIsLegal).toBe(true);
    expect(counts.keep).toBeGreaterThan(0);
    expect(plan.decisions.some((item) => item.decision === 'KEEP_CURRENT_COMPOSITION')).toBe(true);
  });

  it('rejects text-cutting crops and falls back wide/keep', () => {
    const medium = cropForScale('MEDIUM_FOCUS').crop;
    const audit = auditCropIntegrity(medium);
    expect(audit.ok).toBe(false);
    expect(audit.codes).toContain('TEXT_LINE_CUT');
    expect(plan.shots.every((item) => item.integrityResult.ok)).toBe(true);
  });

  it('rejects broken semantic containers', () => {
    const medium = cropForScale('MEDIUM_FOCUS').crop;
    expect(auditCropIntegrity(medium).codes).toContain('SEMANTIC_CONTAINER_FRAGMENTED');
    const detail = cropForScale('DETAIL_READABLE').crop;
    expect(auditCropIntegrity(detail).ok).toBe(false);
  });

  it('allows a complete container crop', () => {
    const page = CONTENT_01_CONTAINERS[0].rect;
    expect(auditCropIntegrity(page).ok).toBe(true);
  });

  it('rejects no-value reframe', () => {
    expect(reframeHasPositiveValue(valueOfBrokenUiCrop())).toBe(false);
    expect(plan.shots.every((item) => item.decision !== 'MEDIUM_FOCUS' && item.decision !== 'DETAIL_READABLE')).toBe(true);
  });

  it('implements smart UI fit without cutting the page', () => {
    const fit = smartUiFit();
    expect(fit.fitMode).toBe('CONTAIN');
    expect(fit.containerRef).toBe('container:PAGE');
    expect(auditCropIntegrity(fit.crop).ok).toBe(true);
  });

  it('detects synthetic concat overlay gap risk and PTS gaps', () => {
    expect(filterHasConcatGapRisk('[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30[out]')).toBe(true);
    const frozen = loadFrozenEditorialPlan();
    const graph = buildEditorialFilterGraph({ shots: frozen.shots, sourceWidth: 1920, sourceHeight: 1040 });
    expect(filterHasConcatGapRisk(graph.filter)).toBe(false);
    expect(ptsContinuity(frozen.shots).ok).toBe(true);
    expect(ptsContinuity([{ sourceStartMs: 0, sourceEndMs: 1000 }, { sourceStartMs: 1500, sourceEndMs: 2000 }]).ok).toBe(false);
  });

  it('does not flag structured white UI as blank', () => {
    const whiteUi = { tMs: 8000, lumaMean: 0.93, lumaVariance: 0.02, edgeEnergy: 0.18 };
    const emptyWhite = { tMs: 8000, lumaMean: 0.97, lumaVariance: 0.0002, edgeEnergy: 0.002 };
    expect(isWhiteUiNotBlank(whiteUi)).toBe(true);
    expect(isLikelyBlankFrame(whiteUi)).toBe(false);
    expect(isLikelyBlankFrame(emptyWhite)).toBe(true);
    const seq = unexpectedBlankSequenceMs([
      { tMs: 6300, lumaMean: 0.96, lumaVariance: 0.0002, edgeEnergy: 0.002 },
      { tMs: 6400, lumaMean: 0.97, lumaVariance: 0.0002, edgeEnergy: 0.002 },
      { tMs: 6500, lumaMean: 0.97, lumaVariance: 0.0002, edgeEnergy: 0.002 },
    ]);
    expect(seq.blank).toBe(true);
  });

  it('does not approve or authorize', () => {
    expect(plan.provenance.ffmpegCalls).toBe(0);
    expect(plan.provenance.visionCalls).toBe(0);
    expect(plan.provenance.llmCalls).toBe(0);
  });

  it('expands tight crops toward containers before fallback', () => {
    const detail = cropForScale('DETAIL_READABLE').crop;
    const expanded = expandUntilIntegrity(detail);
    expect(expanded.expanded).toBe(true);
  });
});
