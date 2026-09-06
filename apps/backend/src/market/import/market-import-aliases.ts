import type { MarketItemKind } from '../market.types.js';
import type { MarketImportField } from './market-import.types.js';

export function normalizeMarketImportHeader(value: string): string {
  return value.replace(/\uFEFF/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const SHARED_ALIASES: Partial<Record<MarketImportField, readonly string[]>> = {
  collectedAt: ['采集时间', '收集时间', '数据时间', 'collected at', 'collected_at'],
  sourceContext: ['来源说明', '采样说明', 'source context', 'source_context', '备注'],
};

const ALIASES_BY_KIND: Record<MarketItemKind, Partial<Record<MarketImportField, readonly string[]>>> = {
  CONTENT: {
    title: ['标题', '作品标题', '视频标题', '内容标题', '作品名称'],
    externalContentId: ['作品id', '视频id', '内容id', 'item_id', 'itemid', 'aweme_id'],
    externalUrl: ['作品链接', '视频链接', '内容链接', 'url', '链接'],
    author: ['作者', '账号', '作者昵称', '昵称'],
    publishedAt: ['发布时间', '发布日期', 'published at'],
    durationSeconds: ['时长', '时长秒', '视频时长', 'duration'],
    views: ['播放量', '播放数', '播放次数', '播放'],
    likes: ['点赞量', '点赞数', '点赞'],
    comments: ['评论量', '评论数', '评论'],
    shares: ['分享量', '分享数', '分享', '转发量'],
    favorites: ['收藏量', '收藏数', '收藏'],
    completionRate: ['完播率', 'completion rate'],
    hashtags: ['话题', '话题标签', 'hashtag', 'hashtags'],
    keywords: ['关键词', '内容关键词'],
    ...SHARED_ALIASES,
  },
  KEYWORD: {
    keyword: ['关键词', '搜索词', '关键字'],
    relatedKeywords: ['相关词', '相关关键词', '相关搜索'],
    searchRank: ['搜索排名', '排名'],
    trendScore: ['趋势分', '热度分'],
    volumeSignal: ['量级', '搜索量级', 'volume'],
    competitionSignal: ['竞争', '竞争度', 'competition'],
    ...SHARED_ALIASES,
  },
  COMPETITOR: {
    displayName: ['账号名', '昵称', '展示名', '账号名称', '达人名称'],
    externalAccountId: ['账号id', '用户id', 'sec_uid', 'account_id'],
    profileUrl: ['主页链接', '主页', '账号链接'],
    followerCount: ['粉丝数', '粉丝量', 'followers'],
    recentPostCount: ['近期作品数', '最近作品数', '作品数'],
    postingFrequencySignal: ['更新频率', '发布频率'],
    engagementSignal: ['互动信号', '互动水平'],
    contentThemes: ['内容主题', '主题'],
    ...SHARED_ALIASES,
  },
  TREND: {
    name: ['趋势名', '趋势名称', '话题名', '热点名称'],
    rank: ['排名', '名次'],
    heatSignal: ['热度信号', '热度等级'],
    category: ['分类', '品类'],
    startedAt: ['开始时间', '上榜时间'],
    observedAt: ['观察时间', '统计时间'],
    ...SHARED_ALIASES,
  },
  AUDIENCE_SIGNAL: {
    topic: ['话题', '主题'],
    signalType: ['信号类型', '类型'],
    frequency: ['频次', '出现次数'],
    examples: ['例句', '示例'],
    ...SHARED_ALIASES,
  },
};

export function marketImportAliasTable(
  kind: MarketItemKind,
): Record<MarketImportField, readonly string[]> {
  const raw = ALIASES_BY_KIND[kind];
  const table = {} as Record<MarketImportField, readonly string[]>;
  for (const [field, aliases] of Object.entries(raw)) {
    table[field as MarketImportField] = aliases ?? [];
  }
  return table;
}

export function findAliasField(kind: MarketItemKind, header: string): MarketImportField | null {
  const normalized = normalizeMarketImportHeader(header);
  if (!normalized) {
    return null;
  }
  const aliases = ALIASES_BY_KIND[kind];
  for (const [field, names] of Object.entries(aliases)) {
    if (normalizeMarketImportHeader(field) === normalized) {
      return field as MarketImportField;
    }
    if ((names ?? []).some((alias) => normalizeMarketImportHeader(alias) === normalized)) {
      return field as MarketImportField;
    }
  }
  return null;
}
