/**
 * Deterministic helpers for Account Memory (no network / no LLM).
 */
import { createHash } from 'node:crypto';
import {
  MEMORY_RECENT_LIMITS,
  PATTERN_CONFIRMED_MIN_SUPPORT,
  type MemoryCandidateSignal,
  type MemoryPattern,
  type PatternDirection,
  type PatternType,
} from './account-memory.types.js';

export function normalizeMemoryText(value: string | undefined | null): string {
  return (value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '');
}

export function patternKey(type: PatternType, raw: string): string {
  return `${type}:${normalizeMemoryText(raw)}`;
}

export function uniqueBounded(values: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizeMemoryText(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

export function confidenceFromSupport(supportCount: number): MemoryPattern['confidence'] {
  if (supportCount >= 5) return 'HIGH';
  if (supportCount >= PATTERN_CONFIRMED_MIN_SUPPORT) return 'MEDIUM';
  return 'LOW';
}

export type PatternAccumulator = {
  patternType: PatternType;
  key: string;
  summary: string;
  supportCount: number;
  lastObservedAt: string;
  direction: PatternDirection;
};

export function upsertPattern(
  map: Map<string, PatternAccumulator>,
  input: {
    patternType: PatternType;
    rawKey: string;
    summary: string;
    supportCount?: number;
    lastObservedAt: string;
    direction: PatternDirection;
  },
): void {
  const normalized = normalizeMemoryText(input.rawKey);
  if (!normalized) return;
  const key = patternKey(input.patternType, input.rawKey);
  const existing = map.get(key);
  const add = input.supportCount ?? 1;
  if (!existing) {
    map.set(key, {
      patternType: input.patternType,
      key,
      summary: input.summary,
      supportCount: add,
      lastObservedAt: input.lastObservedAt,
      direction: input.direction,
    });
    return;
  }
  existing.supportCount += add;
  if (input.lastObservedAt > existing.lastObservedAt) {
    existing.lastObservedAt = input.lastObservedAt;
    existing.summary = input.summary;
  }
}

export function splitPatterns(map: Map<string, PatternAccumulator>): {
  winningPatterns: MemoryPattern[];
  losingPatterns: MemoryPattern[];
  candidateSignals: MemoryCandidateSignal[];
  confirmedNeutral: MemoryPattern[];
} {
  const winningPatterns: MemoryPattern[] = [];
  const losingPatterns: MemoryPattern[] = [];
  const candidateSignals: MemoryCandidateSignal[] = [];
  const confirmedNeutral: MemoryPattern[] = [];

  for (const item of map.values()) {
    if (item.supportCount < PATTERN_CONFIRMED_MIN_SUPPORT) {
      candidateSignals.push({
        patternType: item.patternType,
        key: item.key,
        summary: item.summary,
        supportCount: 1,
        lastObservedAt: item.lastObservedAt,
        direction: item.direction,
      });
      continue;
    }
    const pattern: MemoryPattern = {
      patternType: item.patternType,
      key: item.key,
      summary: item.summary,
      supportCount: item.supportCount,
      confidence: confidenceFromSupport(item.supportCount),
      lastObservedAt: item.lastObservedAt,
      direction: item.direction,
    };
    if (item.direction === 'POSITIVE') winningPatterns.push(pattern);
    else if (item.direction === 'NEGATIVE') losingPatterns.push(pattern);
    else confirmedNeutral.push(pattern);
  }

  winningPatterns.sort((a, b) => b.supportCount - a.supportCount || b.lastObservedAt.localeCompare(a.lastObservedAt));
  losingPatterns.sort((a, b) => b.supportCount - a.supportCount || b.lastObservedAt.localeCompare(a.lastObservedAt));
  candidateSignals.sort((a, b) => b.lastObservedAt.localeCompare(a.lastObservedAt));
  confirmedNeutral.sort((a, b) => b.supportCount - a.supportCount || b.lastObservedAt.localeCompare(a.lastObservedAt));

  return {
    winningPatterns: winningPatterns.slice(0, MEMORY_RECENT_LIMITS.winningPatterns),
    losingPatterns: losingPatterns.slice(0, MEMORY_RECENT_LIMITS.losingPatterns),
    candidateSignals: candidateSignals.slice(0, MEMORY_RECENT_LIMITS.candidateSignals),
    confirmedNeutral: confirmedNeutral.slice(0, MEMORY_RECENT_LIMITS.candidateSignals),
  };
}

export type ContentOverlapInput = {
  recentTitles?: string[];
  recentHooks?: string[];
  recentAngles?: string[];
  publishedTopicIds?: string[];
  candidate?: {
    title?: string;
    hook?: string;
    angle?: string;
    topicId?: string;
  };
};

export type ContentOverlapResult = {
  sameTopicId: boolean;
  sameTitle: boolean;
  sameHook: boolean;
  sameAngle: boolean;
  warnings: string[];
};

export function detectRecentContentOverlap(input: ContentOverlapInput): ContentOverlapResult {
  const candidate = input.candidate ?? {};
  const sameTopicId = Boolean(
    candidate.topicId && (input.publishedTopicIds ?? []).includes(candidate.topicId),
  );
  const titleKey = normalizeMemoryText(candidate.title);
  const hookKey = normalizeMemoryText(candidate.hook);
  const angleKey = normalizeMemoryText(candidate.angle);
  const sameTitle = Boolean(titleKey && (input.recentTitles ?? []).some((t) => normalizeMemoryText(t) === titleKey));
  const sameHook = Boolean(hookKey && (input.recentHooks ?? []).some((h) => normalizeMemoryText(h) === hookKey));
  const sameAngle = Boolean(angleKey && (input.recentAngles ?? []).some((a) => normalizeMemoryText(a) === angleKey));

  const warnings: string[] = [];
  if (sameTopicId) warnings.push('近期已覆盖相同选题');
  if (sameTitle) warnings.push('标题与近期内容高度相似');
  if (sameHook) warnings.push('开场 Hook 与近期重复');
  if (sameAngle) warnings.push('内容角度与近期重复');

  return { sameTopicId, sameTitle, sameHook, sameAngle, warnings };
}

/** Stable watermark from ordered source timestamps/ids. */
export function computeSourceWatermark(parts: Array<string | number | null | undefined>): string {
  const normalized = parts.map((part) => (part == null || part === '' ? '-' : String(part))).join('|');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

export interface MemoryRetriever {
  relevantFor(input: {
    memory: {
      contentHistory: { recentTopics: string[]; recentHooks: string[]; recentAngles: string[]; recentCtas: string[]; recentContentPillars: string[] };
      patterns: { winningPatterns: MemoryPattern[]; losingPatterns: MemoryPattern[] };
    };
    current?: { topicTitle?: string; contentPillar?: string; contentAngle?: string; hook?: string };
  }): {
    matchingHooks: string[];
    matchingAngles: string[];
    matchingPillars: string[];
    relatedWinning: MemoryPattern[];
    relatedLosing: MemoryPattern[];
  };
}

/** V1: exact / field-based filtering only. */
export class DeterministicMemoryRetriever implements MemoryRetriever {
  relevantFor(input: Parameters<MemoryRetriever['relevantFor']>[0]) {
    const pillar = normalizeMemoryText(input.current?.contentPillar);
    const angle = normalizeMemoryText(input.current?.contentAngle);
    const hook = normalizeMemoryText(input.current?.hook);
    const topic = normalizeMemoryText(input.current?.topicTitle);
    const hist = input.memory.contentHistory;

    const matchingHooks = hist.recentHooks.filter((h) => {
      const n = normalizeMemoryText(h);
      return Boolean(hook && n === hook) || Boolean(topic && n.includes(topic));
    });
    const matchingAngles = hist.recentAngles.filter((a) => normalizeMemoryText(a) === angle);
    const matchingPillars = hist.recentContentPillars.filter((p) => normalizeMemoryText(p) === pillar);

    const relatedWinning = input.memory.patterns.winningPatterns.filter((p) => {
      const k = normalizeMemoryText(p.key);
      return (pillar && k.includes(pillar)) || (angle && k.includes(angle)) || (hook && k.includes(hook));
    });
    const relatedLosing = input.memory.patterns.losingPatterns.filter((p) => {
      const k = normalizeMemoryText(p.key);
      return (pillar && k.includes(pillar)) || (angle && k.includes(angle)) || (hook && k.includes(hook));
    });

    return { matchingHooks, matchingAngles, matchingPillars, relatedWinning, relatedLosing };
  }
}
