import { describe, expect, it } from 'vitest';
import { buildMarketCanonicalKey, normalizeMarketUrl } from './market-canonical-key.js';

describe('buildMarketCanonicalKey', () => {
  it('prefers platform + externalId', () => {
    expect(
      buildMarketCanonicalKey({
        kind: 'CONTENT',
        platform: 'Douyin',
        externalId: ' 7471 ',
        externalUrl: 'https://www.douyin.com/video/1',
      }),
    ).toBe('douyin:id:7471');
  });

  it('uses normalized url when id is missing', () => {
    expect(
      buildMarketCanonicalKey({
        kind: 'CONTENT',
        platform: 'douyin',
        externalUrl: 'https://www.Douyin.com/video/1/',
      }),
    ).toBe(`douyin:url:${normalizeMarketUrl('https://www.Douyin.com/video/1/')}`);
  });

  it('builds kind-specific keys', () => {
    expect(buildMarketCanonicalKey({ kind: 'KEYWORD', platform: 'douyin', keyword: ' 职场沟通 ' })).toBe(
      'douyin:keyword:职场沟通',
    );
    expect(
      buildMarketCanonicalKey({ kind: 'COMPETITOR', platform: 'douyin', displayName: '账号A' }),
    ).toBe('douyin:competitor:name:账号a');
    expect(buildMarketCanonicalKey({ kind: 'TREND', platform: 'douyin', name: '新人沟通' })).toBe(
      'douyin:trend:新人沟通',
    );
    expect(
      buildMarketCanonicalKey({
        kind: 'AUDIENCE_SIGNAL',
        platform: 'douyin',
        topic: '不会表达',
        signalType: 'pain',
      }),
    ).toBe('douyin:audience:pain:不会表达');
  });
});
