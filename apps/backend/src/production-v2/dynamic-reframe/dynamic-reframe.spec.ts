import { describe, expect, it } from 'vitest';
import { assembleHybridPackage } from '../visual-hybrid/hybrid-assembler.js';
import {
  assembleContent01Clean,
  CLEAN_RECORDING_OBSERVATIONS,
  content01OldHybridInput,
  content01PublishHybridInput,
} from '../visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { buildContent01HumanFeedback } from './human-feedback.js';
import {
  establishingMayCarryClaimCritical,
  HUMAN_MOBILE_READABILITY_STANDARD,
  mobileReadabilityAccepted,
  readabilityFails,
} from './mobile-readability.js';
import { c5Boosted, planDynamicReframe } from './planner.js';
import { buildVisualRepairPlan } from './repair-plan.js';
import { DYNAMIC_REFRAME_THRESHOLDS } from './thresholds.js';

describe('B2-15A mobile-first dynamic reframe', () => {
  const pack = assembleContent01Clean();
  const plan = planDynamicReframe({
    pack,
    observations: CLEAN_RECORDING_OBSERVATIONS,
    durationMs: DYNAMIC_REFRAME_THRESHOLDS.sourceDurationMs,
    sourceCandidateRef: 'crop:top-trim',
  });

  it('treats desktop-only and fullscreen-only as FAIL', () => {
    expect(HUMAN_MOBILE_READABILITY_STANDARD.standard).toBe('DOUYIN_DEFAULT_MOBILE_VIEW');
    expect(mobileReadabilityAccepted(readabilityFails({ desktopOnly: true }))).toBe(false);
    expect(readabilityFails({ desktopOnly: true })).toContain('DESKTOP_ONLY_READABLE');
    expect(readabilityFails({ fullscreenOnly: true })).toContain('FULLSCREEN_ONLY_READABLE');
    expect(readabilityFails({ manualZoomRequired: true })).toContain('MANUAL_ZOOM_REQUIRED');
  });

  it('lets establishing context be CONTEXT_ONLY and not claim-critical', () => {
    const establish = plan.segments.find((item) => item.intent === 'ESTABLISH_CONTEXT');
    expect(establish?.targetReadability).toBe('CONTEXT_ONLY');
    expect(establishingMayCarryClaimCritical(establish!.targetReadability)).toBe(false);
  });

  it('plans claim-critical text as CLAIM_CRITICAL_READABLE', () => {
    const text = plan.segments.find((item) => item.intent === 'FOCUS_TEXT');
    expect(text?.targetReadability).toBe('CLAIM_CRITICAL_READABLE');
  });

  it('merges or rejects 0.5s mechanical reframe pulses', () => {
    const textRect = { x: 0.22, y: 0.12, width: 0.4, height: 0.06 };
    const navRect = { x: 0.085, y: 0.106, width: 0.14, height: 0.72 };
    const observations = Array.from({ length: 8 }, (_, index) => {
      const ts = index * 500;
      const nav = index % 2 === 1;
      return {
        type: nav ? 'NAVIGATION' : 'TEXT_REGION',
        frameId: `semantic-frame:${ts}`,
        confidence: 0.8,
        region: nav ? navRect : textRect,
      };
    });
    const mechanical = planDynamicReframe({ pack, observations, durationMs: 4000, sourceCandidateRef: 'crop:top-trim' });
    expect(mechanical.segments.every((item) => item.endMs - item.startMs >= DYNAMIC_REFRAME_THRESHOLDS.minAvgReframeIntervalMs)).toBe(
      true,
    );
    const avg = 4000 / Math.max(mechanical.segments.length, 1);
    expect(avg).toBeGreaterThanOrEqual(DYNAMIC_REFRAME_THRESHOLDS.minAvgReframeIntervalMs);
  });

  it('rejects unsafe localhost/hard-exclude focus from the plan', () => {
    const unsafe = planDynamicReframe({
      pack: assembleHybridPackage(content01OldHybridInput()),
      observations: [
        { type: 'LOCALHOST_REFERENCE', frameId: 'semantic-frame:0', confidence: 0.9, region: { x: 0, y: 0, width: 1, height: 1 } },
        { type: 'PRODUCT_UI', frameId: 'semantic-frame:0', confidence: 0.7, region: { x: 0, y: 0, width: 1, height: 1 } },
      ],
      durationMs: 3000,
    });
    expect(unsafe.segments.every((item) => !item.warnings.includes('UNSAFE_LOCALHOST') && !item.warnings.includes('UNSAFE_HARD_EXCLUDE'))).toBe(
      true,
    );
    expect(unsafe.segments.length === 0 || unsafe.segments.every((item) => item.focusRegionRef.includes('PRODUCT_UI') === false)).toBe(true);
  });

  it('does not boost C5 auto-publish via button zoom', () => {
    const publish = planDynamicReframe({
      pack: assembleHybridPackage(content01PublishHybridInput()),
      observations: [
        { type: 'PRODUCT_UI', frameId: 'semantic-frame:0', confidence: 0.8, region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } },
        { type: 'BUTTON_LIKE_REGION', frameId: 'semantic-frame:0', confidence: 0.7, region: { x: 0.4, y: 0.4, width: 0.2, height: 0.1 } },
      ],
      durationMs: 4000,
    });
    expect(c5Boosted(publish)).toBe(false);
    expect(publish.segments.every((item) => !item.claimRefs.includes('C5'))).toBe(true);
  });

  it('is deterministic for the same evidence', () => {
    const again = planDynamicReframe({
      pack: assembleContent01Clean(),
      observations: CLEAN_RECORDING_OBSERVATIONS,
      durationMs: DYNAMIC_REFRAME_THRESHOLDS.sourceDurationMs,
      sourceCandidateRef: 'crop:top-trim',
    });
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
    expect(again.segments.map((item) => item.segmentId)).toEqual(plan.segments.map((item) => item.segmentId));
  });

  it('preserves human repair findings and does not approve', () => {
    const feedback = buildContent01HumanFeedback();
    const repair = buildVisualRepairPlan('human-visual-review-feedback:content-01');
    expect(feedback.decision).toBe('REQUEST_CHANGES');
    expect(feedback.source).toBe('EXPLICIT_USER_MESSAGE');
    expect(feedback.approved).toBe(false);
    expect(feedback.findings).toEqual(expect.arrayContaining([
      'PRODUCT_UI_TOO_SMALL',
      'TEXT_UNREADABLE_ON_DOUYIN_DEFAULT_MOBILE_VIEW',
      'BACKGROUND_VISUAL_SEPARATION_WEAK',
      'DYNAMIC_REFRAME_REQUIRED',
    ]));
    expect(repair.repairType).toBe('DYNAMIC_REFRAME');
    expect(repair.humanReviewRequiredAfterRepair).toBe(true);
  });

  it('covers Content #1 with sampled precision and mixed context/focus', () => {
    expect(plan.coverage.fullSource).toBe(true);
    expect(plan.globalConstraints.timingPrecision).toBe('SAMPLED');
    expect(plan.segments.some((item) => item.intent === 'ESTABLISH_CONTEXT')).toBe(true);
    expect(plan.segments.some((item) => item.intent === 'FOCUS_TEXT' || item.intent === 'FOCUS_PRODUCT_UI')).toBe(true);
    expect(plan.provenance.ffmpegCalls).toBe(0);
  });
});
