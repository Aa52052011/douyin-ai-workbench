import { describe, expect, it } from 'vitest';
import { collectNumericIssues, rectIsValid } from './facts-integrity.js';

describe('facts integrity', () => {
  it('flags NaN and out-of-range confidence', () => {
    const issues = collectNumericIssues({ scores: { overallScore: 3 }, cropRisk: { lostAreaRatio: 0.2 }, confidence: 1.2, bad: Number.NaN });
    expect(issues.some((item) => item.kind === 'non_finite')).toBe(true);
    expect(issues.some((item) => item.kind === 'confidence_range')).toBe(true);
    expect(rectIsValid({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
    expect(rectIsValid({ x: 0.9, y: 0, width: 0.2, height: 1 })).toBe(false);
  });
});
