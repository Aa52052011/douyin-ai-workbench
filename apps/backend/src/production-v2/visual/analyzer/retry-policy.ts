export const DETERMINISTIC_ANALYZER_TIMEOUTS = {
  metadataMs: 15_000,
  overallMs: 45_000,
} as const;

export const TRANSIENT_FAILURE = ['PROCESS_TIMEOUT', 'TEMP_IO_FAILURE'] as const;
export type TransientFailureCode = (typeof TRANSIENT_FAILURE)[number];

export const NON_TRANSIENT_FAILURE = [
  'INVALID_MEDIA',
  'NO_VIDEO_STREAM',
  'UNSUPPORTED_METADATA',
  'INVALID_MEDIA_DIMENSIONS',
  'UNSUPPORTED_MEDIA_METADATA',
] as const;

/** Analyzer-level retry: at most once. Video Worker must not stack extra retries on this path (not wired in B1-6). */
export const ANALYZER_MAX_TRANSIENT_RETRIES = 1;

export function isTransientCode(code: string | undefined): boolean {
  return code === 'PROCESS_TIMEOUT' || code === 'TEMP_IO_FAILURE' || code === 'MEDIA_PROBE_FAILED';
}

export async function withAnalyzerRetry<T>(fn: () => Promise<T>, isTransient: (err: unknown) => boolean): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransient(err)) {
      throw err;
    }
    return fn();
  }
}

export type StageRunStatus = 'STARTED' | 'COMPLETED' | 'SKIPPED' | 'FAILED';

export type AnalysisStageResult = {
  stage: string;
  status: StageRunStatus;
  durationMs: number;
  errorCode?: string;
  warnings: string[];
};

export function stageResult(
  stage: string,
  status: StageRunStatus,
  durationMs: number,
  extra?: { errorCode?: string; warnings?: string[] },
): AnalysisStageResult {
  return {
    stage,
    status,
    durationMs,
    errorCode: extra?.errorCode,
    warnings: extra?.warnings ?? [],
  };
}
