import { EDITORIAL_FRAME_CONTINUITY_VERSION } from '../source-aware-editorial/constants.js';

export const FRAME_CONTINUITY_CONFIG = {
  schemaVersion: EDITORIAL_FRAME_CONTINUITY_VERSION,
  unexpectedBlankMs: 150,
  whiteUiMinVariance: 0.008,
  whiteUiMinEdgeEnergy: 0.04,
  emptyMaxVariance: 0.0015,
  emptyMaxEdgeEnergy: 0.012,
} as const;

export type FrameSignalV1 = {
  tMs: number;
  lumaMean: number;
  lumaVariance: number;
  edgeEnergy: number;
};

export function isLikelyBlankFrame(frame: FrameSignalV1): boolean {
  const empty = frame.lumaVariance <= FRAME_CONTINUITY_CONFIG.emptyMaxVariance && frame.edgeEnergy <= FRAME_CONTINUITY_CONFIG.emptyMaxEdgeEnergy;
  if (!empty) return false;
  return frame.lumaMean >= 0.88 || frame.lumaMean <= 0.08;
}

export function isWhiteUiNotBlank(frame: FrameSignalV1): boolean {
  return frame.lumaMean >= 0.82 && (frame.lumaVariance >= FRAME_CONTINUITY_CONFIG.whiteUiMinVariance || frame.edgeEnergy >= FRAME_CONTINUITY_CONFIG.whiteUiMinEdgeEnergy);
}

export function unexpectedBlankSequenceMs(frames: readonly FrameSignalV1[]): { blank: boolean; startMs: number | null; endMs: number | null; durationMs: number } {
  let runStart: number | null = null;
  let last: number | null = null;
  let best = { startMs: null as number | null, endMs: null as number | null, durationMs: 0 };
  const flush = () => {
    if (runStart === null || last === null) return;
    const durationMs = last - runStart;
    if (durationMs > best.durationMs) best = { startMs: runStart, endMs: last, durationMs };
    runStart = null;
    last = null;
  };
  for (const frame of frames) {
    if (isWhiteUiNotBlank(frame)) {
      flush();
      continue;
    }
    if (isLikelyBlankFrame(frame)) {
      if (runStart === null) runStart = frame.tMs;
      last = frame.tMs;
    } else {
      flush();
    }
  }
  flush();
  return {
    blank: best.durationMs >= FRAME_CONTINUITY_CONFIG.unexpectedBlankMs,
    startMs: best.startMs,
    endMs: best.endMs,
    durationMs: best.durationMs,
  };
}

export function ptsContinuity(shots: Array<{ sourceStartMs: number; sourceEndMs: number }>): { ok: boolean; gaps: Array<{ atMs: number }> } {
  const gaps: Array<{ atMs: number }> = [];
  for (let i = 1; i < shots.length; i += 1) {
    if (Math.abs(shots[i].sourceStartMs - shots[i - 1].sourceEndMs) > 2) {
      gaps.push({ atMs: shots[i].sourceStartMs });
    }
  }
  return { ok: gaps.length === 0, gaps };
}

export function filterHasDurationGuards(filter: string): boolean {
  return filter.includes('eof_action=repeat') && filter.includes('fps=30') && filter.includes('setpts=PTS-STARTPTS');
}

export function filterHasConcatGapRisk(filter: string): boolean {
  const overlay = filter.includes('overlay=');
  const guarded = filter.includes('eof_action=repeat');
  return overlay && !guarded;
}

export function auditEditorialFrameContinuityV1(input: {
  segments: Array<{ sourceStartMs: number; sourceEndMs: number }>;
  frames: readonly FrameSignalV1[];
}): {
  schemaVersion: typeof EDITORIAL_FRAME_CONTINUITY_VERSION;
  ok: boolean;
  ptsOk: boolean;
  coverageOk: boolean;
  unexpectedBlank: ReturnType<typeof unexpectedBlankSequenceMs>;
  whiteUiGuard: 'PASS' | 'FAIL';
} {
  const pts = ptsContinuity(input.segments);
  let cursor = input.segments[0]?.sourceStartMs ?? 0;
  let coverageOk = input.segments.length > 0;
  for (const item of input.segments) {
    if (Math.abs(item.sourceStartMs - cursor) > 2) coverageOk = false;
    cursor = item.sourceEndMs;
  }
  const unexpectedBlank = unexpectedBlankSequenceMs(input.frames);
  const whiteUiPresent = input.frames.some((frame) => isWhiteUiNotBlank(frame));
  const whiteUiMisclassified = input.frames.some((frame) => isWhiteUiNotBlank(frame) && isLikelyBlankFrame(frame));
  return {
    schemaVersion: EDITORIAL_FRAME_CONTINUITY_VERSION,
    ok: pts.ok && coverageOk && !unexpectedBlank.blank && !whiteUiMisclassified,
    ptsOk: pts.ok,
    coverageOk,
    unexpectedBlank,
    whiteUiGuard: whiteUiMisclassified ? 'FAIL' : whiteUiPresent || !unexpectedBlank.blank ? 'PASS' : 'PASS',
  };
}
