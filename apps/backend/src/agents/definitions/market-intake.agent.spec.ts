import { describe, expect, it } from 'vitest';
import {
  applyDeterministicMarketReadiness,
  getMarketIntakeReadinessFromDraft,
  mergeMarketIntakeDraft,
  sanitizeMarketIntakeDraftPatch,
  sanitizeMarketIntakeSuggestions,
} from './market-intake.patch.js';
import {
  marketIntakeDefinition,
  parseMarketIntakeInput,
  validateMarketIntakeOutput,
} from './market-intake.agent.js';
import { buildMockMarketIntakeOutput } from './market-intake.fixture.js';
import { MARKET_INTAKE_FIELD_MEANINGS } from './market-intake.types.js';
import { marketIntakePromptV1 } from '../prompts/market-intake.prompt.js';
import { MARKET_INTAKE_AGENT_ID } from '../agent.types.js';

const brief = {
  productName: '美拍助手',
  industry: '本地服务',
  businessGoal: '到店咨询',
  targetAudience: '美甲店老板',
};

describe('market.intake patch validator', () => {
  it('accepts allowlisted fields and rejects metrics', () => {
    expect(
      sanitizeMarketIntakeDraftPatch({
        keywords: [' 美甲店获客 ', '美甲店获客'],
        competitorAccounts: [{ displayName: ' 店A ', profileUrl: 'https://example.com/a' }],
      }),
    ).toEqual({
      keywords: ['美甲店获客'],
      competitorAccounts: [{ displayName: '店A', profileUrl: 'https://example.com/a' }],
    });
    expect(() => sanitizeMarketIntakeDraftPatch({ playCount: 1 })).toThrow();
    expect(() => sanitizeMarketIntakeDraftPatch({ likeCount: 1 })).toThrow();
  });

  it('rejects unknown keys, forbidden AI fields, and prototype pollution', () => {
    expect(() => sanitizeMarketIntakeDraftPatch({ marketInsight: {} })).toThrow();
    expect(() => sanitizeMarketIntakeDraftPatch({ userAcknowledgedLimitedData: true })).toThrow();
    expect(() => sanitizeMarketIntakeDraftPatch({ uploadedSources: ['x'] })).toThrow();
    expect(() => sanitizeMarketIntakeDraftPatch(JSON.parse('{"__proto__":{"a":1}}'))).toThrow();
  });

  it('validates URLs and dedupes', () => {
    expect(
      sanitizeMarketIntakeDraftPatch({
        publicLinks: [
          { url: 'https://example.com/a' },
          { url: 'https://example.com/a' },
          { url: 'not-a-url' },
        ],
      }),
    ).toEqual({
      publicLinks: [{ url: 'https://example.com/a' }],
    });
    expect(
      sanitizeMarketIntakeDraftPatch({
        publicLinks: [{ url: 'ftp://example.com/a' }],
      }),
    ).toEqual({});
  });

  it('supports array replace for correction', () => {
    const merged = mergeMarketIntakeDraft(
      { competitorAccounts: [{ displayName: '美业增长研究所' }] },
      { competitorAccounts: [{ displayName: '美业增长实验室' }] },
    );
    expect(merged.competitorAccounts).toEqual([{ displayName: '美业增长实验室' }]);
  });

  it('computes deterministic readiness independent of model flags', () => {
    expect(getMarketIntakeReadinessFromDraft({}).readyForConfirmation).toBe(false);
    expect(getMarketIntakeReadinessFromDraft({ keywords: ['a'] }).readyForConfirmation).toBe(true);
    expect(
      getMarketIntakeReadinessFromDraft({}, { userAcknowledgedLimitedData: true }).readyForConfirmation,
    ).toBe(true);
    const forced = applyDeterministicMarketReadiness({
      message: 'ok',
      draftPatch: {},
      suggestions: [],
      draftAfterMerge: {},
    });
    expect(forced.readyForConfirmation).toBe(false);
  });

  it('keeps suggestions separate from draft facts', () => {
    expect(
      sanitizeMarketIntakeSuggestions([
        { id: '1', field: 'keywords', value: ['美甲店获客', '美甲店获客'], label: '建议' },
      ]),
    ).toEqual([{ id: '1', field: 'keywords', value: '美甲店获客', label: '建议' }]);
  });
});

