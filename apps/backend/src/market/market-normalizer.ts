import { AppError, ErrorCode } from '../common/errors/app-error.js';
import {
  MARKET_ALLOWED_PLATFORMS,
  MARKET_COMPETITION_SIGNALS,
  MARKET_ENGAGEMENT_SIGNALS,
  MARKET_FREQUENCY_SIGNALS,
  MARKET_HEAT_SIGNALS,
  MARKET_ITEM_KINDS,
  MARKET_MAX_AUDIENCE_EXAMPLES,
  MARKET_MAX_CONTENT_KEYWORDS,
  MARKET_MAX_CONTENT_THEMES,
  MARKET_MAX_HASHTAGS,
  MARKET_MAX_ITEMS,
  MARKET_MAX_JSON_BYTES,
  MARKET_MAX_PER_KIND,
  MARKET_MAX_RELATED_KEYWORDS,
  MARKET_STRING_LIMITS,
  MARKET_VOLUME_SIGNALS,
  MARKET_WRITABLE_SOURCES,
} from './market.constants.js';
import { buildMarketCanonicalKey } from './market-canonical-key.js';
import { marketRecordHasAudiencePii, marketRecordHasSecretKeys } from './market-secrets.js';
import type {
  MarketCompetitionSignal,
  MarketContentMetrics,
  MarketEngagementSignal,
  MarketFrequencySignal,
  MarketHeatSignal,
  MarketItemKind,
  MarketNormalizeResult,
  MarketProvenance,
  MarketSourceValue,
  MarketVolumeSignal,
  NormalizedAudienceSignalItem,
  NormalizedCompetitorItem,
  NormalizedContentItem,
  NormalizedKeywordItem,
  NormalizedMarketItem,
  NormalizedTrendItem,
} from './market.types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredKind(value: unknown): MarketItemKind {
  if (typeof value !== 'string' || !(MARKET_ITEM_KINDS as readonly string[]).includes(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'item.kind is invalid');
  }
  return value as MarketItemKind;
}

function requiredPlatform(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'item.platform is required');
  }
  const platform = value.trim().toLowerCase();
  if (!(MARKET_ALLOWED_PLATFORMS as readonly string[]).includes(platform)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'unsupported market platform');
  }
  return platform;
}

function requiredSource(value: unknown): MarketSourceValue {
  if (value == null) {
    return 'MANUAL';
  }
  if (typeof value !== 'string') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'item.source is invalid');
  }
  if (!(MARKET_WRITABLE_SOURCES as readonly string[]).includes(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'unsupported market source');
  }
  return value as MarketSourceValue;
}

function requiredDate(value: unknown, field: string, fallback?: string): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  if (!raw) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} is required`);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} is invalid`);
  }
  return date.toISOString();
}

function optionalDate(value: unknown, field: string): string | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} is invalid`);
  }
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} is invalid`);
  }
  return date.toISOString();
}

function optionalString(value: unknown, field: string, max: number): string | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > max) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} exceeds ${max} characters`);
  }
  return trimmed;
}

function requiredString(value: unknown, field: string, max: number): string {
  const next = optionalString(value, field, max);
  if (!next) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} is required`);
  }
  return next;
}

function optionalInt(value: unknown, field: string, min = 0): number | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < min) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} is invalid`);
  }
  return value;
}

function optionalRate(value: unknown, field: string): number | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} is invalid`);
  }
  return value;
}

function optionalScore(value: unknown, field: string): number | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} is invalid`);
  }
  return value;
}

function optionalEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} is invalid`);
  }
  return value as T;
}

function stringArray(value: unknown, field: string, maxItems: number, maxItemLength: number): string[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} must be an array`);
  }
  if (value.length > maxItems) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} exceeds ${maxItems} items`);
  }
  return value
    .map((item) => optionalString(item, field, maxItemLength))
    .filter((item): item is string => Boolean(item));
}

