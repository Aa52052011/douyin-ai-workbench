import { DETERMINISTIC_ANALYZER_VERSION, DETERMINISTIC_VISUAL_SCHEMA, type DeterministicVisualFacts } from '../deterministic-visual.types.js';
import type { VisualCacheRecord } from './cache.types.js';

const DROP_KEY = /^(filePath|fileName|filename|tempRef|token|secret|password|email|authorization|absolutePath)$/i;

export function sanitizeFactsForCache(facts: DeterministicVisualFacts): DeterministicVisualFacts {
  const cloned = JSON.parse(
    JSON.stringify(facts, (key, value) => {
      if (typeof key === 'string' && DROP_KEY.test(key)) {
        return undefined;
      }
      if (typeof value === 'string' && /^[A-Za-z]:[\\/]/.test(value)) {
        return undefined;
      }
      return value;
    }),
  ) as DeterministicVisualFacts;
  delete (cloned as { tempRef?: unknown }).tempRef;
  return cloned;
}

export function validateCacheRecord(record: unknown, expectedKey: string): { ok: true; record: VisualCacheRecord } | { ok: false; reason: string } {
  if (!record || typeof record !== 'object') {
    return { ok: false, reason: 'malformed' };
  }
  const row = record as VisualCacheRecord;
  if (row.schemaVersion !== DETERMINISTIC_VISUAL_SCHEMA) {
    return { ok: false, reason: 'schemaVersion' };
  }
  if (row.analysisVersion !== DETERMINISTIC_ANALYZER_VERSION) {
    return { ok: false, reason: 'analysisVersion' };
  }
  if (row.cacheKey !== expectedKey) {
    return { ok: false, reason: 'cacheKey' };
  }
  if (!row.contentHash || !row.facts || !row.status || !Array.isArray(row.completedStages)) {
    return { ok: false, reason: 'required' };
  }
  if (!row.facts.metadata?.width || !row.facts.metadata?.height) {
    return { ok: false, reason: 'metadata' };
  }
  if (row.facts.contentHash && row.facts.contentHash !== row.contentHash) {
    return { ok: false, reason: 'contentHash' };
  }
  return { ok: true, record: row };
}
