import { describe, expect, it } from 'vitest';
import { toQualityPublicView } from './quality-public.js';
import { canFinalizeDisposition } from './quality-check.js';

describe('quality public view', () => {
  it('hides raw codes', () => {
    const view = toQualityPublicView(
      {
        rulesetVersion: 'v1',
        qualityInputHash: 'h',
        qualityDisposition: 'PASS',
        qualityChecks: [
          {
            version: 'v1',
            status: 'PASS',
            checkedAt: '2026-09-09T00:00:00.000Z',
            checks: [],
            issues: [],
            repairableIssueCount: 0,
            blockingIssueCount: 0,
            attempt: 0,
            finalDisposition: 'PASS',
            qualityInputHash: 'h',
            durationMs: 12,
          },
        ],
        repairHistory: [],
        latestQualityResult: {
          version: 'v1',
          status: 'PASS',
          checkedAt: '2026-09-09T00:00:00.000Z',
          checks: [],
          issues: [],
          repairableIssueCount: 0,
          blockingIssueCount: 0,
          attempt: 0,
          finalDisposition: 'PASS',
          qualityInputHash: 'h',
          durationMs: 12,
        },
      },
      true,
    );
    expect(view.statusLabel).toBe('质量检查已通过');
    expect(JSON.stringify(view).includes('SUBTITLE_OVERFLOW_RISK')).toBe(false);
  });

  it('legacy completed video', () => {
    const view = toQualityPublicView(undefined, true);
    expect(view.legacy).toBe(true);
    expect(view.statusLabel).toBe('旧版成片');
  });

  it('finalization gate', () => {
    expect(canFinalizeDisposition('BLOCKED', true)).toBe(false);
    expect(canFinalizeDisposition(undefined, false)).toBe(true);
  });
});