function sanitizeProvenance(value: unknown, source: MarketSourceValue): MarketProvenance | undefined {
  if (value == null) {
    return { source };
  }
  if (!isRecord(value) || marketRecordHasSecretKeys(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'item.provenance contains forbidden fields');
  }
  const allowed = new Set(['source', 'pageContext', 'importFileFingerprint', 'providerRequestId']);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'item.provenance contains forbidden fields');
    }
  }
  const provenance: MarketProvenance = { source };
  const pageContext = optionalString(value.pageContext, 'provenance.pageContext', MARKET_STRING_LIMITS.pageContext);
  const importFileFingerprint = optionalString(
    value.importFileFingerprint,
    'provenance.importFileFingerprint',
    MARKET_STRING_LIMITS.importFileFingerprint,
  );
  const providerRequestId = optionalString(
    value.providerRequestId,
    'provenance.providerRequestId',
    MARKET_STRING_LIMITS.providerRequestId,
  );
  if (pageContext) {
    provenance.pageContext = pageContext;
  }
  if (importFileFingerprint) {
    provenance.importFileFingerprint = importFileFingerprint;
  }
  if (providerRequestId) {
    provenance.providerRequestId = providerRequestId;
  }
  return provenance;
}

function contentMetrics(record: Record<string, unknown>): MarketContentMetrics {
  const nested = isRecord(record.metrics) ? record.metrics : record;
  return {
    views: optionalInt(nested.views, 'views'),
    likes: optionalInt(nested.likes, 'likes'),
    comments: optionalInt(nested.comments, 'comments'),
    shares: optionalInt(nested.shares, 'shares'),
    favorites: optionalInt(nested.favorites, 'favorites'),
    completionRate: optionalRate(nested.completionRate, 'completionRate'),
  };
}

function normalizeKeyword(record: Record<string, unknown>, collectedAt: string): NormalizedKeywordItem {
  const platform = requiredPlatform(record.platform);
  const source = requiredSource(record.source);
  const keyword = requiredString(record.keyword, 'keyword', MARKET_STRING_LIMITS.keyword);
  const itemCollectedAt = requiredDate(record.collectedAt, 'collectedAt', collectedAt);
  const externalId = optionalString(record.externalId ?? record.externalContentId, 'externalId', MARKET_STRING_LIMITS.externalId);
  const externalUrl = optionalString(record.externalUrl, 'externalUrl', MARKET_STRING_LIMITS.url);
  return {
    kind: 'KEYWORD',
    platform,
    source,
    collectedAt: itemCollectedAt,
    canonicalKey: buildMarketCanonicalKey({ kind: 'KEYWORD', platform, externalId, externalUrl, keyword }),
    ...(externalId ? { externalId } : {}),
    ...(externalUrl ? { externalUrl } : {}),
    keyword,
    relatedKeywords: stringArray(record.relatedKeywords, 'relatedKeywords', MARKET_MAX_RELATED_KEYWORDS, MARKET_STRING_LIMITS.keyword),
    searchRank: optionalInt(record.searchRank, 'searchRank', 1),
    trendScore: optionalScore(record.trendScore, 'trendScore'),
    volumeSignal: optionalEnum(record.volumeSignal, MARKET_VOLUME_SIGNALS, 'volumeSignal') as MarketVolumeSignal | null,
    competitionSignal: optionalEnum(
      record.competitionSignal,
      MARKET_COMPETITION_SIGNALS,
      'competitionSignal',
    ) as MarketCompetitionSignal | null,
    provenance: sanitizeProvenance(record.provenance, source),
  };
}

