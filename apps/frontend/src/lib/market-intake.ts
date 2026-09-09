import { normalizeListItems } from "./product-brief.form";
import type { ProductBriefPayload } from "./product-brief.types";
import type {
  MarketCompetitorAccountDraft,
  MarketIntakeDraft,
  MarketIntakeDraftPatch,
  MarketIntakeMessage,
  MarketIntakeProvenance,
  MarketIntakeProvenanceMap,
  MarketIntakeReadiness,
  MarketIntakeSession,
  MarketIntakeState,
  MarketIntakeSuggestion,
  MarketLinkDraft,
} from "./market-intake.types";

export const MARKET_INTAKE_OPENING_MESSAGE =
  "我已经了解你的产品信息。接下来我们一起整理市场调研素材。\n\n你可以告诉我：\n- 想研究的关键词\n- 关注过的竞品\n- 看过的公开视频\n- 对市场的观察\n\n如果暂时什么都没有，也可以直接告诉我。";

export const MARKET_INTAKE_PLACEHOLDER_REPLY =
  "AI 市场调研引导将在下一阶段接入。你也可以先在右侧补充你已经知道的信息。";

export const MARKET_INTAKE_NO_DATA_HINT =
  "目前市场信息较少。第一轮市场分析会更多依赖你的产品信息。后续补充关键词、竞品或真实数据，可以提升判断准确度。";

const STATUS_LABELS: Record<MarketIntakeState, string> = {
  EMPTY: "未开始",
  IN_PROGRESS: "整理中",
  READY_TO_CONFIRM: "待确认",
  CONFIRMED: "已确认",
};

const LIMITS = {
  keyword: 80,
  keywords: 40,
  competitorName: 80,
  competitors: 40,
  note: 200,
  url: 500,
  links: 40,
  observation: 500,
  observations: 40,
  question: 500,
  questions: 40,
  painPoint: 200,
  painPoints: 40,
  sellingPoint: 200,
  sellingPoints: 40,
  hypothesis: 500,
  hypotheses: 20,
};

export function marketIntakeSessionKey(projectId: string): string {
  return `acf:intake:${projectId}:market`;
}

export function marketIntakeStatusLabel(state: MarketIntakeState): string {
  return STATUS_LABELS[state];
}

export function emptyMarketIntakeDraft(): MarketIntakeDraft {
  return {
    keywords: [],
    competitorAccounts: [],
    competitorVideos: [],
    publicLinks: [],
    userObservations: [],
    customerQuestions: [],
    commonPainPoints: [],
    commonSellingPoints: [],
    marketHypotheses: [],
    uploadedSources: [],
    userAcknowledgedLimitedData: false,
  };
}

export function createMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createOpeningMessages(now = new Date().toISOString()): MarketIntakeMessage[] {
  return [
    {
      id: createMessageId(),
      role: "assistant",
      content: MARKET_INTAKE_OPENING_MESSAGE,
      createdAt: now,
      localKind: "LOCAL_GUIDED_PROMPT",
    },
  ];
}

export function createLocalPlaceholderReply(now = new Date().toISOString()): MarketIntakeMessage {
  return {
    id: createMessageId(),
    role: "assistant",
    content: MARKET_INTAKE_PLACEHOLDER_REPLY,
    createdAt: now,
    localKind: "LOCAL_PLACEHOLDER_REPLY",
  };
}

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStrings(value: string[] | undefined, maxItems: number, maxLen: number): string[] {
  return normalizeListItems(value ?? [], maxItems, maxLen);
}

function normalizeCompetitors(list: MarketCompetitorAccountDraft[] | undefined): MarketCompetitorAccountDraft[] {
  const out: MarketCompetitorAccountDraft[] = [];
  for (const item of list ?? []) {
    const displayName = item.displayName?.trim();
    if (!displayName || displayName.length > LIMITS.competitorName) continue;
    const note = trimText(item.note);
    const profileUrl = trimText(item.profileUrl);
    if (note && note.length > LIMITS.note) continue;
    if (profileUrl && profileUrl.length > LIMITS.url) continue;
    if (out.some((x) => x.displayName === displayName)) continue;
    out.push({
      displayName,
      ...(note ? { note } : {}),
      ...(profileUrl ? { profileUrl } : {}),
    });
    if (out.length >= LIMITS.competitors) break;
  }
  return out;
}

