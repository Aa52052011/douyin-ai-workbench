import { DOUYIN_EXPORT_MAPPING_VERSION } from './import-file.constants.js';

export const CANONICAL_IMPORT_FIELDS = [
  'title',
  'url',
  'externalPostId',
  'publishedAt',
  'observedAt',
  'exportedAt',
  'views',
  'likes',
  'comments',
  'shares',
  'favorites',
  'averageWatchTimeSeconds',
  'completionRate',
  'newFollowers',
] as const;

export type CanonicalImportField = (typeof CANONICAL_IMPORT_FIELDS)[number];

export const METRIC_IMPORT_FIELDS = [
  'views',
  'likes',
  'comments',
  'shares',
  'favorites',
  'averageWatchTimeSeconds',
  'completionRate',
  'newFollowers',
] as const;

export type ColumnMapping = {
  version: string;
  aliases: Record<CanonicalImportField, readonly string[]>;
};

export const DOUYIN_EXPORT_V1: ColumnMapping = {
  version: DOUYIN_EXPORT_MAPPING_VERSION,
  aliases: {
    title: ['作品名称', '作品标题', '标题', '视频标题'],
    url: ['作品链接', '视频链接', '内容链接'],
    externalPostId: ['作品ID', '视频ID', 'item_id', 'itemId'],
    publishedAt: ['发布时间', '发布日期'],
    observedAt: ['数据截止时间', '统计时间', '数据时间'],
    exportedAt: ['导出时间'],
    views: ['播放量', '播放次数', '播放'],
    likes: ['点赞量', '点赞数', '点赞'],
    comments: ['评论量', '评论数', '评论'],
    shares: ['分享量', '分享数', '分享'],
    favorites: ['收藏量', '收藏数', '收藏'],
    averageWatchTimeSeconds: ['平均播放时长', '平均观看时长'],
    completionRate: ['完播率'],
    newFollowers: ['粉丝增量', '新增粉丝', '涨粉数'],
  },
};

/**
 * Real Douyin work-list columns that must not map onto Snapshot metrics.
 * Deferred: Future Retention / Funnel Metrics Extension.
 */
export const KNOWN_UNMAPPED_METRIC_HEADERS = [
  '5s完播率',
  '封面点击率',
  '2s跳出率',
  '主页访问量',
] as const;

/** Real Douyin work-list context columns (not metrics). */
export const KNOWN_CONTEXT_HEADERS = ['体裁', '审核状态'] as const;

export type ResolvedColumnMapping = {
  version: string;
  fieldToHeader: Partial<Record<CanonicalImportField, string>>;
  unknownHeaders: string[];
  knownUnmappedHeaders: string[];
  contextHeaders: string[];
  collisions: string[];
};

export function normalizeImportHeader(header: string): string {
  return header.replace(/\uFEFF/g, '').trim().replace(/\s+/g, '');
}

export function resolveColumnMapping(
  headers: string[],
  mapping: ColumnMapping = DOUYIN_EXPORT_V1,
): ResolvedColumnMapping {
  const aliasToField = new Map<string, CanonicalImportField>();
  for (const field of CANONICAL_IMPORT_FIELDS) {
    for (const alias of mapping.aliases[field]) {
      aliasToField.set(normalizeImportHeader(alias), field);
    }
  }

  const fieldToHeader: Partial<Record<CanonicalImportField, string>> = {};
  const unknownHeaders: string[] = [];
  const knownUnmappedHeaders: string[] = [];
  const contextHeaders: string[] = [];
  const collisions: string[] = [];
  const knownUnmapped = new Set(KNOWN_UNMAPPED_METRIC_HEADERS.map(normalizeImportHeader));
  const knownContext = new Set(KNOWN_CONTEXT_HEADERS.map(normalizeImportHeader));

  for (const header of headers) {
    const normalized = normalizeImportHeader(header);
    if (!normalized || isDangerousHeader(normalized)) {
      continue;
    }
    const field = aliasToField.get(normalized);
    if (!field) {
      if (knownUnmapped.has(normalized)) {
        knownUnmappedHeaders.push(header);
        continue;
      }
      if (knownContext.has(normalized)) {
        contextHeaders.push(header);
        continue;
      }
      unknownHeaders.push(header);
      continue;
    }
    if (fieldToHeader[field]) {
      collisions.push(header);
      continue;
    }
    fieldToHeader[field] = header;
  }

  return {
    version: mapping.version,
    fieldToHeader,
    unknownHeaders,
    knownUnmappedHeaders,
    contextHeaders,
    collisions,
  };
}

export function mappingColumnWarnings(resolved: ResolvedColumnMapping): string[] {
  return [
    ...resolved.knownUnmappedHeaders.map((header) => `KNOWN_UNMAPPED_METRIC: ${header}`),
    ...resolved.contextHeaders.map((header) => `KNOWN_CONTEXT_FIELD: ${header}`),
    ...resolved.unknownHeaders.map((header) => `Unknown column "${header}" was ignored`),
    ...resolved.collisions.map((header) => `Column "${header}" collided with an already mapped field`),
  ];
}

export function hasMappedMetricColumn(resolved: ResolvedColumnMapping): boolean {
  return METRIC_IMPORT_FIELDS.some((field) => resolved.fieldToHeader[field] != null);
}

function isDangerousHeader(header: string): boolean {
  const lower = header.toLowerCase();
  return lower === '__proto__' || lower === 'constructor' || lower === 'prototype';
}