function normalizeContent(record: Record<string, unknown>, collectedAt: string): NormalizedContentItem {
  const platform = requiredPlatform(record.platform);
  const source = requiredSource(record.source);
  const itemCollectedAt = requiredDate(record.collectedAt, 'collectedAt', collectedAt);
  const externalContentId = optionalString(
    record.externalContentId ?? record.externalId,
    'externalContentId',
    MARKET_STRING_LIMITS.externalId,
  );
  const externalUrl = optionalString(record.externalUrl, 'externalUrl', MARKET_STRING_LIMITS.url);
  const title = optionalString(record.title, 'title', MARKET_STRING_LIMITS.title);
  const author = optionalString(record.author, 'author', MARKET_STRING_LIMITS.author);
  const publishedAt = optionalDate(record.publishedAt, 'publishedAt');
  return {
    kind: 'CONTENT',
    platform,
    source,
    collectedAt: itemCollectedAt,
    canonicalKey: buildMarketCanonicalKey({
      kind: 'CONTENT',
      platform,
      externalId: externalContentId,
      externalUrl,
      title,
      author,
      publishedAt,
    }),
    ...(externalContentId ? { externalId: externalContentId } : {}),
    ...(externalUrl ? { externalUrl } : {}),
    externalContentId,
    title,
    caption: optionalString(record.caption, 'caption', MARKET_STRING_LIMITS.caption),
    author,
    publishedAt,
    durationSeconds: optionalInt(record.durationSeconds, 'durationSeconds'),
    hashtags: stringArray(record.hashtags, 'hashtags', MARKET_MAX_HASHTAGS, MARKET_STRING_LIMITS.keyword),
    keywords: stringArray(record.keywords, 'keywords', MARKET_MAX_CONTENT_KEYWORDS, MARKET_STRING_LIMITS.keyword),
    metrics: contentMetrics(record),
    provenance: sanitizeProvenance(record.provenance, source),
  };
}

function normalizeCompetitor(record: Record<string, unknown>, collectedAt: string): NormalizedCompetitorItem {
  const platform = requiredPlatform(record.platform);
  const source = requiredSource(record.source);
  const displayName = requiredString(record.displayName, 'displayName', MARKET_STRING_LIMITS.displayName);
  const itemCollectedAt = requiredDate(record.collectedAt, 'collectedAt', collectedAt);
  const externalAccountId = optionalString(record.externalAccountId, 'externalAccountId', MARKET_STRING_LIMITS.externalId);
  const profileUrl = optionalString(record.profileUrl, 'profileUrl', MARKET_STRING_LIMITS.url);
  return {
    kind: 'COMPETITOR',
    platform,
    source,
    collectedAt: itemCollectedAt,
    canonicalKey: buildMarketCanonicalKey({
      kind: 'COMPETITOR',
      platform,
      externalId: externalAccountId,
      externalUrl: profileUrl,
      displayName,
      externalAccountId,
      profileUrl,
    }),
    ...(externalAccountId ? { externalId: externalAccountId } : {}),
    ...(profileUrl ? { externalUrl: profileUrl } : {}),
    displayName,
    externalAccountId,
    profileUrl,
    followerCount: optionalInt(record.followerCount, 'followerCount'),
    recentPostCount: optionalInt(record.recentPostCount, 'recentPostCount'),
    postingFrequencySignal: optionalEnum(
      record.postingFrequencySignal,
      MARKET_FREQUENCY_SIGNALS,
      'postingFrequencySignal',
    ) as MarketFrequencySignal | null,
    engagementSignal: optionalEnum(
      record.engagementSignal,
      MARKET_ENGAGEMENT_SIGNALS,
      'engagementSignal',
    ) as MarketEngagementSignal | null,
    contentThemes: stringArray(record.contentThemes, 'contentThemes', MARKET_MAX_CONTENT_THEMES, MARKET_STRING_LIMITS.topic),
    provenance: sanitizeProvenance(record.provenance, source),
  };
}

