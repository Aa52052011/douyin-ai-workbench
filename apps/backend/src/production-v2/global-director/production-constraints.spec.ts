import { describe, expect, it } from 'vitest';
import { SELECTED_V2_SHARPEN } from '../audio-calibration/audio-integration.js';
import { loadFrozenScriptBeats } from '../editorial-shot-director/narration-units.js';
import { SCRIPT_TIMELINE_AUTHORITY, buildContent01DirectorPlan } from './director-v1.js';
import { REJECTED_SECTION4_CANDIDATE } from './visual-governance.js';
import {
  capabilityFailurePolicy,
  detectConstraintRegression,
  missingCapabilityLedger,
  noQualityDowngradePolicy,
  productionConstraintRegistry,
} from './production-constraints.js';
import { blendPageTowardContent, buildSection4VerticalFilter, section4SourceSelection } from './section4-repair.js';

describe('B2-15O2F constraints and section4 repair contracts', () => {
  it('loads frozen cumulative constraints and no-downgrade policy', () => {
    const registry = productionConstraintRegistry();
    expect(registry.constraints).toHaveLength(24);
    expect(registry.constraints.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'UI_DEMO_STABILITY_FIRST',
        'NO_DECORATIVE_MICRO_MOTION_IN_UI_DEMOS',
        'STABLE_CROP_WHEN_SEMANTIC_TARGET_UNCHANGED',
        'MOTION_REQUIRES_SEMANTIC_PURPOSE',
        'NO_SUBPIXEL_DRIFT_FOR_UI_TEXT',
      ]),
    );
    expect(registry.constraints.every((c) => c.status === 'FROZEN' || c.status === 'ACTIVE')).toBe(true);
    expect(registry.constraints.map((c) => c.name)).toContain('NO_QUALITY_DOWNGRADE_DUE_TO_MISSING_CONFIGURATION');
    expect(noQualityDowngradePolicy().status).toBe('ACTIVE');
    expect(detectConstraintRegression({ bgmCapabilityDeletedAfterProviderFailure: true }).ok).toBe(false);
    expect(detectConstraintRegression({}).ok).toBe(true);
  });

  it('does not lower product standards when capabilities are missing', () => {
    const ledger = missingCapabilityLedger();
    expect(ledger.items.every((i) => i.qualityStandard === 'UNCHANGED')).toBe(true);
    expect(ledger.items.find((i) => i.capability === 'DIGITAL_HUMAN')?.identityPolicy).toBe('USER_SELF_FIRST');
    expect(capabilityFailurePolicy().narrationOnlyContent01.notPermanentProductDefault).toBe(true);
    expect(capabilityFailurePolicy().secondaryAiMusicProvider.called).toBe(false);
  });

  it('uses real UI transform and never the rejected poster', () => {
    const sel = section4SourceSelection();
    expect(sel.rejectedAiImageUsed).toBe(false);
    expect(sel.rejectedAiImage).toBe(REJECTED_SECTION4_CANDIDATE);
    expect(sel.chosen).toBe('REAL_SCREEN_RECORDING');
    const pageBlend = blendPageTowardContent();
    expect(pageBlend.width).toBeGreaterThan(0.6);
    const filter = buildSection4VerticalFilter({
      sourceWidth: 1920,
      sourceHeight: 1080,
      sourceStartSec: 21.845,
      sourceEndSec: 27.594,
      targetDurationSec: 5.921,
    });
    expect(filter.sharpen).toBe(SELECTED_V2_SHARPEN);
    expect(filter.filter).toContain(SELECTED_V2_SHARPEN);
  });

  it('preserves script authority, narration policy, C5/C6', () => {
    const plan = buildContent01DirectorPlan();
    expect(plan.authority).toBe(SCRIPT_TIMELINE_AUTHORITY);
    expect(plan.truthConstraints).toEqual(['C5', 'C6']);
    expect(loadFrozenScriptBeats()[0].narration).toContain('会写文案的AI');
    expect(plan.routes.find((r) => r.beatId === 'beat:section4')?.generationNeeded).toBe(false);
  });
});
