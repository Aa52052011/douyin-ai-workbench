import { AgentError } from '../agent.errors.js';
import { ErrorCode } from '../../common/errors/app-error.js';
import { filterUnknownStrings, isUnknownUserReply } from './intake-unknown.js';
import {
  MARKET_INTAKE_AI_FORBIDDEN_FIELDS,
  MARKET_INTAKE_ALLOWED_FIELDS,
  MARKET_INTAKE_LIMITS,
  MARKET_INTAKE_MISSING_AREA_ORDER,
  MARKET_INTAKE_OBJECT_ARRAY_FIELDS,
  MARKET_INTAKE_STRING_ARRAY_FIELDS,
  type MarketCompetitorAccountDraft,
  type MarketIntakeAgentOutput,
  type MarketIntakeDraft,
  type MarketIntakeFieldKey,
  type MarketIntakeSuggestion,
  type MarketLinkDraft,
} from './market-intake.types.js';

const ALLOWED = new Set<string>(MARKET_INTAKE_ALLOWED_FIELDS);
const STRING_ARRAYS = new Set<string>(MARKET_INTAKE_STRING_ARRAY_FIELDS);
const OBJECT_ARRAYS = new Set<string>(MARKET_INTAKE_OBJECT_ARRAY_FIELDS);
const FORBIDDEN_AI = new Set<string>(MARKET_INTAKE_AI_FORBIDDEN_FIELDS);

const FORBIDDEN_METRIC_KEYS = new Set([
  'playCount',
  'likeCount',
  'commentCount',
  'shareCount',
  'followers',
  'followerCount',
  'rank',
  'growthRate',
  'marketSize',
  'views',
  'likes',
  'comments',
  'shares',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectPrototypeKeys(raw: Record<string, unknown>): void {
  for (const key of Object.getOwnPropertyNames(raw)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
  }
}

function normalizeStringList(items: string[], maxItems: number, maxItemLength: number): string[] {
  const next: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > maxItemLength) continue;
    if (!next.includes(trimmed)) next.push(trimmed);
    if (next.length >= maxItems) break;
  }
  return next;
}

function coerceStringList(value: unknown): string[] | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      out.push(item);
      continue;
    }
    if (isRecord(item)) {
      const candidate = item.value ?? item.text ?? item.label ?? item.keyword;
      if (typeof candidate === 'string') out.push(candidate);
    }
  }
  return out;
}

function looksLikeUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function canonicalizeUrl(value: string): string {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    let href = parsed.href;
    if (href.endsWith('/') && parsed.pathname === '/') {
      href = href.slice(0, -1);
    }
    return href;
  } catch {
    return trimmed;
  }
}

function rejectMetricKeys(raw: Record<string, unknown>): void {
  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_METRIC_KEYS.has(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
  }
}