function normalizeTrend(record: Record<string, unknown>, collectedAt: string): NormalizedTrendItem {
  const platform = requiredPlatform(record.platform);
  const source = requiredSource(record.source);
  const name = requiredString(record.name, 'name', MARKET_STRING_LIMITS.name);
  const itemCollectedAt = requiredDate(record.collectedAt, 'collectedAt', collectedAt);
  const observedAt = requiredDate(record.observedAt, 'observedAt', itemCollectedAt);
  return {
    kind: 'TREND',
    platform,
    source,
    collectedAt: itemCollectedAt,
    canonicalKey: buildMarketCanonicalKey({ kind: 'TREND', platform, name }),
    name,
    rank: optionalInt(record.rank, 'rank', 1),
    heatSignal: optionalEnum(record.heatSignal, MARKET_HEAT_SIGNALS, 'heatSignal') as MarketHeatSignal | null,
    category: optionalString(record.category, 'category', MARKET_STRING_LIMITS.category),
    startedAt: optionalDate(record.startedAt, 'startedAt'),
    observedAt,
    provenance: sanitizeProvenance(record.provenance, source),
  };
}

function normalizeAudience(record: Record<string, unknown>, collectedAt: string): NormalizedAudienceSignalItem {
  if (marketRecordHasAudiencePii(record)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'audience signal must not include identity fields');
  }
  const platform = requiredPlatform(record.platform);
  const source = requiredSource(record.source);
  const topic = requiredString(record.topic, 'topic', MARKET_STRING_LIMITS.topic);
  const signalType = requiredString(record.signalType, 'signalType', MARKET_STRING_LIMITS.signalType);
  const itemCollectedAt = requiredDate(record.collectedAt, 'collectedAt', collectedAt);
  return {
    kind: 'AUDIENCE_SIGNAL',
    platform,
    source,
    collectedAt: itemCollectedAt,
    canonicalKey: buildMarketCanonicalKey({ kind: 'AUDIENCE_SIGNAL', platform, topic, signalType }),
    topic,
    signalType,
    frequency: optionalInt(record.frequency, 'frequency'),
    examples: stringArray(record.examples, 'examples', MARKET_MAX_AUDIENCE_EXAMPLES, MARKET_STRING_LIMITS.example),
    provenance: sanitizeProvenance(record.provenance, source),
  };
}

function normalizeOne(value: unknown, collectedAt: string): NormalizedMarketItem {
  if (!isRecord(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'market item must be an object');
  }
  if (marketRecordHasSecretKeys(value) || marketRecordHasSecretKeys(value.provenance) || marketRecordHasSecretKeys(value.metrics)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'market item contains forbidden fields');
  }
  const kind = requiredKind(value.kind);
  if (kind === 'KEYWORD') {
    return normalizeKeyword(value, collectedAt);
  }
  if (kind === 'CONTENT') {
    return normalizeContent(value, collectedAt);
  }
  if (kind === 'COMPETITOR') {
    return normalizeCompetitor(value, collectedAt);
  }
  if (kind === 'TREND') {
    return normalizeTrend(value, collectedAt);
  }
  return normalizeAudience(value, collectedAt);
}

export function normalizeMarketItems(input: {
  items: unknown[];
  collectedAt: string;
}): MarketNormalizeResult {
  const encoded = JSON.stringify(input);
  if (encoded.length > MARKET_MAX_JSON_BYTES) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'market payload exceeds size limit');
  }
  if (input.items.length > MARKET_MAX_ITEMS) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `market items exceed ${MARKET_MAX_ITEMS}`);
  }
  const collectedAt = requiredDate(input.collectedAt, 'collectedAt');
  const items: NormalizedMarketItem[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  const counts: Record<MarketItemKind, number> = {
    KEYWORD: 0,
    CONTENT: 0,
    COMPETITOR: 0,
    TREND: 0,
    AUDIENCE_SIGNAL: 0,
  };
  for (const raw of input.items) {
    const item = normalizeOne(raw, collectedAt);
    counts[item.kind] += 1;
    if (counts[item.kind] > MARKET_MAX_PER_KIND[item.kind]) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `${item.kind} items exceed ${MARKET_MAX_PER_KIND[item.kind]}`);
    }
    if (seen.has(item.canonicalKey)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(item.canonicalKey);
    items.push(item);
  }
  const warnings = duplicateCount > 0 ? [`Removed ${duplicateCount} duplicate canonicalKey item(s)`] : [];
  return { items, duplicateCount, warnings };
}
