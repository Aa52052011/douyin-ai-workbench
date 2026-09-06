import { MARKET_ITEM_KINDS } from '../market.constants.js';

export const MARKET_IMPORT_MAPPING_VERSION = 'market-import-v1';

export const MARKET_IMPORT_MAX_FILE_BYTES = 1 * 1024 * 1024;

export const MARKET_IMPORT_MAX_ROWS = 200;

export const MARKET_IMPORT_MAX_COLUMNS = 40;

export const MARKET_IMPORT_MAX_CELL_CHARS = 2000;

export const MARKET_IMPORT_MAX_SHEETS = 20;

export const MARKET_IMPORT_FORMATS = ['CSV', 'XLSX'] as const;

export type MarketImportFormat = (typeof MARKET_IMPORT_FORMATS)[number];

export const MARKET_IMPORT_ORIGINS = [
  'THIRD_PARTY',
  'MANUAL_EXPORT',
  'DOUYIN_VISIBLE_PAGE',
  'UNKNOWN',
] as const;

export type MarketImportOrigin = (typeof MARKET_IMPORT_ORIGINS)[number];

export const MARKET_IMPORT_SELECTION_METHODS = [
  'MANUAL_CURATED',
  'SEARCH_RESULT_PAGE',
  'COMPETITOR_ACCOUNT_RECENT_POSTS',
  'THIRD_PARTY_EXPORT',
  'UNKNOWN',
] as const;

export type MarketImportSelectionMethod = (typeof MARKET_IMPORT_SELECTION_METHODS)[number];

export const MARKET_IMPORT_FORBIDDEN_TARGETS = [
  'kind',
  'source',
  'platform',
  'canonicalKey',
  'provenance',
  'productBriefId',
  'tenantId',
  'workspaceId',
  'projectId',
] as const;

export const MARKET_IMPORT_CONTROL_COLUMNS = ['kind', 'source', 'platform', 'canonicalKey'] as const;

export const MARKET_IMPORT_FIELDS_BY_KIND = {
  CONTENT: [
    'title',
    'externalContentId',
    'externalUrl',
    'author',
    'publishedAt',
    'durationSeconds',
    'views',
    'likes',
    'comments',
    'shares',
    'favorites',
    'completionRate',
    'hashtags',
    'keywords',
    'collectedAt',
    'sourceContext',
  ],
  KEYWORD: [
    'keyword',
    'relatedKeywords',
    'searchRank',
    'trendScore',
    'volumeSignal',
    'competitionSignal',
    'collectedAt',
    'sourceContext',
  ],
  COMPETITOR: [
    'displayName',
    'externalAccountId',
    'profileUrl',
    'followerCount',
    'recentPostCount',
    'postingFrequencySignal',
    'engagementSignal',
    'contentThemes',
    'collectedAt',
    'sourceContext',
  ],
  TREND: [
    'name',
    'rank',
    'heatSignal',
    'category',
    'startedAt',
    'observedAt',
    'collectedAt',
    'sourceContext',
  ],
  AUDIENCE_SIGNAL: ['topic', 'signalType', 'frequency', 'examples', 'collectedAt', 'sourceContext'],
} as const;

export const MARKET_IMPORT_REQUIRED_BY_KIND = {
  CONTENT: [] as const,
  KEYWORD: ['keyword'] as const,
  COMPETITOR: ['displayName'] as const,
  TREND: ['name'] as const,
  AUDIENCE_SIGNAL: ['topic', 'signalType'] as const,
};

export const MARKET_IMPORT_INTEGER_FIELDS = [
  'views',
  'likes',
  'comments',
  'shares',
  'favorites',
  'followerCount',
  'recentPostCount',
  'searchRank',
  'rank',
  'frequency',
  'durationSeconds',
] as const;

export const MARKET_IMPORT_INTEGER_MIN: Record<(typeof MARKET_IMPORT_INTEGER_FIELDS)[number], number> = {
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  favorites: 0,
  followerCount: 0,
  recentPostCount: 0,
  searchRank: 1,
  rank: 1,
  frequency: 0,
  durationSeconds: 0,
};

export const MARKET_IMPORT_PERCENT_FIELDS = ['completionRate'] as const;

export const MARKET_IMPORT_DATETIME_FIELDS = ['publishedAt', 'startedAt', 'observedAt', 'collectedAt'] as const;

export const MARKET_IMPORT_LIST_FIELDS = [
  'relatedKeywords',
  'hashtags',
  'keywords',
  'contentThemes',
  'examples',
] as const;

export const MARKET_IMPORT_SIGNAL_FIELDS = [
  'volumeSignal',
  'competitionSignal',
  'heatSignal',
  'postingFrequencySignal',
  'engagementSignal',
] as const;

export const MARKET_IMPORT_SCORE_FIELDS = ['trendScore'] as const;

export const MARKET_IMPORT_BLOCKED_VOLUME_HEADERS = ['searchvolume', 'search_volume', '搜索量'];

export const MARKET_IMPORT_BLOCKED_HEAT_HEADERS = [
  'douyinheat',
  'hotvalue',
  'officialheat',
  '抖音热度',
  '官方热度',
];

export const MARKET_IMPORT_AUDIENCE_IDENTITY_HEADERS = [
  'username',
  'userid',
  'profileurl',
  'avatar',
  'privatemessage',
  '用户名',
  '用户id',
  '主页链接',
  '头像',
  '私信',
];

export const MARKET_IMPORT_DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'] as const;

export const MARKET_IMPORT_KINDS = MARKET_ITEM_KINDS;
