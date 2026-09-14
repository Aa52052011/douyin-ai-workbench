import { describe, expect, it } from 'vitest';
import { loadFrozenScriptBeats } from '../editorial-shot-director/narration-units.js';
import { SELECTED_V2_SHARPEN } from '../audio-calibration/audio-integration.js';
import { buildContent01DirectorPlan, scriptDrivenDurationMs } from './director-v1.js';
import { productionConstraintRegistry } from './production-constraints.js';
import {
  assertDurationInRange,
  buildTimelineSlots,
  longFreezeUsed,
  rejectedAiImageUsed,
  temporaryFallbackRegistry,
} from './full-timeline-calibration.js';

describe('B2-15O2G full timeline calibration contracts', () => {
  const plan = buildContent01DirectorPlan();
  const slots = buildTimelineSlots(plan.beats, plan.plannedDurationMs);

  it('covers 8 frozen beats totaling planned duration without rejected poster', () => {
    expect(slots).toHaveLength(8);
    expect(slots.map((s) => s.beatId)).toEqual(plan.beats.map((b) => b.beatId));
    expect(slots.reduce((s, x) => s + x.durationMs, 0)).toBe(plan.plannedDurationMs);
    expect(plan.plannedDurationMs).toBe(scriptDrivenDurationMs());
    expect(rejectedAiImageUsed()).toBe(false);
    expect(slots.find((s) => s.beatId === 'beat:section4')?.sourceStartMs).toBe(21845);
    expect(longFreezeUsed(slots)).toBe(false);
    expect(() => assertDurationInRange(45677)).not.toThrow();
    expect(() => assertDurationInRange(48000)).toThrow(/OUT_OF_RANGE/);
  });

  it('keeps V2 on recording slots and temporary fallbacks without deleting capabilities', () => {
    expect(slots.filter((s) => s.usesV2).every((s) => s.sourceKind === 'RECORDING')).toBe(true);
    expect(slots.find((s) => s.beatId === 'beat:opening')?.sourceKind).toBe('SCREENSHOT_MOTION');
    const fb = temporaryFallbackRegistry();
    expect(fb.items.every((i) => i.temporary)).toBe(true);
    expect(productionConstraintRegistry().constraints).toHaveLength(24);
    expect(loadFrozenScriptBeats()[0].narration).toContain('会写文案的AI');
    expect(SELECTED_V2_SHARPEN).toContain('unsharp=5:5:0.35');
  });
});
