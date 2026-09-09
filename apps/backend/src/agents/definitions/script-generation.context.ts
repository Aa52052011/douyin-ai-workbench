/**
 * Step 12.12P — compact Script generation context (server-assembled only).
 * Never write these into Script rows; prompt reasoning only.
 */
import type { ContentPlanOutput, ContentTopic } from './content-planning.types.js';
import type { ScriptOutput } from './script-generation.types.js';

export type CompactPlanTopicContext = {
  dayIndex: number;
  title: string;
  contentPillar?: string;
  contentAngle?: string;
  format?: string;
  statusInPlan: string;
  role: 'CURRENT' | 'PREVIOUS' | 'UPCOMING';
};

export type CompactContentPlanContext = {
  planTitle: string;
  planSummary?: string;
  planningDays?: number;
  postsPerDay?: number;
  topics: CompactPlanTopicContext[];
};

export type CompactPreviousScriptSummary = {
  dayIndex: number;
  topicTitle: string;
  scriptTitle?: string;
  hook?: string;
  coreAngle?: string;
  cta?: string;
  shortSummary?: string;
};

export type CompactStrategyContext = {
  primaryObjective?: string;
  businessGoal?: string;
  audience?: string;
  accountRole?: string;
  marketPosition?: string;
  contentDirections?: string[];
};

export function buildCompactContentPlanContext(input: {
  planTitle?: string | null;
  payload: ContentPlanOutput | undefined;
  currentTopicId: string;
}): CompactContentPlanContext {
  const payload = input.payload;
  const topics = Array.isArray(payload?.topics) ? payload!.topics : [];
  const ordered = [...topics].sort((a, b) => {
    const da = typeof a.dayIndex === 'number' ? a.dayIndex : Number.MAX_SAFE_INTEGER;
    const db = typeof b.dayIndex === 'number' ? b.dayIndex : Number.MAX_SAFE_INTEGER;
    return da - db;
  });
  const currentIndex = ordered.findIndex((item) => item.id === input.currentTopicId);

  return {
    planTitle: (input.planTitle ?? payload?.title ?? '').trim() || '本期内容规划',
    planSummary: payload?.summary?.trim() || undefined,
    planningDays: payload?.planningDays,
    postsPerDay: payload?.postsPerDay,
    topics: ordered.map((topic, index) => {
      let role: CompactPlanTopicContext['role'] = 'UPCOMING';
      if (index === currentIndex) role = 'CURRENT';
      else if (currentIndex >= 0 && index < currentIndex) role = 'PREVIOUS';
      return {
        dayIndex: typeof topic.dayIndex === 'number' ? topic.dayIndex : index + 1,
        title: topic.title?.trim() || `选题 ${index + 1}`,
        contentPillar: topic.contentPillar?.trim() || undefined,
        contentAngle: topic.contentAngle?.trim() || undefined,
        format: topic.format?.trim() || undefined,
        statusInPlan: topic.status === 'planned' ? 'planned' : String(topic.status ?? 'planned'),
        role,
      };
    }),
  };
}

export function buildCompactPreviousScriptSummaries(input: {
  topics: ContentTopic[];
  currentTopicId: string;
  scripts: Array<{
    topicId: string | null;
    status: string;
    title?: string | null;
    payload?: unknown;
    topicSnapshot?: unknown;
  }>;
}): CompactPreviousScriptSummary[] {
  const ordered = [...input.topics].sort((a, b) => {
    const da = typeof a.dayIndex === 'number' ? a.dayIndex : Number.MAX_SAFE_INTEGER;
    const db = typeof b.dayIndex === 'number' ? b.dayIndex : Number.MAX_SAFE_INTEGER;
    return da - db;
  });
  const currentIndex = ordered.findIndex((item) => item.id === input.currentTopicId);
  if (currentIndex <= 0) {
    return [];
  }

  const summaries: CompactPreviousScriptSummary[] = [];
  for (let i = 0; i < currentIndex; i += 1) {
    const topic = ordered[i];
    const confirmed = input.scripts
      .filter(
        (item) =>
          item.topicId === topic.id && (item.status === 'CONFIRMED' || item.status === 'ARCHIVED'),
      )
      .at(-1);
    if (!confirmed) {
      continue;
    }
    const payload = asScriptPayload(confirmed.payload);
    const snapshot = asTopicLike(confirmed.topicSnapshot) ?? topic;
    const hook = payload?.hook?.trim() || snapshot.hook?.trim();
    const coreAngle = snapshot.contentAngle?.trim() || snapshot.painPoint?.trim();
    const cta = payload?.cta?.trim() || snapshot.cta?.trim();
    const shortSummary = compactNarration(payload);
    summaries.push({
      dayIndex: typeof topic.dayIndex === 'number' ? topic.dayIndex : i + 1,
      topicTitle: topic.title?.trim() || `选题 ${i + 1}`,
      scriptTitle: confirmed.title?.trim() || payload?.title?.trim() || undefined,
      hook: hook || undefined,
      coreAngle: coreAngle || undefined,
      cta: cta || undefined,
      shortSummary: shortSummary || undefined,
    });
  }
  return summaries;
}

export function buildCompactStrategyContext(payload: unknown): CompactStrategyContext | undefined {
  if (!isRecord(payload) || payload.version !== 'v1') {
    return undefined;
  }
  const objective = isRecord(payload.objective) ? payload.objective : null;
  const audience = isRecord(payload.targetAudience) ? payload.targetAudience : null;
  const positioning = isRecord(payload.positioning) ? payload.positioning : null;
  const mix = Array.isArray(payload.contentMix) ? payload.contentMix : [];
  const directions = mix
    .map((item) => {
      if (!isRecord(item)) return null;
      const type = asText(item.type);
      const purpose = asText(item.purpose);
      if (!type || !purpose) return null;
      return `${type}：${purpose}`;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 6);

  const primaryObjective = asText(objective?.primaryObjective);
  const businessGoal = asText(objective?.businessGoal);
  const audiencePrimary = asText(audience?.primary);
  const accountRole = asText(positioning?.accountRole);
  const marketPosition = asText(positioning?.marketPosition);
  if (!primaryObjective && !businessGoal && !audiencePrimary) {
    return undefined;
  }
  return {
    primaryObjective: primaryObjective || undefined,
    businessGoal: businessGoal || undefined,
    audience: audiencePrimary || undefined,
    accountRole: accountRole || undefined,
    marketPosition: marketPosition || undefined,
    contentDirections: directions.length ? directions : undefined,
  };
}

function compactNarration(payload: ScriptOutput | null): string | undefined {
  if (!payload) return undefined;
  const text = [payload.opening, ...(payload.sections ?? []).slice(0, 2).map((s) => s.narration)]
    .map((item) => (item ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
  if (!text) return undefined;
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

function asScriptPayload(value: unknown): ScriptOutput | null {
  if (!isRecord(value) || typeof value.hook !== 'string') {
    return null;
  }
  return value as ScriptOutput;
}

function asTopicLike(value: unknown): Partial<ContentTopic> | null {
  return isRecord(value) ? (value as Partial<ContentTopic>) : null;
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
