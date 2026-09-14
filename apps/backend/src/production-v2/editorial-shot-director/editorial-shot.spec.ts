import { describe, expect, it } from 'vitest';
import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import { cropForScale, occupancyInBand } from './crop-for-scale.js';
import { directEditorialShotPlan } from './director.js';
import { EDITORIAL_SHOT_POLICY } from './policy.js';
import { auditPlanSafeArea } from './safe-area.js';
import { consecutiveDetailRuns, requiresContextRecovery, validateEditorialPlan } from './validator.js';
import type { EditorialShotPlanV1, EditorialShotV1 } from './types.js';
import { NARRATION_VISUAL_UNIT_VERSION } from './policy.js';

function cloneShot(plan: EditorialShotPlanV1, overrides: Partial<EditorialShotV1>): EditorialShotV1 {
  return { ...plan.shots[0], ...overrides };
}

describe('B2-15C editorial shot director', () => {
  const plan = directEditorialShotPlan();

  it('uses three scales, medium default, and rejects all-detail plans', () => {
    expect(plan.shots.some((item) => item.shotScale === 'WIDE_CONTEXT')).toBe(true);
    expect(plan.shots.some((item) => item.shotScale === 'MEDIUM_FOCUS')).toBe(true);
    expect(plan.shots.some((item) => item.shotScale === 'DETAIL_READABLE')).toBe(true);
    expect(EDITORIAL_SHOT_POLICY.defaultScale).toBe('MEDIUM_FOCUS');
    const allDetail: EditorialShotPlanV1 = {
      ...plan,
      shots: plan.shots.map((item) => ({ ...item, shotScale: 'DETAIL_READABLE' as const })),
    };
    expect(validateEditorialPlan(allDetail).ok).toBe(false);
  });

  it('inserts context recovery instead of unbounded consecutive detail', () => {
    expect(requiresContextRecovery(plan.shots)).toBe(false);
    const runs = consecutiveDetailRuns(plan.shots);
    expect(runs.every((run) => run.count <= EDITORIAL_SHOT_POLICY.maxConsecutiveDetailShots)).toBe(true);
    const stacked: EditorialShotV1[] = plan.shots.slice(0, 3).map((item, index) => ({
      ...item,
      shotScale: 'DETAIL_READABLE',
      sourceStartMs: index * 3000,
      sourceEndMs: index * 3000 + 3000,
    }));
    expect(requiresContextRecovery(stacked)).toBe(true);
  });

  it('prefers MEDIUM when claim-critical text is not required', () => {
    const opening = plan.shots.filter((item) => item.narrationUnitRefs.includes('nu:opening'));
    expect(opening.length).toBeGreaterThan(0);
    expect(opening.every((item) => item.shotScale === 'MEDIUM_FOCUS')).toBe(true);
  });

  it('uses DETAIL for claim-critical text rather than context-only', () => {
    const details = plan.shots.filter((item) => item.shotScale === 'DETAIL_READABLE');
    expect(details.length).toBeGreaterThan(0);
    expect(details.every((item) => item.readabilityTarget === 'CLAIM_CRITICAL_READABLE')).toBe(true);
    expect(details.every((item) => item.narrationUnitRefs.includes('nu:section1'))).toBe(true);
  });

  it('rejects shots without narration/claim rationale', () => {
    const bad: EditorialShotPlanV1 = {
      ...plan,
      shots: [cloneShot(plan, { narrationUnitRefs: [], claimRefs: [], shotPurpose: 'zoom for fun' }), ...plan.shots.slice(1)],
    };
    expect(validateEditorialPlan(bad).ok).toBe(false);
  });

  it('applies background by scale', () => {
    expect(plan.shots.filter((item) => item.shotScale === 'WIDE_CONTEXT').every((item) => item.backgroundTreatment === 'BLUR_SOURCE_DARKENED')).toBe(true);
    expect(plan.shots.filter((item) => item.shotScale === 'DETAIL_READABLE').every((item) => item.backgroundTreatment === 'OPTIONAL_NONE')).toBe(true);
    expect(occupancyInBand('WIDE_CONTEXT')).toBe(true);
    expect(occupancyInBand('MEDIUM_FOCUS')).toBe(true);
    expect(cropForScale('DETAIL_READABLE').fitMode).toBe('COVER');
  });

  it('audits approximate Douyin safe area without claiming pixel-perfect UI', () => {
    expect(plan.simulator.precision).toBe('APPROXIMATE_DOUYIN_MOBILE_VIEW');
    const audit = auditPlanSafeArea(plan.shots);
    expect(audit.ok).toBe(true);
  });

  it('does not create approval/authorization and preserves C5/C6', () => {
    expect(plan.assetId).toBe(CONTENT_01_NEW_ASSET_ID);
    expect(plan.shots.every((item) => !item.claimRefs.includes('C5') && !item.claimRefs.includes('C6'))).toBe(true);
    expect(plan.provenance.ffmpegCalls).toBe(0);
    expect(validateEditorialPlan(plan).ok).toBe(true);
    expect(plan.humanFeedbackPreserved).toContain('DETAIL_OVERUSED');
  });

  it('covers source and keeps estimated timing provenance', () => {
    expect(plan.coverage.fullSource).toBe(true);
    expect(plan.coverage.endMs).toBe(35107);
    expect(plan.shots.every((item) => item.safetyPrecision === 'ESTIMATED_ALIGNMENT')).toBe(true);
    expect(NARRATION_VISUAL_UNIT_VERSION).toBe('narration.visual-unit:v1');
    expect(plan.shots.length).toBeGreaterThanOrEqual(6);
    expect(plan.shots.length).toBeLessThanOrEqual(10);
    const mediumMs = plan.shots.filter((item) => item.shotScale === 'MEDIUM_FOCUS').reduce((sum, item) => sum + item.sourceEndMs - item.sourceStartMs, 0);
    const total = plan.coverage.endMs;
    expect(mediumMs).toBeGreaterThan(total * 0.4);
  });
});
