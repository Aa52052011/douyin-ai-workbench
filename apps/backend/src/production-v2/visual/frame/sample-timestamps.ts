import { effectiveSampleCount, FRAME_ANALYSIS_CONFIG } from './frame-analysis-config.js';

export function safeTailOffsetMs(durationMs: number, configured = FRAME_ANALYSIS_CONFIG.safeTailMs): number {
  if (durationMs <= 1) {
    return 0;
  }
  return Math.min(configured, Math.max(1, Math.floor(durationMs * 0.02)));
}

/**
 * Uniform analysis timestamps. Includes start and a safe end (not the last undecodeable tick).
 * Count includes start/end. Not frame-accurate editing seeks.
 */
export function buildUniformSampleTimestamps(durationMs: number, sampleCount?: number): number[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return [];
  }
  const count = sampleCount ?? effectiveSampleCount(durationMs);
  if (count <= 0) {
    return [];
  }
  const tail = safeTailOffsetMs(durationMs);
  const last = Math.max(0, durationMs - Math.max(1, tail));
  if (count === 1) {
    return [Math.min(last, Math.floor(durationMs / 2))];
  }
  const stamps: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = Math.round((last * index) / (count - 1));
    stamps.push(Math.min(last, Math.max(0, t)));
  }
  const unique: number[] = [];
  for (const stamp of stamps) {
    if (unique.length === 0 || unique[unique.length - 1] !== stamp) {
      unique.push(stamp);
    }
  }
  return unique;
}

export function sampleSourceAtIndex(index: number, total: number): 'START' | 'END' | 'UNIFORM' {
  if (index === 0) {
    return 'START';
  }
  if (index === total - 1) {
    return 'END';
  }
  return 'UNIFORM';
}
