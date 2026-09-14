import type { FrameSelectionReason } from '../contracts/provider-runtime.types.js';
import type { SemanticFrameSelection } from './semantic-frame.types.js';

export const REPRESENTATIVE_SELECTION_VERSION = 'semantic.representative-selection:v1';
export const REPRESENTATIVE_MAX_FRAMES = 3;
export const REPRESENTATIVE_SLOTS = ['FRAME_A', 'FRAME_B', 'FRAME_C'] as const;
export type RepresentativeSlot = (typeof REPRESENTATIVE_SLOTS)[number];

export type RepresentativeFrameInput = {
  frameId: string;
  timestampMs: number;
  reasons: readonly string[];
  sourceSignals?: readonly string[];
  selectionScore?: number;
  priority?: string;
};

export type RepresentativeSelectedFrame = RepresentativeFrameInput & {
  representativeSlot: RepresentativeSlot;
  selectionReasons: string[];
  tertile: 0 | 1 | 2;
  score: number;
};

export type RepresentativeExcludedFrame = RepresentativeFrameInput & {
  excludedReasons: string[];
};

export type RepresentativeSelectionResult = {
  version: typeof REPRESENTATIVE_SELECTION_VERSION;
  maxFrames: number;
  selected: RepresentativeSelectedFrame[];
  excluded: RepresentativeExcludedFrame[];
};

function durationOf(frames: readonly RepresentativeFrameInput[], durationMs?: number): number {
  if (durationMs !== undefined && Number.isFinite(durationMs) && durationMs > 0) {
    return durationMs;
  }
  const maxTs = Math.max(0, ...frames.map((item) => item.timestampMs));
  return Math.max(1, maxTs);
}

function tertileOf(timestampMs: number, durationMs: number): 0 | 1 | 2 {
  const ratio = Math.min(0.999, Math.max(0, timestampMs / durationMs));
  if (ratio < 1 / 3) return 0;
  if (ratio < 2 / 3) return 1;
  return 2;
}

function hasReason(frame: RepresentativeFrameInput, reason: string): boolean {
  return frame.reasons.includes(reason);
}

function scoreFrame(frame: RepresentativeFrameInput, tertile: 0 | 1 | 2): { score: number; reasons: string[] } {
  const reasons: string[] = ['TEMPORAL_COVERAGE'];
  let score = 50;
  score += (frame.selectionScore ?? 0) * 0.2;
  reasons.push('UI_RICHNESS_FROM_SELECTION_SCORE');

  if (hasReason(frame, 'DEDUP_REPLACEMENT') || (frame.sourceSignals ?? []).includes('B1_NEAR_DUPLICATE')) {
    score -= 50;
    reasons.push('DEDUP_PENALTY');
  }
  if (hasReason(frame, 'ACTIVITY_CHANGE') || hasReason(frame, 'SCENE_CANDIDATE') || hasReason(frame, 'HIGH_CHANGE_REPRESENTATIVE')) {
    score += 18;
    reasons.push('SCENE_STATE_DIVERSITY');
  }
  if (hasReason(frame, 'LONG_STATIC_REPRESENTATIVE')) {
    score += 6;
    reasons.push('STATIC_STATE_DIVERSITY');
  }
  if (hasReason(frame, 'UNIFORM_REPRESENTATIVE') || hasReason(frame, 'UNIFORM')) {
    score -= 8;
    reasons.push('UNIFORM_PENALTY');
  }
  if (tertile === 0 && hasReason(frame, 'START_REPRESENTATIVE')) {
    score += 12;
    reasons.push('EARLY_REPRESENTATIVE');
  }
  if (tertile === 2 && hasReason(frame, 'END_REPRESENTATIVE')) {
    score += 12;
    reasons.push('LATE_REPRESENTATIVE');
  }
  if (frame.priority === 'HIGH' || frame.priority === 'CRITICAL') {
    score += 8;
    reasons.push('PRIORITY_HINT');
  }
  if (hasReason(frame, 'START_REPRESENTATIVE')) {
    score += 4;
    reasons.push('BROWSER_VISIBLE_SECONDARY');
  }
  return { score, reasons };
}

function tieBreak(a: RepresentativeFrameInput, b: RepresentativeFrameInput): number {
  if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
  return a.frameId.localeCompare(b.frameId);
}

