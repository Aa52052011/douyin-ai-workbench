import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors/app-error.js';
import { normalizeMarketItems } from './market-normalizer.js';

const collectedAt = '2026-09-01T00:00:00.000Z';

describe('normalizeMarketItems', () => {
  it('normalizes empty strings to null/[] and keeps explicit zero', () => {
    const result = normalizeMarketItems({
      collectedAt,
      items: [
        {
          kind: 'CONTENT',
          platform: 'douyin',
          source: 'MANUAL',
          title: '  测试样本A  ',
          caption: '   ',
          views: 0,
          likes: null,
          hashtags: [' ', '职场'],
        },
      ],
    });
    const item = result.items[0];
    expect(item?.kind).toBe('CONTENT');
    if (item?.kind !== 'CONTENT') {
      return;
    }
    expect(item.title).toBe('测试样本A');
    expect(item.caption).toBeNull();
    expect(item.metrics.views).toBe(0);
    expect(item.metrics.likes).toBeNull();
    expect(item.hashtags).toEqual(['职场']);
    expect(item.canonicalKey).toContain('douyin:content:测试样本a');
  });

  it('dedupes by canonicalKey and rejects secrets / unsupported source', () => {
    const result = normalizeMarketItems({
      collectedAt,
      items: [
        { kind: 'KEYWORD', platform: 'douyin', keyword: '职场沟通' },
        { kind: 'KEYWORD', platform: 'douyin', keyword: ' 职场沟通 ' },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
    expect(() =>
      normalizeMarketItems({
        collectedAt,
        items: [{ kind: 'KEYWORD', platform: 'douyin', keyword: 'A', provenance: { token: 'x' } }],
      }),
    ).toThrow(expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }));
    expect(
      normalizeMarketItems({
        collectedAt,
        items: [{ kind: 'KEYWORD', platform: 'douyin', keyword: 'A', source: 'IMPORT' }],
      }).items[0]?.source,
    ).toBe('IMPORT');
    expect(() =>
      normalizeMarketItems({
        collectedAt,
        items: [{ kind: 'KEYWORD', platform: 'douyin', keyword: 'A', source: 'THIRD_PARTY' }],
      }),
    ).toThrow(expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }));
  });

  it('rejects audience identity fields', () => {
    expect(() =>
      normalizeMarketItems({
        collectedAt,
        items: [
          {
            kind: 'AUDIENCE_SIGNAL',
            platform: 'douyin',
            topic: '表达',
            signalType: 'pain',
            userId: 'u-1',
          },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }));
  });
});