function sanitizeCompetitors(value: unknown): MarketCompetitorAccountDraft[] {
  if (!Array.isArray(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const out: MarketCompetitorAccountDraft[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const displayName = item.trim();
      if (!displayName || isUnknownUserReply(displayName) || displayName.length > MARKET_INTAKE_LIMITS.competitorName) {
        continue;
      }
      if (!out.some((row) => row.displayName === displayName)) {
        out.push({ displayName });
      }
      continue;
    }
    if (!isRecord(item)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    rejectMetricKeys(item);
    rejectPrototypeKeys(item);
    const displayName =
      typeof item.displayName === 'string'
        ? item.displayName.trim()
        : typeof item.name === 'string'
          ? item.name.trim()
          : '';
    if (
      !displayName ||
      isUnknownUserReply(displayName) ||
      displayName.length > MARKET_INTAKE_LIMITS.competitorName
    ) {
      continue;
    }
    const note = typeof item.note === 'string' ? item.note.trim() : undefined;
    if (note && note.length > MARKET_INTAKE_LIMITS.note) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const profileUrlRaw =
      typeof item.profileUrl === 'string'
        ? item.profileUrl.trim()
        : typeof item.externalUrl === 'string'
          ? item.externalUrl.trim()
          : undefined;
    if (profileUrlRaw) {
      if (profileUrlRaw.length > MARKET_INTAKE_LIMITS.url || !looksLikeUrl(profileUrlRaw)) {
        throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
      }
    }
    const row: MarketCompetitorAccountDraft = { displayName };
    if (note) row.note = note;
    if (profileUrlRaw) row.profileUrl = canonicalizeUrl(profileUrlRaw);
    if (!out.some((existing) => existing.displayName === row.displayName)) {
      out.push(row);
    }
    if (out.length >= MARKET_INTAKE_LIMITS.competitors) break;
  }
  return out;
}

function sanitizeLinks(value: unknown): MarketLinkDraft[] {
  if (!Array.isArray(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const out: MarketLinkDraft[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const url = item.trim();
      if (!url || url.length > MARKET_INTAKE_LIMITS.url || !looksLikeUrl(url)) continue;
      const canonical = canonicalizeUrl(url);
      if (!out.some((row) => row.url === canonical)) out.push({ url: canonical });
      continue;
    }
    if (!isRecord(item)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    rejectMetricKeys(item);
    rejectPrototypeKeys(item);
    const urlRaw =
      typeof item.url === 'string'
        ? item.url.trim()
        : typeof item.externalUrl === 'string'
          ? item.externalUrl.trim()
          : '';
    if (!urlRaw || urlRaw.length > MARKET_INTAKE_LIMITS.url || !looksLikeUrl(urlRaw)) {
      continue;
    }
    const label = typeof item.label === 'string' ? item.label.trim().slice(0, 80) : undefined;
    const row: MarketLinkDraft = { url: canonicalizeUrl(urlRaw) };
    if (label) row.label = label;
    if (!out.some((existing) => existing.url === row.url)) out.push(row);
    if (out.length >= MARKET_INTAKE_LIMITS.links) break;
  }
  return out;
}

const STRING_ITEM_LIMIT: Record<string, number> = {
  keywords: MARKET_INTAKE_LIMITS.keyword,
  userObservations: MARKET_INTAKE_LIMITS.observation,
  customerQuestions: MARKET_INTAKE_LIMITS.question,
  commonPainPoints: MARKET_INTAKE_LIMITS.painPoint,
  commonSellingPoints: MARKET_INTAKE_LIMITS.sellingPoint,
  marketHypotheses: MARKET_INTAKE_LIMITS.hypothesis,
};

const STRING_MAX: Record<string, number> = {
  keywords: MARKET_INTAKE_LIMITS.keywords,
  userObservations: MARKET_INTAKE_LIMITS.observations,
  customerQuestions: MARKET_INTAKE_LIMITS.questions,
  commonPainPoints: MARKET_INTAKE_LIMITS.painPoints,
  commonSellingPoints: MARKET_INTAKE_LIMITS.sellingPoints,
  marketHypotheses: MARKET_INTAKE_LIMITS.hypotheses,
};

/** Server-side allowlist sanitizer for LLM draftPatch. Never Object.assign raw. */
export function sanitizeMarketIntakeDraftPatch(raw: unknown): MarketIntakeDraft {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (!isRecord(raw)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  rejectPrototypeKeys(raw);
  rejectMetricKeys(raw);

  const patch: MarketIntakeDraft = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    if (FORBIDDEN_AI.has(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    if (!ALLOWED.has(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    if (value === undefined || value === null) continue;

    if (STRING_ARRAYS.has(key)) {
      const coerced = coerceStringList(value);
      if (coerced === null) {
        throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
      }
      const list = normalizeStringList(
        filterUnknownStrings(coerced),
        STRING_MAX[key] ?? 40,
        STRING_ITEM_LIMIT[key] ?? 200,
      );
      if (list.length) {
        (patch as Record<string, string[]>)[key] = list;
      }
      continue;
    }

    if (OBJECT_ARRAYS.has(key)) {
      if (key === 'competitorAccounts') {
        const list = sanitizeCompetitors(value);
        if (list.length) patch.competitorAccounts = list;
      } else if (key === 'competitorVideos') {
        const list = sanitizeLinks(value);
        if (list.length) patch.competitorVideos = list;
      } else if (key === 'publicLinks') {
        const list = sanitizeLinks(value);
        if (list.length) patch.publicLinks = list;
      }
    }
  }
  return patch;
}

/**
 * Merge semantics (aligned with product intake array replace):
 * - when a field is present in patch, replace that field (supports correction)
 * - when absent, keep current
 */
export function mergeMarketIntakeDraft(
  current: MarketIntakeDraft,
  patch: MarketIntakeDraft,
): MarketIntakeDraft {
  const next: MarketIntakeDraft = { ...current };
  for (const key of MARKET_INTAKE_STRING_ARRAY_FIELDS) {
    const value = patch[key];
    if (Array.isArray(value)) {
      next[key] = [...value];
    }
  }
  for (const key of MARKET_INTAKE_OBJECT_ARRAY_FIELDS) {
    const value = patch[key];
    if (Array.isArray(value)) {
      (next as Record<string, unknown>)[key] = [...value];
    }
  }
  return next;
}

function countMaterials(draft: MarketIntakeDraft): number {
  let count = 0;
  count += draft.keywords?.length ?? 0;
  count += draft.competitorAccounts?.length ?? 0;
  count += draft.competitorVideos?.length ?? 0;
  count += draft.publicLinks?.length ?? 0;
  count += draft.userObservations?.length ?? 0;
  count += draft.customerQuestions?.length ?? 0;
  count += draft.commonPainPoints?.length ?? 0;
  count += draft.commonSellingPoints?.length ?? 0;
  count += draft.marketHypotheses?.length ?? 0;
  return count;
}

export function getMarketIntakeReadinessFromDraft(
  draft: MarketIntakeDraft,
  options?: { userAcknowledgedLimitedData?: boolean },
): {
  missingAreas: string[];
  itemCount: number;
  readyForConfirmation: boolean;
} {
  const itemCount = countMaterials(draft);
  const missingAreas: string[] = [];
  for (const area of MARKET_INTAKE_MISSING_AREA_ORDER) {
    const value = draft[area as keyof MarketIntakeDraft];
    if (!Array.isArray(value) || value.length === 0) {
      missingAreas.push(area);
    }
  }
  const acknowledged = Boolean(options?.userAcknowledgedLimitedData);
  return {
    missingAreas,
    itemCount,
    readyForConfirmation: itemCount > 0 || acknowledged,
  };
}

export function sanitizeMarketIntakeSuggestions(raw: unknown): MarketIntakeSuggestion[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const out: MarketIntakeSuggestion[] = [];
  for (const item of raw.slice(0, MARKET_INTAKE_LIMITS.suggestions)) {
    if (!isRecord(item)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    rejectPrototypeKeys(item);
    rejectMetricKeys(item);
    const field = item.field;
    if (typeof field !== 'string' || !ALLOWED.has(field) || FORBIDDEN_AI.has(field)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const id =
      typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 80) : `sug-${out.length + 1}`;
    const label = typeof item.label === 'string' ? item.label.trim().slice(0, 120) : undefined;
    const rationale =
      typeof item.rationale === 'string' ? item.rationale.trim().slice(0, 200) : undefined;

    let value: MarketIntakeSuggestion['value'];
    if (STRING_ARRAYS.has(field)) {
      const coerced = coerceStringList(item.value);
      if (coerced === null) {
        throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
      }
      const list = normalizeStringList(coerced, STRING_MAX[field] ?? 40, STRING_ITEM_LIMIT[field] ?? 200);
      if (!list.length) continue;
      value = list.length === 1 ? list[0] : list;
    } else if (field === 'competitorAccounts') {
      const list = sanitizeCompetitors(Array.isArray(item.value) ? item.value : [item.value]);
      if (!list.length) continue;
      value = list.length === 1 ? list[0] : list.map((row) => row.displayName);
    } else {
      const list = sanitizeLinks(Array.isArray(item.value) ? item.value : [item.value]);
      if (!list.length) continue;
      value = list.length === 1 ? list[0].url : list.map((row) => row.url);
    }

    out.push({
      id,
      field: field as MarketIntakeFieldKey,
      value,
      ...(label ? { label } : {}),
      ...(rationale ? { rationale } : {}),
    });
  }
  return out;
}

export function applyDeterministicMarketReadiness(
  output: Omit<MarketIntakeAgentOutput, 'missingAreas' | 'readyForConfirmation'> & {
    draftAfterMerge: MarketIntakeDraft;
    userAcknowledgedLimitedData?: boolean;
  },
): MarketIntakeAgentOutput {
  const readiness = getMarketIntakeReadinessFromDraft(output.draftAfterMerge, {
    userAcknowledgedLimitedData: output.userAcknowledgedLimitedData,
  });
  return {
    message: output.message,
    draftPatch: output.draftPatch,
    suggestions: output.suggestions,
    missingAreas: readiness.missingAreas,
    readyForConfirmation: readiness.readyForConfirmation,
  };
}