function normalizeLinks(list: MarketLinkDraft[] | undefined): MarketLinkDraft[] {
  const out: MarketLinkDraft[] = [];
  for (const item of list ?? []) {
    const url = item.url?.trim();
    if (!url || url.length > LIMITS.url) continue;
    const label = trimText(item.label);
    if (out.some((x) => x.url === url)) continue;
    out.push({ url, ...(label ? { label } : {}) });
    if (out.length >= LIMITS.links) break;
  }
  return out;
}

export function sanitizeMarketIntakeDraft(raw: Partial<MarketIntakeDraft> | null | undefined): MarketIntakeDraft {
  const base = emptyMarketIntakeDraft();
  if (!raw || typeof raw !== "object") {
    return base;
  }
  return {
    keywords: normalizeStrings(raw.keywords, LIMITS.keywords, LIMITS.keyword),
    competitorAccounts: normalizeCompetitors(raw.competitorAccounts),
    competitorVideos: normalizeLinks(raw.competitorVideos),
    publicLinks: normalizeLinks(raw.publicLinks),
    userObservations: normalizeStrings(raw.userObservations, LIMITS.observations, LIMITS.observation),
    customerQuestions: normalizeStrings(raw.customerQuestions, LIMITS.questions, LIMITS.question),
    commonPainPoints: normalizeStrings(raw.commonPainPoints, LIMITS.painPoints, LIMITS.painPoint),
    commonSellingPoints: normalizeStrings(raw.commonSellingPoints, LIMITS.sellingPoints, LIMITS.sellingPoint),
    marketHypotheses: normalizeStrings(raw.marketHypotheses, LIMITS.hypotheses, LIMITS.hypothesis),
    uploadedSources: normalizeStrings(raw.uploadedSources, 20, 200),
    userAcknowledgedLimitedData: Boolean(raw.userAcknowledgedLimitedData),
  };
}

export function countResearchMaterials(draft: MarketIntakeDraft): number {
  return (
    draft.keywords.length +
    draft.competitorAccounts.length +
    draft.competitorVideos.length +
    draft.publicLinks.length +
    draft.userObservations.length +
    draft.customerQuestions.length +
    draft.commonPainPoints.length +
    draft.commonSellingPoints.length +
    draft.marketHypotheses.length
  );
}

export function draftHasResearchMaterial(draft: MarketIntakeDraft): boolean {
  return countResearchMaterials(draft) > 0;
}

/** Deterministic readiness — no AI. */
export function getMarketIntakeReadiness(draft: MarketIntakeDraft): MarketIntakeReadiness {
  const itemCount = countResearchMaterials(draft);
  const hasResearchMaterial = itemCount > 0;
  const userAcknowledgedLimitedData = Boolean(draft.userAcknowledgedLimitedData);
  const readyForConfirmation = hasResearchMaterial || userAcknowledgedLimitedData;
  let hint = "";
  if (!readyForConfirmation) {
    hint = "当前没有市场素材，也可以按低数据模式继续。选择「我暂时没有市场数据」，或先补充任意一项素材。";
  } else if (!hasResearchMaterial && userAcknowledgedLimitedData) {
    hint = MARKET_INTAKE_NO_DATA_HINT;
  }
  return {
    itemCount,
    hasResearchMaterial,
    userAcknowledgedLimitedData,
    readyForConfirmation,
    hint,
  };
}

export function resolveMarketIntakeState(options: {
  hasResearch: boolean;
  draft: MarketIntakeDraft;
  active: boolean;
}): MarketIntakeState {
  const { hasResearch, draft, active } = options;
  if (hasResearch && !active) {
    return "CONFIRMED";
  }
  const readiness = getMarketIntakeReadiness(draft);
  if (readiness.readyForConfirmation) {
    return "READY_TO_CONFIRM";
  }
  // Continue-intake: existing research + new empty active draft is still "整理中"
  if (draftHasResearchMaterial(draft) || (active && hasResearch)) {
    return "IN_PROGRESS";
  }
  return "EMPTY";
}

export function markFieldProvenance(
  provenance: MarketIntakeProvenanceMap,
  field: string,
  source: MarketIntakeProvenance,
): MarketIntakeProvenanceMap {
  return { ...provenance, [field]: source };
}

