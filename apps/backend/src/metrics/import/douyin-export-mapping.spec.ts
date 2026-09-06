import { describe, expect, it } from 'vitest';
import {
  DOUYIN_EXPORT_V1,
  hasMappedMetricColumn,
  resolveColumnMapping,
} from './douyin-export-mapping.js';

describe('douyin-export-v1 mapping', () => {
  it('maps Chinese aliases and reports unknown columns', () => {
    const resolved = resolveColumnMapping(
      ['作品标题', '播放量', '完播率', '神秘列', '__proto__'],
      DOUYIN_EXPORT_V1,
    );
    expect(resolved.version).toBe('douyin-export-v1');
    expect(resolved.fieldToHeader.title).toBe('作品标题');
    expect(resolved.fieldToHeader.views).toBe('播放量');
    expect(resolved.fieldToHeader.completionRate).toBe('完播率');
    expect(resolved.unknownHeaders).toEqual(['神秘列']);
    expect(hasMappedMetricColumn(resolved)).toBe(true);
  });

  it('maps real work-list headers and does not treat known extras as unknown', () => {
    const resolved = resolveColumnMapping(
      [
        '作品名称',
        '发布时间',
        '体裁',
        '审核状态',
        '播放量',
        '完播率',
        '5s完播率',
        '封面点击率',
        '2s跳出率',
        '平均播放时长',
        '点赞量',
        '分享量',
        '评论量',
        '收藏量',
        '主页访问量',
        '粉丝增量',
      ],
      DOUYIN_EXPORT_V1,
    );
    expect(resolved.fieldToHeader.title).toBe('作品名称');
    expect(resolved.fieldToHeader.newFollowers).toBe('粉丝增量');
    expect(resolved.fieldToHeader.completionRate).toBe('完播率');
    expect(resolved.knownUnmappedHeaders).toEqual(['5s完播率', '封面点击率', '2s跳出率', '主页访问量']);
    expect(resolved.contextHeaders).toEqual(['体裁', '审核状态']);
    expect(resolved.unknownHeaders).toEqual([]);
  });
});
