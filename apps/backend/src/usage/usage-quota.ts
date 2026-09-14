import type { QuotaDecision } from './usage.types.js';

/** 13.11 foundation only — never blocks production. */
export function canExecuteUsageEstimate(_input?: unknown): QuotaDecision {
  return { allow: true };
}