export function acknowledgeLimitedData(
  draft: MarketIntakeDraft,
  provenance: MarketIntakeProvenanceMap,
): { draft: MarketIntakeDraft; provenance: MarketIntakeProvenanceMap } {
  return {
    draft: { ...draft, userAcknowledgedLimitedData: true },
    provenance: markFieldProvenance(provenance, "userAcknowledgedLimitedData", "USER_PROVIDED"),
  };
}

export function adoptProductSeedKeywords(
  draft: MarketIntakeDraft,
  seedKeywords: string[] | undefined,
  provenance: MarketIntakeProvenanceMap,
): { draft: MarketIntakeDraft; provenance: MarketIntakeProvenanceMap } {
  const nextKeywords = normalizeStrings(
    [...draft.keywords, ...(seedKeywords ?? [])],
    LIMITS.keywords,
    LIMITS.keyword,
  );
  return {
    draft: { ...draft, keywords: nextKeywords },
    provenance: markFieldProvenance(provenance, "keywords", "USER_CONFIRMED_AI_SUGGESTION"),
  };
}

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function loadMarketIntakeSession(projectId: string): MarketIntakeSession | null {
  if (!canUseSessionStorage() || !projectId) {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(marketIntakeSessionKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarketIntakeSession;
    if (!parsed || typeof parsed !== "object" || !parsed.draft || !Array.isArray(parsed.messages)) {
      return null;
    }
    return {
      draft: sanitizeMarketIntakeDraft(parsed.draft),
      messages: parsed.messages ?? [],
      provenance: parsed.provenance ?? {},
      active: Boolean(parsed.active),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveMarketIntakeSession(projectId: string, session: MarketIntakeSession): void {
  if (!canUseSessionStorage() || !projectId) {
    return;
  }
  const safe: MarketIntakeSession = {
    draft: sanitizeMarketIntakeDraft(session.draft),
    messages: session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      ...(message.localKind ? { localKind: message.localKind } : {}),
    })),
    provenance: session.provenance,
    active: session.active,
    updatedAt: session.updatedAt,
  };
  window.sessionStorage.setItem(marketIntakeSessionKey(projectId), JSON.stringify(safe));
}

export function clearMarketIntakeSession(projectId: string): void {
  if (!canUseSessionStorage() || !projectId) {
    return;
  }
  window.sessionStorage.removeItem(marketIntakeSessionKey(projectId));
}

export function createFreshGuidedMarketSession(): MarketIntakeSession {
  const now = new Date().toISOString();
  return {
    draft: emptyMarketIntakeDraft(),
    messages: createOpeningMessages(now),
    provenance: {},
    active: true,
    updatedAt: now,
  };
}

export function createContinueMarketSession(): MarketIntakeSession {
  const now = new Date().toISOString();
  return {
    draft: emptyMarketIntakeDraft(),
    messages: [
      {
        id: createMessageId(),
        role: "assistant",
        content:
          "可以在现有调研基础上继续补充。告诉我新的关键词、竞品或观察；也可以先在右侧直接编辑。\n\nAI 引导将在下一阶段接入。",
        createdAt: now,
        localKind: "LOCAL_GUIDED_PROMPT",
      },
    ],
    provenance: {},
    active: true,
    updatedAt: now,
  };
}

export type ManualMarketPreviewBody = {
  productBriefId?: string;
  collectedAt: string;
  items: Record<string, unknown>[];
};

/**
 * Map intake draft → MANUAL preview/confirm body.
 * Never invents metrics. Empty items allowed when acknowledged limited data.
 */
export function mapMarketIntakeDraftToManualPreview(
  draft: MarketIntakeDraft,
  options?: { productBriefId?: string; collectedAt?: string },
): ManualMarketPreviewBody {
  const collectedAt = options?.collectedAt ?? new Date().toISOString();
  const items: Record<string, unknown>[] = [];
  const platform = "douyin";
  const source = "MANUAL";

  for (const keyword of draft.keywords) {
    items.push({ kind: "KEYWORD", platform, source, collectedAt, keyword });
  }
  for (const account of draft.competitorAccounts) {
    items.push({
      kind: "COMPETITOR",
      platform,
      source,
      collectedAt,
      displayName: account.displayName,
      ...(account.profileUrl ? { profileUrl: account.profileUrl } : {}),
    });
  }
  for (const video of draft.competitorVideos) {
    items.push({
      kind: "CONTENT",
      platform,
      source,
      collectedAt,
      externalUrl: video.url,
      title: video.label ?? "竞品视频链接（尚未自动抓取）",
      caption: "链接已记录，尚未自动抓取内容",
    });
  }
  for (const link of draft.publicLinks) {
    items.push({
      kind: "CONTENT",
      platform,
      source,
      collectedAt,
      externalUrl: link.url,
      title: link.label ?? "公开链接（尚未自动抓取）",
      caption: "链接已记录，尚未自动抓取内容",
    });
  }
  for (const observation of draft.userObservations) {
    items.push({
      kind: "AUDIENCE_SIGNAL",
      platform,
      source,
      collectedAt,
      topic: observation.slice(0, 80),
      signalType: "observation",
      examples: [observation],
    });
  }
  for (const question of draft.customerQuestions) {
    items.push({
      kind: "AUDIENCE_SIGNAL",
      platform,
      source,
      collectedAt,
      topic: question.slice(0, 80),
      signalType: "question",
      examples: [question],
    });
  }
  for (const pain of draft.commonPainPoints) {
    items.push({
      kind: "AUDIENCE_SIGNAL",
      platform,
      source,
      collectedAt,
      topic: pain.slice(0, 80),
      signalType: "pain",
      examples: [pain],
    });
  }
  for (const selling of draft.commonSellingPoints) {
    items.push({
      kind: "AUDIENCE_SIGNAL",
      platform,
      source,
      collectedAt,
      topic: selling.slice(0, 80),
      signalType: "need",
      examples: [selling],
    });
  }
  for (const hypothesis of draft.marketHypotheses) {
    items.push({
      kind: "AUDIENCE_SIGNAL",
      platform,
      source,
      collectedAt,
      topic: hypothesis.slice(0, 80),
      signalType: "hypothesis",
      examples: [hypothesis],
    });
  }

  return {
    ...(options?.productBriefId ? { productBriefId: options.productBriefId } : {}),
    collectedAt,
    items,
  };
}

export function humanizeMarketIntakeConfirmError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  if (code === "PRODUCT_BRIEF_REQUIRED" || code === "PRODUCT_BRIEF_NOT_FOUND") {
    return "请先完成产品信息，再确认市场调研。";
  }
  if (code === "VALIDATION_ERROR") {
    return "市场调研内容校验未通过，请检查链接或字段后重试。";
  }
  return "市场调研保存失败，你整理的信息仍然保留，请重试。";
}

