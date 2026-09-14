import type { DeterministicAnalysisStatus, DeterministicVisualFacts } from '../deterministic-visual.types.js';
import type { CacheLookupStatus, CacheWriteStatus } from '../cache/cache.types.js';
import type { AnalysisStageResult } from './retry-policy.js';

export type DeterministicVisualAnalysisResult = {
  facts?: DeterministicVisualFacts;
  deterministicStatus: DeterministicAnalysisStatus;
  cacheStatus: CacheLookupStatus;
  cacheWriteStatus: CacheWriteStatus;
  stageResults: AnalysisStageResult[];
  timing: {
    totalMs: number;
    cacheLookupMs: number;
    probeMs: number;
    samplingMs: number;
    heuristicsMs: number;
    cropMs: number;
  };
  warnings: string[];
  errorCode?: string;
};

export type AnalyzeMediaKind = 'IMAGE' | 'VIDEO';

export type DeterministicAnalyzeInput = {
  assetId: string;
  contentHash?: string;
  mediaPath?: string;
  kind: AnalyzeMediaKind;
  assetMetadata?: {
    width: number;
    height: number;
    durationMs?: number;
    mimeType?: string;
    fileSize?: number;
  };
  forceReanalyze?: boolean;
  overallTimeoutMs?: number;
};
