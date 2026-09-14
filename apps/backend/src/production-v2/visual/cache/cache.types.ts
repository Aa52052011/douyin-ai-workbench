import type { DeterministicVisualFacts } from '../deterministic-visual.types.js';

export type CacheGetStatus = 'HIT' | 'MISS' | 'INVALID';
export type CacheLookupStatus = CacheGetStatus | 'BYPASSED' | 'READ_FAILED';
export type CacheWriteStatus = 'WRITTEN' | 'SKIPPED' | 'FAILED';

export type VisualCacheRecord = {
  schemaVersion: string;
  analysisVersion: string;
  cacheKey: string;
  contentHash: string;
  createdAt: string;
  durationMs?: number;
  completedStages: string[];
  status: string;
  deterministicStatus?: string;
  facts: DeterministicVisualFacts;
};

export type CacheGetResult =
  | { status: 'HIT'; record: VisualCacheRecord }
  | { status: 'MISS' }
  | { status: 'INVALID'; reason: string };

export interface VisualAnalysisCacheStore {
  get(cacheKey: string): Promise<CacheGetResult>;
  set(cacheKey: string, record: VisualCacheRecord): Promise<void>;
  delete?(cacheKey: string): Promise<void>;
}