describe('market.intake agent contract', () => {
  it('registers market.intake:v1 without version in id', () => {
    expect(marketIntakeDefinition.id).toBe(MARKET_INTAKE_AGENT_ID);
    expect(marketIntakeDefinition.version).toBe('v1');
    expect(marketIntakeDefinition.id.includes(':')).toBe(false);
  });

  it('parses input with ProductBrief context and rejects secrets', () => {
    const input = parseMarketIntakeInput({
      mode: 'market',
      confirmedProductBrief: brief,
      currentDraft: {},
      recentConversation: [],
      latestUserMessage: '你好',
      locale: 'zh-CN',
      noDataAllowed: true,
    });
    expect(input.confirmedProductBrief.productName).toBe('美拍助手');
    expect(() =>
      parseMarketIntakeInput({
        mode: 'market',
        confirmedProductBrief: brief,
        currentDraft: {},
        recentConversation: [],
        latestUserMessage: 'hi',
        locale: 'zh-CN',
        noDataAllowed: true,
        apiKey: 'x',
      }),
    ).toThrow();
  });

  it('rejects insight leakage in output', () => {
    expect(() =>
      validateMarketIntakeOutput(
        {
          message: 'x',
          draftPatch: {},
          suggestions: [],
          missingAreas: [],
          readyForConfirmation: true,
          marketInsight: {},
        },
        {},
      ),
    ).toThrow();
  });
});

describe('market.intake prompt', () => {
  it('encodes Market Intake responsibility and boundaries', () => {
    const system = marketIntakePromptV1.systemPrompt;
    expect(system).toContain('Market Intake');
    expect(system).toContain('Market Intelligence');
    expect(system).toContain('播放量');
    expect(system).toContain('suggestions');
    expect(system).toContain('ProductBrief');
    expect(system).toContain('noDataAllowed');
    expect(system).toContain('1–2 个自然问题');
    for (const key of Object.keys(MARKET_INTAKE_FIELD_MEANINGS)) {
      expect(system).toContain(key);
    }
  });
});

describe('market.intake mock fixture', () => {
  function promptFor(message: string, draft: object = {}) {
    return `模式：market
语言：zh-CN
允许无数据继续：true
完善已有市场调研：false

已确认产品信息（上下文，不是市场事实）：
${JSON.stringify(brief)}

当前 Market Draft（JSON）：
${JSON.stringify(draft)}

最近对话：
（无）

最新用户消息：
${message}

请输出符合 schema 的 JSON。`;
  }

  it('extracts keywords', () => {
    const out = buildMockMarketIntakeOutput(promptFor('我想先看看美甲店获客和美甲店短视频这两个方向。'));
    expect(out.draftPatch.keywords).toEqual(expect.arrayContaining(['美甲店获客', '美甲店短视频']));
    expect(out.suggestions).toEqual([]);
  });

  it('does not fabricate competitors', () => {
    const out = buildMockMarketIntakeOutput(promptFor('我不知道有什么竞品。'));
    expect(out.draftPatch.competitorAccounts).toBeUndefined();
  });

  it('no-data yields suggestions only', () => {
    const out = buildMockMarketIntakeOutput(promptFor('我什么都不知道。'));
    expect(out.draftPatch).toEqual({});
    expect(out.suggestions.length).toBeGreaterThan(0);
    expect(out.suggestions[0]?.field).toBe('keywords');
  });

  it('supports competitor correction', () => {
    const first = buildMockMarketIntakeOutput(promptFor('竞品叫美业增长研究所。'));
    expect(first.draftPatch.competitorAccounts?.[0]?.displayName).toBe('美业增长研究所');
    const second = buildMockMarketIntakeOutput(
      promptFor('刚才名字错了，是美业增长实验室。', first.draftPatch),
    );
    expect(second.draftPatch.competitorAccounts).toEqual([{ displayName: '美业增长实验室' }]);
  });

  it('boundary: no market conclusions', () => {
    const out = buildMockMarketIntakeOutput(promptFor('你直接告诉我这个市场现在最火什么。'));
    expect(out.draftPatch).toEqual({});
    expect(out.message).toContain('市场分析');
    expect(JSON.stringify(out)).not.toMatch(/市场规模|增长率|播放量/);
  });
});
