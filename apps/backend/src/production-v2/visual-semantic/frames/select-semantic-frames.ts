import type { DeterministicVisualFacts } from '../../visual/deterministic-visual.types.js';
import type { FrameSelectionReason } from '../contracts/provider-runtime.types.js';
import { buildUniformSampleTimestamps, safeTailOffsetMs } from '../../visual/frame/sample-timestamps.js';
import { SEMANTIC_FRAME_CONFIG, semanticFrameBudget, stableSemanticFrameId } from './semantic-frame-config.js';
import { SEMANTIC_FRAME_WARNING, type SemanticFrameWarningCode } from './semantic-frame-errors.js';
import type { SemanticFrameSelection, SemanticFrameSelectionPlan, SemanticSelectionPriority } from './semantic-frame.types.js';

type RawCandidate = {
  timestampMs: number;
  reasons: FrameSelectionReason[];
  sourceSignals: string[];
  confidence: number;
  extraScore: number;
};

function lastSafe(durationMs: number): number {
  return Math.max(0, durationMs - Math.max(1, safeTailOffsetMs(durationMs)));
}

function snapAuto(timestampMs: number, durationMs: number | undefined): number | undefined {
  if (!Number.isFinite(timestampMs) || timestampMs < 0) {
    return undefined;
  }
  if (durationMs === undefined) {
    return Math.round(timestampMs);
  }
  const last = lastSafe(durationMs);
  if (timestampMs > last) {
    return last;
  }
  return Math.round(timestampMs);
}

function reasonWeight(reasons: FrameSelectionReason[]): number {
  return Math.max(...reasons.map((r) => SEMANTIC_FRAME_CONFIG.reasonWeight[r] ?? 30));
}

function priorityOf(score: number, reasons: FrameSelectionReason[]): SemanticSelectionPriority {
  if (reasons.includes('MANUAL') || reasons.includes('IMAGE_PRIMARY')) {
    return 'CRITICAL';
  }
  if (score >= 70) {
    return 'HIGH';
  }
  if (score >= 45) {
    return 'NORMAL';
  }
  return 'LOW';
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((v) => Math.round(v)))].sort((a, b) => a - b);
}

function coverageBonus(timestampMs: number, durationMs: number | undefined, bucketCount: number): number {
  if (!durationMs || durationMs <= 0 || bucketCount <= 0) {
    return 0;
  }
  const bucket = Math.min(bucketCount - 1, Math.floor((timestampMs / durationMs) * bucketCount));
  return (bucket / Math.max(1, bucketCount - 1)) * 4;
}

function mergeClose(candidates: RawCandidate[], gapMs: number): RawCandidate[] {
  const sorted = [...candidates].sort((a, b) => a.timestampMs - b.timestampMs || reasonWeight(b.reasons) - reasonWeight(a.reasons));
  const out: RawCandidate[] = [];
  for (const item of sorted) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(item.timestampMs - prev.timestampMs) < gapMs) {
      const keepItem = reasonWeight(item.reasons) + item.extraScore > reasonWeight(prev.reasons) + prev.extraScore;
      const winner = keepItem ? item : prev;
      const loser = keepItem ? prev : item;
      winner.reasons = [...new Set([...winner.reasons, ...loser.reasons])];
      winner.sourceSignals = [...new Set([...winner.sourceSignals, ...loser.sourceSignals])];
      winner.confidence = Math.max(winner.confidence, loser.confidence);
      winner.extraScore = Math.max(winner.extraScore, loser.extraScore);
      out[out.length - 1] = winner;
    } else {
      out.push({ ...item, reasons: [...item.reasons], sourceSignals: [...item.sourceSignals] });
    }
  }
  return out;
}

function applyBudget(candidates: RawCandidate[], max: number, durationMs: number | undefined, warnings: SemanticFrameWarningCode[]): RawCandidate[] {
  if (candidates.length <= max) {
    return candidates;
  }
  const scored = candidates.map((c) => ({
    c,
    score: reasonWeight(c.reasons) + c.extraScore + coverageBonus(c.timestampMs, durationMs, max),
  }));
  scored.sort((a, b) => b.score - a.score || a.c.timestampMs - b.c.timestampMs);
  const kept = scored.slice(0, max).map((s) => s.c);
  warnings.push(SEMANTIC_FRAME_WARNING.SEMANTIC_FRAME_BUDGET_TRIMMED);
  return kept.sort((a, b) => a.timestampMs - b.timestampMs);
}

function b1NearDupClusters(facts: DeterministicVisualFacts | undefined): Array<Set<number>> {
  const samples = facts?.frameSamplesSummary ?? [];
  const clusters: Array<Set<number>> = [];
  for (const sample of samples) {
    if (!sample.isNearDuplicate || !sample.duplicateOfSampleId) {
      continue;
    }
    const other = samples.find((s) => s.sampleId === sample.duplicateOfSampleId);
    if (!other) {
      continue;
    }
    const pair = new Set([Math.round(sample.timestampMs), Math.round(other.timestampMs)]);
    const existing = clusters.find((set) => [...pair].some((t) => set.has(t)));
    if (existing) {
      pair.forEach((t) => existing.add(t));
    } else {
      clusters.push(pair);
    }
  }
  return clusters;
}

