import { describe, expect, it } from 'vitest';
import {
  compactMarketIntakeDraft,
  getMarketIntakeQuestionPlan,
} from './market-intake-question-plan.js';
import {
  getMarketIntakeReadinessFromDraft,
  sanitizeMarketIntakeDraftPatch,
} from './market-intake.patch.js';
import { buildMockMarketIntakeOutput } from './market-intake.fixture.js';
import { isUnknownUserReply } from './intake-unknown.js';

describe('market intake required-field completion (12.12M)', () => {
  it('readiness is material OR acknowledgement — no CSV hard gate', () => {
    expect(getMarketIntakeReadinessFromDraft({}).readyForConfirmation).toBe(false);
    expect(
      getMarketIntakeReadinessFromDraft({ keywords: ['美甲店获客'] }).readyForConfirmation,
    ).toBe(true);
    expect(
      getMarketIntakeReadinessFromDraft({}, { userAcknowledgedLimitedData: true })
        .readyForConfirmation,
    ).toBe(true);
  });

  it('question plan lists unfilled material fields without inventing requirements', () => {
    const plan = getMarketIntakeQuestionPlan({});
    expect(plan.hasMarketMaterial).toBe(false);
    expect(plan.allowLowDataContinue).toBe(true);
    expect(plan.nextPriorityFields.length).toBeLessThanOrEqual(2);

    const withKw = getMarketIntakeQuestionPlan({ keywords: ['美甲店获客'] });
    expect(withKw.hasMarketMaterial).toBe(true);
    expect(withKw.alreadyFilledFields).toContain('keywords');
    expect(withKw.readyForConfirmation).toBe(true);
    expect(withKw.nextPriorityFields).toEqual([]);
  });

  it('unknown replies are not written as competitor/keyword facts', () => {
    expect(isUnknownUserReply('竞品我不知道')).toBe(true);
    expect(sanitizeMarketIntakeDraftPatch({ keywords: ['不知道', '美甲店获客'] })).toEqual({
      keywords: ['美甲店获客'],
    });
    expect(sanitizeMarketIntakeDraftPatch({ competitorAccounts: ['不知道'] })).toEqual({});
    expect(
      sanitizeMarketIntakeDraftPatch({
        competitorAccounts: [{ displayName: '不确定' }],
      }),
    ).toEqual({});
  });

  it('CASE M1: research keywords extract without CSV demand', () => {
    const out = buildMockMarketIntakeOutput(`允许无数据继续：true
当前 Market Draft（紧凑 JSON）：
{}
最新用户消息：
我想研究美甲店获客和短视频。
请输出符合 schema 的 JSON。`);
    expect(out.draftPatch.keywords?.length).toBeGreaterThan(0);
    expect(out.message).not.toMatch(/CSV|必须上传|必须竞品/);
    expect(out.readyForConfirmation).toBe(true);
  });

  it('CASE M2: unknown competitor does not fabricate', () => {
    const out = buildMockMarketIntakeOutput(`当前 Market Draft（紧凑 JSON）：
${JSON.stringify({ keywords: ['美甲店获客'] })}
最新用户消息：
竞品我不知道。
请输出符合 schema 的 JSON。`);
    expect(out.draftPatch).toEqual({});
    expect(out.message).toMatch(/没关系/);
    expect(JSON.stringify(out)).not.toMatch(/蝉妈妈/);
  });

  it('CASE M3: further unknown allows low-data continue', () => {
    const out = buildMockMarketIntakeOutput(`当前 Market Draft（紧凑 JSON）：
{}
最新用户消息：
其他我也不知道。
请输出符合 schema 的 JSON。`);
    expect(out.draftPatch).toEqual({});
    expect(out.message).toMatch(/低数据|暂时没有市场数据|没关系/);
  });

  it('CASE M5: existing keywords are not re-asked as primary question', () => {
    const out = buildMockMarketIntakeOutput(`当前 Market Draft（紧凑 JSON）：
${JSON.stringify({ keywords: ['美甲店获客', '美甲店短视频'] })}
最新用户消息：
再补充一点观察：客户很在意价格。
请输出符合 schema 的 JSON。`);
    expect(out.message).not.toMatch(/你想研究哪些关键词/);
  });

  it('compacts draft for prompt', () => {
    expect(compactMarketIntakeDraft({ keywords: ['a'] })).toEqual({
      keywords: ['a'],
    });
  });
});
