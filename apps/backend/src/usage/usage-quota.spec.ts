import { describe, expect, it } from 'vitest';
import { canExecuteUsageEstimate } from './usage-quota.js';

describe('usage quota foundation', () => {
  it('always allows execution (no enforcement in 13.11)', () => {
    expect(canExecuteUsageEstimate()).toEqual({ allow: true });
    expect(canExecuteUsageEstimate({ estimatedCost: '999' }).allow).toBe(true);
  });
});