function uncoveredMid(durationMs: number, kept: number[], buckets: number): number | undefined {
  if (!durationMs || buckets <= 0) {
    return undefined;
  }
  const size = durationMs / buckets;
  for (let i = 0; i < buckets; i += 1) {
    const start = i * size;
    const end = (i + 1) * size;
    if (!kept.some((t) => t >= start && t < end)) {
      return snapAuto(start + size / 2, durationMs);
    }
  }
  return undefined;
}

export function selectSemanticFrames(input: {
  assetId: string;
  mediaKind: 'IMAGE' | 'VIDEO';
  facts?: DeterministicVisualFacts;
  durationMs?: number;
  manualTimestampsMs?: number[];
}): { plan: SemanticFrameSelectionPlan; error?: 'SEMANTIC_FRAME_SELECTION_FAILED'; invalidManual?: boolean } {
  const warnings: SemanticFrameWarningCode[] = [];
  const durationMs = input.durationMs ?? input.facts?.metadata.durationMs;
  const maxFrameCount = semanticFrameBudget(durationMs);

  if (input.mediaKind === 'IMAGE') {
    const selected: SemanticFrameSelection[] = [
      {
        frameId: stableSemanticFrameId(0),
        timestampMs: 0,
        reasons: ['IMAGE_PRIMARY'],
        priority: 'CRITICAL',
        sourceSignals: ['IMAGE'],
        confidence: 1,
        selectionScore: SEMANTIC_FRAME_CONFIG.reasonWeight.IMAGE_PRIMARY,
      },
    ];
    return {
      plan: {
        planId: `plan:${input.assetId}:image`,
        assetId: input.assetId,
        mediaKind: 'IMAGE',
        strategy: 'HYBRID_SEMANTIC_V1',
        requestedFrameCount: 1,
        maxFrameCount: 1,
        selectedFrames: selected,
        sourceDurationMs: durationMs,
        selectionVersion: 'semantic.frame-selection:v1',
        warnings,
      },
    };
  }

  const sampleTimes = (input.facts?.frameSamplesSummary ?? [])
    .filter((s) => s.extractionOk)
    .map((s) => s.timestampMs);
  const hasMotion = Boolean(input.facts?.motionSummary || (input.facts?.sceneChangeCandidates?.length ?? 0) > 0);

  if ((durationMs === undefined || durationMs <= 0) && sampleTimes.length === 0) {
    return {
      error: 'SEMANTIC_FRAME_SELECTION_FAILED',
      plan: {
        planId: `plan:${input.assetId}:failed`,
        assetId: input.assetId,
        mediaKind: 'VIDEO',
        strategy: 'HYBRID_SEMANTIC_V1',
        requestedFrameCount: 0,
        maxFrameCount,
        selectedFrames: [],
        selectionVersion: 'semantic.frame-selection:v1',
        warnings,
      },
    };
  }

  const raw: RawCandidate[] = [];
  const push = (timestampMs: number | undefined, reasons: FrameSelectionReason[], signals: string[], confidence: number, extra = 0) => {
    if (timestampMs === undefined) {
      return;
    }
    raw.push({ timestampMs, reasons, sourceSignals: signals, confidence, extraScore: extra });
  };

  if (durationMs && durationMs > 0) {
    const coverageCount = Math.min(3, maxFrameCount);
    const stamps = buildUniformSampleTimestamps(durationMs, coverageCount);
    stamps.forEach((t, i) => {
      const reason: FrameSelectionReason =
        i === 0 ? 'START_REPRESENTATIVE' : i === stamps.length - 1 ? 'END_REPRESENTATIVE' : 'UNIFORM_REPRESENTATIVE';
      push(t, [reason], ['BASE_COVERAGE'], 0.8);
    });
    if (!hasMotion) {
      warnings.push(SEMANTIC_FRAME_WARNING.SEMANTIC_FRAME_SPARSE_B1_FALLBACK);
      const extra = buildUniformSampleTimestamps(durationMs, maxFrameCount);
      extra.forEach((t) => push(t, ['UNIFORM_REPRESENTATIVE'], ['UNIFORM_FALLBACK'], 0.7));
    }
  } else {
    warnings.push(SEMANTIC_FRAME_WARNING.SEMANTIC_FRAME_USED_SAMPLE_TIMESTAMPS);
    uniqueSorted(sampleTimes).forEach((t) => push(t, ['UNIFORM_REPRESENTATIVE'], ['B1_SAMPLE_TIMESTAMP'], 0.6));
  }

  for (const scene of input.facts?.sceneChangeCandidates ?? []) {
    const extra = scene.strength * 20;
    const strong = scene.strength >= SEMANTIC_FRAME_CONFIG.strongSceneStrength && scene.confidence >= SEMANTIC_FRAME_CONFIG.strongSceneConfidence;
    if (strong && durationMs) {
      push(snapAuto(scene.timestampMs - SEMANTIC_FRAME_CONFIG.sceneEdgeOffsetMs, durationMs), ['SCENE_CANDIDATE'], ['SCENE_BEFORE'], scene.confidence, extra);
      push(snapAuto(scene.timestampMs + SEMANTIC_FRAME_CONFIG.sceneEdgeOffsetMs, durationMs), ['SCENE_CANDIDATE'], ['SCENE_AFTER'], scene.confidence, extra);
    } else {
      push(snapAuto(scene.timestampMs + SEMANTIC_FRAME_CONFIG.sceneEdgeOffsetMs, durationMs), ['SCENE_CANDIDATE'], ['SCENE_OFFSET'], scene.confidence, extra);
    }
  }

  const segments = input.facts?.temporalActivitySegments ?? [];
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i].activityLevel !== segments[i - 1].activityLevel) {
      push(
        snapAuto(segments[i].startMs, durationMs),
        ['ACTIVITY_CHANGE'],
        [`${segments[i - 1].activityLevel}->${segments[i].activityLevel}`],
        Math.min(segments[i].confidence, segments[i - 1].confidence),
        8,
      );
    }
  }

  for (const range of input.facts?.longStaticCandidates ?? []) {
    const mid = snapAuto(range.startMs + range.estimatedDurationMs / 2, durationMs);
    push(mid, ['LONG_STATIC_REPRESENTATIVE'], ['LONG_STATIC_MID'], range.confidence, 6);
  }

  for (const rapid of input.facts?.rapidChangeCandidates ?? []) {
    const mid = snapAuto(rangeMid(rapid.startMs, rapid.endMs), durationMs);
    push(mid, ['HIGH_CHANGE_REPRESENTATIVE'], ['RAPID_CHANGE'], rapid.confidence, 5);
  }

  let invalidManual = false;
  for (const manual of input.manualTimestampsMs ?? []) {
    if (!Number.isFinite(manual) || manual < 0 || (durationMs !== undefined && manual >= durationMs)) {
      invalidManual = true;
      continue;
    }
    push(Math.round(manual), ['MANUAL'], ['MANUAL'], 1, 20);
  }

  let merged = mergeClose(raw, SEMANTIC_FRAME_CONFIG.minSemanticFrameGapMs);

  const dupClusters = b1NearDupClusters(input.facts);
  if (dupClusters.length) {
    merged = merged.filter((candidate, _, all) => {
      const cluster = dupClusters.find((set) => {
        return [...set].some((t) => Math.abs(t - candidate.timestampMs) < SEMANTIC_FRAME_CONFIG.minSemanticFrameGapMs);
      });
      if (!cluster) {
        return true;
      }
      const peers = all.filter((c) => [...cluster].some((t) => Math.abs(t - c.timestampMs) < SEMANTIC_FRAME_CONFIG.minSemanticFrameGapMs));
      const best = [...peers].sort((a, b) => reasonWeight(b.reasons) - reasonWeight(a.reasons))[0];
      return best === candidate;
    });
    const keptTimes = merged.map((c) => c.timestampMs);
    const replacement = uncoveredMid(durationMs ?? 0, keptTimes, maxFrameCount);
    if (replacement !== undefined && !keptTimes.some((t) => Math.abs(t - replacement) < SEMANTIC_FRAME_CONFIG.minSemanticFrameGapMs)) {
      merged.push({
        timestampMs: replacement,
        reasons: ['DEDUP_REPLACEMENT'],
        sourceSignals: ['B1_NEAR_DUPLICATE'],
        confidence: 0.55,
        extraScore: 0,
      });
      warnings.push(SEMANTIC_FRAME_WARNING.SEMANTIC_FRAME_DEDUPED);
    }
  }

  merged = applyBudget(merged, maxFrameCount, durationMs, warnings);
  merged.sort((a, b) => a.timestampMs - b.timestampMs);

  const selectedFrames: SemanticFrameSelection[] = merged.map((c) => {
    const selectionScore = reasonWeight(c.reasons) + c.extraScore + coverageBonus(c.timestampMs, durationMs, maxFrameCount);
    return {
      frameId: stableSemanticFrameId(c.timestampMs),
      timestampMs: c.timestampMs,
      reasons: c.reasons,
      priority: priorityOf(selectionScore, c.reasons),
      sourceSignals: c.sourceSignals,
      confidence: Math.min(1, c.confidence),
      selectionScore,
    };
  });

  return {
    plan: {
      planId: `plan:${input.assetId}:${selectedFrames.map((f) => f.frameId).join(',')}`,
      assetId: input.assetId,
      mediaKind: 'VIDEO',
      strategy: 'HYBRID_SEMANTIC_V1',
      requestedFrameCount: selectedFrames.length,
      maxFrameCount,
      selectedFrames,
      sourceDurationMs: durationMs,
      selectionVersion: 'semantic.frame-selection:v1',
      warnings,
    },
    invalidManual,
  };
}

function rangeMid(start: number, end: number): number {
  return start + (end - start) / 2;
}
