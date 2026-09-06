import type { MarketItemKind } from '../market.types.js';
import {
  MARKET_IMPORT_FIELDS_BY_KIND,
  MARKET_IMPORT_MAPPING_VERSION,
  MARKET_IMPORT_REQUIRED_BY_KIND,
  type MARKET_IMPORT_DATETIME_FIELDS,
  type MARKET_IMPORT_INTEGER_FIELDS,
  type MARKET_IMPORT_LIST_FIELDS,
  type MARKET_IMPORT_PERCENT_FIELDS,
  type MARKET_IMPORT_SCORE_FIELDS,
  type MARKET_IMPORT_SIGNAL_FIELDS,
} from './market-import.constants.js';
import type {
  MarketImportField,
  MarketImportFieldFormat,
  MarketImportTemplateDefinition,
} from './market-import.types.js';

const INTEGER = new Set<string>([
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
] satisfies ReadonlyArray<(typeof MARKET_IMPORT_INTEGER_FIELDS)[number]>);

const PERCENT = new Set<string>(['completionRate'] satisfies ReadonlyArray<(typeof MARKET_IMPORT_PERCENT_FIELDS)[number]>);
const DATETIME = new Set<string>([
  'publishedAt',
  'startedAt',
  'observedAt',
  'collectedAt',
] satisfies ReadonlyArray<(typeof MARKET_IMPORT_DATETIME_FIELDS)[number]>);
const LIST = new Set<string>([
  'relatedKeywords',
  'hashtags',
  'keywords',
  'contentThemes',
  'examples',
] satisfies ReadonlyArray<(typeof MARKET_IMPORT_LIST_FIELDS)[number]>);
const SIGNAL = new Set<string>([
  'volumeSignal',
  'competitionSignal',
  'heatSignal',
  'postingFrequencySignal',
  'engagementSignal',
] satisfies ReadonlyArray<(typeof MARKET_IMPORT_SIGNAL_FIELDS)[number]>);
const SCORE = new Set<string>(['trendScore'] satisfies ReadonlyArray<(typeof MARKET_IMPORT_SCORE_FIELDS)[number]>);

const DESCRIPTIONS: Record<MarketImportField, string> = {
  title: '内容标题',
  externalContentId: '平台内容 ID',
  externalUrl: '内容链接',
  author: '作者昵称',
  publishedAt: '内容发布时间，不是采集时间',
  durationSeconds: '时长（整数秒）',
  views: '播放量',
  likes: '点赞量',
  comments: '评论量',
  shares: '分享量',
  favorites: '收藏量',
  completionRate: '完播率，仅 12% 或 0.12',
  hashtags: '话题，使用 | 分隔',
  keywords: '关键词，使用 | 分隔',
  collectedAt: '数据采集时间',
  sourceContext: '采样或页面说明',
  keyword: '关键词',
  relatedKeywords: '相关词，使用 | 分隔',
  searchRank: '搜索排名（整数 ≥ 1）',
  trendScore: '相对趋势分，不是官方搜索量',
  volumeSignal: '量级信号 low|medium|high',
  competitionSignal: '竞争信号 low|medium|high',
  displayName: '账号展示名',
  externalAccountId: '平台账号 ID',
  profileUrl: '主页链接',
  followerCount: '粉丝数',
  recentPostCount: '近期作品数',
  postingFrequencySignal: '更新频率信号 low|medium|high',
  engagementSignal: '互动信号 low|medium|high，不是百分比',
  contentThemes: '内容主题，使用 | 分隔',
  name: '趋势名称',
  rank: '排名（整数 ≥ 1）',
  heatSignal: '热度信号 low|medium|high，不是官方热度值',
  category: '趋势分类',
  startedAt: '趋势开始时间',
  observedAt: '趋势观察时间',
  topic: '受众话题',
  signalType: '信号类型',
  frequency: '出现频次',
  examples: '去身份化例句，使用 | 分隔，最多 5 条',
};

export function marketImportFieldFormat(field: MarketImportField): MarketImportFieldFormat {
  if (field === 'durationSeconds') {
    return 'duration';
  }
  if (INTEGER.has(field)) {
    return 'integer';
  }
  if (PERCENT.has(field)) {
    return 'percent';
  }
  if (DATETIME.has(field)) {
    return 'datetime';
  }
  if (LIST.has(field)) {
    return 'list';
  }
  if (SIGNAL.has(field)) {
    return 'signal_enum';
  }
  if (SCORE.has(field)) {
    return 'score';
  }
  return 'string';
}

export function getMarketImportTemplateDefinition(kind: MarketItemKind): MarketImportTemplateDefinition {
  const required = new Set<string>(MARKET_IMPORT_REQUIRED_BY_KIND[kind]);
  return {
    kind,
    mappingVersion: MARKET_IMPORT_MAPPING_VERSION,
    columns: MARKET_IMPORT_FIELDS_BY_KIND[kind].map((field) => ({
      field,
      required: required.has(field),
      format: marketImportFieldFormat(field),
      description: DESCRIPTIONS[field],
    })),
  };
}

export function isMarketImportFieldForKind(kind: MarketItemKind, field: string): field is MarketImportField {
  return (MARKET_IMPORT_FIELDS_BY_KIND[kind] as readonly string[]).includes(field);
}