export function selectRepresentativeSemanticFramesV1(input: {
  frames: readonly RepresentativeFrameInput[];
  durationMs?: number;
  maxFrames?: number;
}): RepresentativeSelectionResult {
  const maxFrames = Math.min(REPRESENTATIVE_MAX_FRAMES, input.maxFrames ?? REPRESENTATIVE_MAX_FRAMES);
  const durationMs = durationOf(input.frames, input.durationMs);
  const sorted = [...input.frames].sort(tieBreak);
  const byTertile: RepresentativeFrameInput[][] = [[], [], []];
  for (const frame of sorted) {
    byTertile[tertileOf(frame.timestampMs, durationMs)].push(frame);
  }

  const selected: RepresentativeSelectedFrame[] = [];
  const used = new Set<string>();

  for (let tertile = 0; tertile < 3 && selected.length < maxFrames; tertile += 1) {
    const bucket = byTertile[tertile];
    if (!bucket.length) continue;
    const ranked = [...bucket].sort((a, b) => {
      const sa = scoreFrame(a, tertile as 0 | 1 | 2).score;
      const sb = scoreFrame(b, tertile as 0 | 1 | 2).score;
      if (sa !== sb) return sb - sa;
      return tieBreak(a, b);
    });
    const winner = ranked[0]!;
    const scored = scoreFrame(winner, tertile as 0 | 1 | 2);
    selected.push({
      ...winner,
      representativeSlot: REPRESENTATIVE_SLOTS[selected.length]!,
      selectionReasons: scored.reasons,
      tertile: tertile as 0 | 1 | 2,
      score: scored.score,
    });
    used.add(winner.frameId);
  }

  if (selected.length < maxFrames) {
    const remaining = sorted.filter((item) => !used.has(item.frameId));
    remaining.sort((a, b) => {
      const dist = (frame: RepresentativeFrameInput) =>
        Math.min(...selected.map((item) => Math.abs(item.timestampMs - frame.timestampMs)), Number.POSITIVE_INFINITY);
      const da = dist(a);
      const db = dist(b);
      if (da !== db) return db - da;
      return scoreFrame(b, tertileOf(b.timestampMs, durationMs)).score - scoreFrame(a, tertileOf(a.timestampMs, durationMs)).score;
    });
    for (const frame of remaining) {
      if (selected.length >= maxFrames) break;
      const tertile = tertileOf(frame.timestampMs, durationMs);
      const scored = scoreFrame(frame, tertile);
      selected.push({
        ...frame,
        representativeSlot: REPRESENTATIVE_SLOTS[selected.length]!,
        selectionReasons: [...scored.reasons, 'TEMPORAL_GAP_FILL'],
        tertile,
        score: scored.score,
      });
      used.add(frame.frameId);
    }
  }

  selected.sort((a, b) => a.timestampMs - b.timestampMs);
  selected.forEach((item, index) => {
    item.representativeSlot = REPRESENTATIVE_SLOTS[index] ?? item.representativeSlot;
  });

  const excluded: RepresentativeExcludedFrame[] = sorted
    .filter((item) => !used.has(item.frameId))
    .map((item) => {
      const reasons = ['NOT_SELECTED_FOR_REPRESENTATIVE_SUBSET'];
      if (hasReason(item, 'DEDUP_REPLACEMENT')) reasons.push('NEAR_DUPLICATE_OR_DEDUP');
      if (hasReason(item, 'UNIFORM_REPRESENTATIVE') || hasReason(item, 'UNIFORM')) reasons.push('LOWER_STATE_DIVERSITY');
      const tertile = tertileOf(item.timestampMs, durationMs);
      if (selected.some((picked) => picked.tertile === tertile)) reasons.push('SAME_TERTILE_ALTERNATIVE_CHOSEN');
      return { ...item, excludedReasons: reasons };
    });

  return {
    version: REPRESENTATIVE_SELECTION_VERSION,
    maxFrames,
    selected: selected.slice(0, maxFrames),
    excluded,
  };
}

export function toRepresentativeInputs(frames: readonly SemanticFrameSelection[]): RepresentativeFrameInput[] {
  return frames
    .filter((item) => item.timestampMs !== undefined)
    .map((item) => ({
      frameId: item.frameId,
      timestampMs: item.timestampMs as number,
      reasons: item.reasons as FrameSelectionReason[],
      sourceSignals: item.sourceSignals,
      selectionScore: item.selectionScore,
      priority: item.priority,
    }));
}
