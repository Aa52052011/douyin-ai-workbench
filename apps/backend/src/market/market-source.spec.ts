import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  buildMarketResearchContext,
  canonicalizeUrl,
  classifyMarketUrl,
  marketSourceRoleLabel,
  marketSourceTypeLabel,
  sourceDedupeKey,
  upsertMarketSource,
  type MarketSourceDraftEntry,
} from './market-source.js';

function entry(partial: Partial<MarketSourceDraftEntry>): MarketSourceDraftEntry {
  return {
    id: partial.id ?? '1',
    role: partial.role ?? 'MARKET_EVIDENCE',
    sourceType: partial.sourceType ?? 'KEYWORD',
    provenance: partial.provenance ?? 'USER_PROVIDED',
    capturedAt: partial.capturedAt ?? '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('market-source classifier / context', () => {
  it('classifies Douyin video / account / short / web / invalid', () => {
    assert.equal(classifyMarketUrl('https://www.douyin.com/video/7123456789012345678').sourceType, 'DOUYIN_VIDEO_URL');
    assert.equal(classifyMarketUrl('https://www.douyin.com/user/MS4wLjABAAAA').sourceType, 'DOUYIN_ACCOUNT_URL');
    assert.equal(classifyMarketUrl('https://v.douyin.com/AbCdEf/').sourceType, 'DOUYIN_URL_UNKNOWN');
    assert.equal(classifyMarketUrl('https://example.com/a').sourceType, 'WEB_URL');
    assert.equal(classifyMarketUrl('not a url').valid, false);
  });

  it('strips tracking query deterministically', () => {
    const tracked = canonicalizeUrl('https://www.douyin.com/video/1?utm_source=x&id=1');
    assert.equal(tracked.includes('utm_source'), false);
    assert.ok(tracked.includes('douyin.com/video/1'));
  });

  it('dedupes same URL+role and allows same URL different roles', () => {
    const a = entry({
      role: 'MARKET_EVIDENCE',
      sourceType: 'DOUYIN_VIDEO_URL',
      canonicalUrl: 'https://douyin.com/video/1',
    });
    const b = entry({
      role: 'REFERENCE_CONTENT',
      sourceType: 'DOUYIN_VIDEO_URL',
      canonicalUrl: 'https://douyin.com/video/1',
    });
    assert.notEqual(sourceDedupeKey(a), sourceDedupeKey(b));
    let list: MarketSourceDraftEntry[] = [];
    const first = upsertMarketSource(list, a);
    list = first.list;
    assert.equal(first.created, true);
    const dup = upsertMarketSource(list, { ...a, id: '2' });
    assert.equal(dup.created, false);
  });

  it('builds normalized context with role separation', () => {
    const ctx = buildMarketResearchContext({
      keywords: ['美甲'],
      competitors: ['竞品A'],
      sources: [
        entry({ id: 'e1', role: 'MARKET_EVIDENCE', sourceType: 'KEYWORD', keyword: '获客' }),
        entry({
          id: 'r1',
          role: 'REFERENCE_CONTENT',
          sourceType: 'DOUYIN_VIDEO_URL',
          url: 'https://douyin.com/video/9',
          canonicalUrl: 'https://douyin.com/video/9',
        }),
        entry({
          id: 'o1',
          role: 'OWN_CONTENT',
          sourceType: 'UPLOAD_VIDEO',
          assetId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        }),
        entry({
          id: 'p1',
          role: 'PRODUCTION_ASSET',
          sourceType: 'UPLOAD_VIDEO',
          assetId: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
        }),
      ],
      researchRequested: true,
    });
    assert.ok(ctx.keywords.includes('美甲'));
    assert.ok(ctx.keywords.includes('获客'));
    assert.equal(ctx.evidenceSummaries.length, 1);
    assert.equal(ctx.referenceSeeds.length, 1);
    assert.equal(ctx.ownContentSeeds.length, 1);
    assert.equal(ctx.provenanceSummary.researchRequested, true);
    assert.equal(
      [...ctx.evidenceSummaries, ...ctx.referenceSeeds, ...ctx.ownContentSeeds].some((x) => x.id === 'p1'),
      false,
    );
  });

  it('exposes Chinese labels without raw enums', () => {
    assert.equal(marketSourceRoleLabel('REFERENCE_CONTENT'), '爆款参考');
    assert.equal(marketSourceTypeLabel('DOUYIN_VIDEO_URL'), '抖音视频链接');
    assert.equal(marketSourceRoleLabel('MARKET_EVIDENCE').includes('MARKET_EVIDENCE'), false);
  });
});
