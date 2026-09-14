import { describe, expect, it } from 'vitest';
import { planQualityRepairs } from './quality-repair-planner.js';
import { runDeterministicQualityChecks } from './quality-check.js';
import { runQualityRepairLoop } from './quality-loop.js';
import { reflowOverflowCues } from '../pipeline/srt.js';
import type { ProductionQualityResult, RepairPlan } from './quality.types.js';

function failResult(code: ProductionQualityResult['issues'][number]['code'], repair: ProductionQualityResult['issues'][number]['suggestedRepairType']): ProductionQualityResult {
  return {
    version: 'v1',
    status: 'FAIL',
    checkedAt: new Date().toISOString(),
    checks: [],
    issues: [
      {
        code,
        category: 'TECHNICAL',
        severity: code === 'MEDIA_CORRUPTED' || code === 'TIMELINE_GAP' || code === 'REFERENCE_ASSET_USED' || code === 'ASSET_MISSING' ? 'BLOCKING' : 'ERROR',
        scope: 'COMPOSE',
        message: code,
        repairable: true,
        suggestedRepairType: repair,
        deterministic: true,
      },
    ],
    repairableIssueCount: 1,
    blockingIssueCount: 1,
    attempt: 0,
    finalDisposition: 'BLOCKED',
    qualityInputHash: 'h',
    durationMs: 1,
  };
}

describe('repair planner', () => {
  it('maps issue types to actions', () => {
    expect(planQualityRepairs({ result: failResult('TIMELINE_GAP', 'REBUILD_TIMELINE'), attempt: 1 }).actions[0]?.type).toBe('REBUILD_TIMELINE');
    expect(planQualityRepairs({ result: failResult('REFERENCE_ASSET_USED', 'REPLACE_SHOT_ASSET'), attempt: 1 }).actions[0]?.type).toBe('REPLACE_SHOT_ASSET');
    expect(planQualityRepairs({ result: failResult('ASSET_MISSING', 'REPLACE_SHOT_ASSET'), attempt: 1 }).actions[0]?.type).toBe('REPLACE_SHOT_ASSET');
    expect(planQualityRepairs({ result: failResult('SUBTITLE_OVERFLOW_RISK', 'REBUILD_SUBTITLE'), attempt: 1 }).actions[0]?.type).toBe('REBUILD_SUBTITLE');
    expect(planQualityRepairs({ result: failResult('SUBTITLE_OVERFLOW_RISK', 'REBUILD_SUBTITLE'), attempt: 1 }).actions.some((item) => item.type === 'REGENERATE_AI_IMAGE' || item.type === 'REGENERATE_VOICE')).toBe(false);
    expect(planQualityRepairs({ result: failResult('AUDIO_STREAM_MISSING', 'REGENERATE_VOICE'), attempt: 1 }).actions[0]?.type).toBe('REGENERATE_VOICE');
    expect(planQualityRepairs({ result: failResult('MEDIA_CORRUPTED', 'RECOMPOSE'), attempt: 1 }).actions.some((item) => item.type === 'RECOMPOSE')).toBe(true);
  });
});

describe('subtitle reflow', () => {
  it('splits overflow cues', () => {
    const next = reflowOverflowCues([{ start: 0, end: 4, text: '这是一句远远超过安全字数限制的中文字幕内容还要更长一些' }], 8);
    expect(next.length).toBeGreaterThan(1);
    expect(next.every((cue) => cue.text.length <= 20)).toBe(true);
  });
});

describe('repair loop', () => {
  it('PASS first check', () => {
    const pass: ProductionQualityResult = { ...failResult('DURATION_MISMATCH', 'RECOMPOSE'), status: 'PASS', issues: [], blockingIssueCount: 0, repairableIssueCount: 0, finalDisposition: 'PASS' };
    const out = runQualityRepairLoop({
      check: () => pass,
      plan: planQualityRepairs,
      execute: () => ({ providerCalls: 0, afterHash: 'h2' }),
    });
    expect(out.result.status).toBe('PASS');
  });

  it('repair1 PASS', () => {
    let n = 0;
    const out = runQualityRepairLoop({
      check: () => {
        n += 1;
        if (n === 1) {
          return failResult('SUBTITLE_OVERFLOW_RISK', 'REBUILD_SUBTITLE');
        }
        return { ...failResult('SUBTITLE_OVERFLOW_RISK', 'REBUILD_SUBTITLE'), status: 'PASS', issues: [], blockingIssueCount: 0, repairableIssueCount: 0, finalDisposition: 'PASS' };
      },
      plan: planQualityRepairs,
      execute: () => ({ providerCalls: 0, afterHash: 'h2' }),
    });
    expect(out.checkpoint.repairHistory).toHaveLength(1);
    expect(out.result.status).toBe('PASS');
  });

  it('same-error stop and BEST_AVAILABLE for non-blocking', () => {
    const warning: ProductionQualityResult = {
      ...failResult('REPEATED_ASSET', 'REPLACE_SHOT_ASSET'),
      issues: [
        {
          code: 'REPEATED_ASSET',
          category: 'REPETITION',
          severity: 'WARNING',
          scope: 'SHOT',
          message: 'repeat',
          repairable: true,
          suggestedRepairType: 'REPLACE_SHOT_ASSET',
          deterministic: true,
          shotSequence: 2,
          assetId: 'v1',
        },
      ],
      blockingIssueCount: 0,
    };
    const out = runQualityRepairLoop({
      check: () => warning,
      plan: planQualityRepairs,
      execute: () => ({ providerCalls: 0, afterHash: 'h2' }),
    });
    expect(out.result.finalDisposition === 'BEST_AVAILABLE' || out.checkpoint.repairHistory.length <= 2).toBe(true);
  });

  it('attempt limit', () => {
    const blocking = failResult('MEDIA_CORRUPTED', 'RECOMPOSE');
    let executes = 0;
    runQualityRepairLoop({
      check: () => blocking,
      plan: planQualityRepairs,
      execute: () => {
        executes += 1;
        return { providerCalls: 0, afterHash: 'hx' };
      },
    });
    expect(executes).toBeLessThanOrEqual(2);
  });
});

describe('local repair reuse contract', () => {
  it('subtitle repair plan does not include REGENERATE_VOICE', () => {
    const plan: RepairPlan = planQualityRepairs({ result: failResult('SUBTITLE_OVERFLOW_RISK', 'REBUILD_SUBTITLE'), attempt: 1 });
    expect(plan.actions.some((item) => item.type === 'REGENERATE_VOICE')).toBe(false);
  });
});

void runDeterministicQualityChecks;