export function researchSummaryLabel(record: {
  queryContext?: { itemCount?: number; source?: string };
  snapshot?: { sampleStats?: { keywordCount?: number; competitorCount?: number; contentCount?: number } };
}): string {
  const itemCount = record.queryContext?.itemCount;
  if (typeof itemCount === "number") {
    if (itemCount === 0) return "素材较少（依赖产品信息）";
    return `约 ${itemCount} 条研究素材`;
  }
  const stats = record.snapshot?.sampleStats;
  if (!stats) return "已确认的市场调研";
  const total =
    (stats.keywordCount ?? 0) + (stats.competitorCount ?? 0) + (stats.contentCount ?? 0);
  if (total === 0) return "素材较少（依赖产品信息）";
  return `约 ${total} 条研究素材`;
}

export function productBriefHasSeedKeywords(payload: ProductBriefPayload | null | undefined): boolean {
  return Boolean(payload?.seedKeywords?.some((item) => item.trim()));
}

const AI_PATCHABLE_FIELDS = [
  "keywords",
  "competitorAccounts",
  "competitorVideos",
  "publicLinks",
  "userObservations",
  "customerQuestions",
  "commonPainPoints",
  "commonSellingPoints",
  "marketHypotheses",
] as const;

function mergeStringLists(current: string[], incoming: string[]): string[] {
  return normalizeStrings([...current, ...incoming], 40, 500);
}

/**
 * Apply AI/manual draft patch.
 * - string arrays: append + dedupe (supports "再加一个"; AI may still send full list)
 * - competitorAccounts / links: replace when provided (supports correction overwrite)
 * never accepts userAcknowledgedLimitedData from patch.
 */
