import { describe, expect, it } from 'vitest';
import { productionConstraintRegistry } from './production-constraints.js';
import {
  O2G_OPENING_ZOOMPAN_EXPR,
  analyzeMotionSamples,
  auditVerticalMotionRootCause,
  buildScreenshotStaticHoldFilter,
  directorMotionBoundaryPolicy,
  evaluateUiDemoMotionStabilityGate,
  motionBudgetPolicy,
  openingRepairDecision,
  simulateO2gOpeningZoompan,
  simulateStaticHold,
} from './motion-stability.js';

describe('B2-15O2H UI demo motion stability', () => {
  it('identifies O2G zoompan as continuous micro zoom/drift and rejects it', () => {
    const audit = auditVerticalMotionRootCause();
    expect(audit.notGuess).toBe(true);
    expect(audit.evidence.expression).toBe(O2G_OPENING_ZOOMPAN_EXPR);
    const before = analyzeMotionSamples(simulateO2gOpeningZoompan(250));
    expect(before.microDeltaCount).toBeGreaterThan(8);
    expect(before.largestCropDelta).toBeGreaterThan(0);
    const rejected = evaluateUiDemoMotionStabilityGate({
      samples: simulateO2gOpeningZoompan(250),
      decision: { ...openingRepairDecision(), motionType: 'FORBIDDEN' },
    });
    expect(['REJECT_MICRO_JITTER', 'REJECT_MICRO_DRIFT']).toContain(rejected.status);
  });

  it('accepts static hold, default STATIC/LOW budget, and 24 frozen constraints', () => {
    const after = evaluateUiDemoMotionStabilityGate({
      samples: simulateStaticHold(250),
      decision: openingRepairDecision(),
    });
    expect(after.status).toBe('PASS');
    expect(after.metrics.microDeltaCount).toBe(0);
    expect(after.metrics.cropVariance).toBe(0);
    expect(directorMotionBoundaryPolicy().principle).toBe('UI_DEMO_STABILITY_FIRST');
    expect(motionBudgetPolicy().uiDemoDefault).toBe('STATIC_OR_LOW');
    expect(openingRepairDecision().motionRequired).toBe(false);
    expect(buildScreenshotStaticHoldFilter(1080, 1920, 8.352)).not.toContain('zoompan');
    expect(productionConstraintRegistry().constraints).toHaveLength(24);
    const high = evaluateUiDemoMotionStabilityGate({
      samples: simulateStaticHold(2),
      decision: { ...openingRepairDecision(), motionBudget: 'HIGH', reason: '' },
    });
    expect(high.status).toBe('REJECT_UNJUSTIFIED_MOTION');
  });
});
