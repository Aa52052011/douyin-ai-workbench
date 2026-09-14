import { describe, expect, it } from 'vitest';
import { assessAssetUsage } from './asset-usage-assessor.js';
import { CONTENT_01_CLAIM_SET, evaluateAssetClaimSupport, evaluateClaimMatrix } from './claim-evidence-assessor.js';
import { RULE_PRIORITY } from './context.types.js';
import {
  chromeOnlyInput,
  content01CleanRecordingInput,
  content01OldContaminatedInput,
  content01OldHomeImageInput,
  content01ProductInfoImageInput,
  content01ProductionCenterImageInput,
  content01PublishOpsImageInput,
  localhostOnlyOnCurrentInput,
} from './fixtures/content01-context.fixture.js';
import { evaluateProjectContext } from './project-context-evaluator.js';

describe('B2-7 project context evaluation', () => {
  it('evaluates current clean recording as CURRENT and relevant, not DO_NOT_USE', () => {
    const input = content01CleanRecordingInput();
    const evaluation = evaluateProjectContext(input);
    const usage = assessAssetUsage(input, evaluation);
    expect(evaluation.freshness.status).toBe('CURRENT');
    expect(['HIGH', 'MEDIUM']).toContain(evaluation.relevance.status);
    expect(evaluation.evidenceValue.status).not.toBe('NONE');
    expect(usage.status).not.toBe('DO_NOT_USE');
    expect(['PREFERRED', 'USABLE', 'LIMITED']).toContain(usage.status);
    expect(usage.finalShotDecision).toBe(false);
  });

  it('does not treat browser chrome alone as stale or DO_NOT_USE', () => {
    const input = chromeOnlyInput();
    const evaluation = evaluateProjectContext(input);
    const usage = assessAssetUsage(input, evaluation);
    expect(evaluation.freshness.status).toBe('CURRENT');
    expect(evaluation.freshness.status).not.toBe('STALE');
    expect(usage.status).not.toBe('DO_NOT_USE');
  });

  it('does not treat localhost alone as fake or stale', () => {
    const input = localhostOnlyOnCurrentInput();
    const evaluation = evaluateProjectContext(input);
    const usage = assessAssetUsage(input, evaluation);
    expect(evaluation.freshness.status).toBe('CURRENT');
    expect(evaluation.freshness.reasons).not.toContain('STALE_HUMAN_CONFIRMED');
    expect(usage.status).not.toBe('DO_NOT_USE');
    expect(usage.reasons).toContain('LOCALHOST_PRESENT');
  });

  it('marks human-confirmed stale mock as STALE and DO_NOT_USE', () => {
    const input = content01OldContaminatedInput();
    const evaluation = evaluateProjectContext(input);
    const usage = assessAssetUsage(input, evaluation);
    expect(evaluation.freshness.status).toBe('STALE');
    expect(evaluation.misleadingRisk.level).toBe('CRITICAL');
    expect(usage.status).toBe('DO_NOT_USE');
    expect(usage.reasons).toEqual(expect.arrayContaining(['STALE_HUMAN_CONFIRMED', 'MOCK_CONTAMINATION_HUMAN_CONFIRMED']));
    expect(evaluation.conflicts.some((item) => item.type === 'HUMAN_VISION_CONFLICT')).toBe(true);
  });

  it('keeps current product UI relevance high or medium', () => {
    const evaluation = evaluateProjectContext(content01CleanRecordingInput());
    expect(['HIGH', 'MEDIUM']).toContain(evaluation.relevance.status);
  });

  it('limits empty production-center evidence', () => {
    const input = content01ProductionCenterImageInput();
    const evaluation = evaluateProjectContext(input);
    const usage = assessAssetUsage(input, evaluation);
    expect(evaluation.evidenceValue.status).toBe('LOW');
    expect(['USABLE', 'LIMITED']).toContain(usage.status);
    expect(usage.status).toBe('LIMITED');
  });

  it('does not support validated automatic publishing from publish page', () => {
    const input = content01PublishOpsImageInput();
    const evaluation = evaluateProjectContext(input);
    const claim = evaluateAssetClaimSupport('C5', input, evaluation);
    expect(claim.support).toBe('INSUFFICIENT');
    expect(claim.support).not.toBe('SUPPORTED');
  });

  it('does not let FORCE_PREFERRED bypass truth hard block', () => {
    const input = {
      ...content01OldContaminatedInput(),
      overrides: [
        ...content01OldContaminatedInput().overrides,
        { kind: 'FORCE_PREFERRED' as const },
      ],
    };
    const evaluation = evaluateProjectContext(input);
    const usage = assessAssetUsage(input, evaluation);
    expect(usage.status).toBe('DO_NOT_USE');
    expect(evaluation.triggeredRules).toContain('RULE_OVERRIDE_CANNOT_BYPASS_HARD_BLOCK');
  });

  it('does not let FORCE_PREFERRED bypass privacy hard block', () => {
    const base = content01CleanRecordingInput();
    const input = {
      ...base,
      overrides: [...base.overrides, { kind: 'CONFIRM_PRIVACY_BLOCKER' as const }, { kind: 'FORCE_PREFERRED' as const }],
    };
    const usage = assessAssetUsage(input, evaluateProjectContext(input));
    expect(usage.status).toBe('DO_NOT_USE');
    expect(usage.reasons).toContain('PRIVACY_BLOCKER');
  });

  it('varies claim support by claim id', () => {
    const input = content01CleanRecordingInput();
    const evaluation = evaluateProjectContext(input);
    const c1 = evaluateAssetClaimSupport('C1', input, evaluation);
    const c5 = evaluateAssetClaimSupport('C5', input, evaluation);
    expect(c1.support).toBe('SUPPORTED');
    expect(c5.support).toBe('INSUFFICIENT');
  });

  it('contradicts current-product claims for stale mock asset', () => {
    const input = content01OldContaminatedInput();
    const evaluation = evaluateProjectContext(input);
    expect(evaluateAssetClaimSupport('C1', input, evaluation).support).toBe('CONTRADICTED');
  });

  it('tends LIMITED for old empty home', () => {
    const input = content01OldHomeImageInput();
    const usage = assessAssetUsage(input, evaluateProjectContext(input));
    expect(usage.status).toBe('LIMITED');
  });

  it('is deterministic for the same evidence', () => {
    const input = content01CleanRecordingInput();
    const a = assessAssetUsage(input, evaluateProjectContext(input));
    const b = assessAssetUsage(input, evaluateProjectContext(input));
    expect(a).toEqual(b);
  });

  it('keeps reason codes and rule priority explicit', () => {
    expect(RULE_PRIORITY[0]).toBe('RIGHTS_PRIVACY_SAFETY');
    expect(RULE_PRIORITY[1]).toBe('TRUTH_HARD_BLOCK');
    const usage = assessAssetUsage(content01CleanRecordingInput(), evaluateProjectContext(content01CleanRecordingInput()));
    expect(usage.reasons.length).toBeGreaterThan(0);
    expect(usage.reasons.join(' ')).not.toMatch(/AI (thinks|says)/i);
  });

  it('exposes a full claim matrix without network', () => {
    const input = content01ProductInfoImageInput();
    const matrix = evaluateClaimMatrix(input, evaluateProjectContext(input));
    expect(matrix).toHaveLength(CONTENT_01_CLAIM_SET.length);
  });
});