export function patchMarketIntakeDraft(
  draft: MarketIntakeDraft,
  patch: MarketIntakeDraftPatch,
  provenance: MarketIntakeProvenanceMap,
  source: MarketIntakeProvenance = "USER_PROVIDED",
): { draft: MarketIntakeDraft; provenance: MarketIntakeProvenanceMap } {
  const base = sanitizeMarketIntakeDraft(draft);
  const next: MarketIntakeDraft = { ...base };
  let nextProvenance = { ...provenance };
  for (const key of AI_PATCHABLE_FIELDS) {
    const value = patch[key];
    if (value === undefined) continue;
    if (key === "competitorAccounts" && Array.isArray(value)) {
      next.competitorAccounts = value as MarketCompetitorAccountDraft[];
    } else if ((key === "competitorVideos" || key === "publicLinks") && Array.isArray(value)) {
      next[key] = value as MarketLinkDraft[];
    } else if (
      (key === "keywords" ||
        key === "userObservations" ||
        key === "customerQuestions" ||
        key === "commonPainPoints" ||
        key === "commonSellingPoints" ||
        key === "marketHypotheses") &&
      Array.isArray(value)
    ) {
      next[key] = mergeStringLists(base[key], value as string[]);
    } else {
      continue;
    }
    nextProvenance = markFieldProvenance(nextProvenance, key, source);
  }
  return { draft: sanitizeMarketIntakeDraft(next), provenance: nextProvenance };
}

export function applyMarketIntakeSuggestion(
  draft: MarketIntakeDraft,
  provenance: MarketIntakeProvenanceMap,
  suggestion: MarketIntakeSuggestion,
): { draft: MarketIntakeDraft; provenance: MarketIntakeProvenanceMap } {
  const field = suggestion.field;
  const patch: MarketIntakeDraftPatch = {};
  const current = sanitizeMarketIntakeDraft(draft);

  if (field === "keywords" || field === "userObservations" || field === "customerQuestions" || field === "commonPainPoints" || field === "commonSellingPoints" || field === "marketHypotheses") {
    const list = Array.isArray(suggestion.value)
      ? suggestion.value.filter((item): item is string => typeof item === "string")
      : typeof suggestion.value === "string"
        ? [suggestion.value]
        : [];
    patch[field] = mergeStringLists(current[field], list);
  } else if (field === "competitorAccounts") {
    const accounts: MarketCompetitorAccountDraft[] = [];
    const raw = suggestion.value;
    if (typeof raw === "string") accounts.push({ displayName: raw });
    else if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === "string") accounts.push({ displayName: item });
        else if (item && typeof item === "object" && "displayName" in item) {
          accounts.push(item as MarketCompetitorAccountDraft);
        }
      }
    } else if (raw && typeof raw === "object" && "displayName" in raw) {
      accounts.push(raw as MarketCompetitorAccountDraft);
    }
    const merged = [...current.competitorAccounts];
    for (const account of accounts) {
      if (!merged.some((row) => row.displayName === account.displayName)) merged.push(account);
    }
    patch.competitorAccounts = merged;
  } else if (field === "competitorVideos" || field === "publicLinks") {
    const links: MarketLinkDraft[] = [];
    const raw = suggestion.value;
    if (typeof raw === "string") links.push({ url: raw });
    else if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === "string") links.push({ url: item });
        else if (item && typeof item === "object" && "url" in item) links.push(item as MarketLinkDraft);
      }
    } else if (raw && typeof raw === "object" && "url" in raw) {
      links.push(raw as MarketLinkDraft);
    }
    const merged = [...current[field]];
    for (const link of links) {
      if (!merged.some((row) => row.url === link.url)) merged.push(link);
    }
    patch[field] = merged;
  } else {
    return { draft: current, provenance };
  }

  return patchMarketIntakeDraft(current, patch, provenance, "USER_CONFIRMED_AI_SUGGESTION");
}

export function draftToTurnPayload(draft: MarketIntakeDraft): MarketIntakeDraftPatch & {
  userAcknowledgedLimitedData?: boolean;
} {
  const clean = sanitizeMarketIntakeDraft(draft);
  return {
    keywords: clean.keywords,
    competitorAccounts: clean.competitorAccounts,
    competitorVideos: clean.competitorVideos,
    publicLinks: clean.publicLinks,
    userObservations: clean.userObservations,
    customerQuestions: clean.customerQuestions,
    commonPainPoints: clean.commonPainPoints,
    commonSellingPoints: clean.commonSellingPoints,
    marketHypotheses: clean.marketHypotheses,
    userAcknowledgedLimitedData: clean.userAcknowledgedLimitedData,
  };
}

