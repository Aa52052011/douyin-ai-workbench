import { describe, expect, it } from 'vitest';
import {
  compactProductIntakeDraft,
  deriveProductIntakeMissingRequired,
  getProductIntakeQuestionPlan,
  PRODUCT_INTAKE_GUIDED_REQUIRED_FIELDS,
} from './product-intake-question-plan.js';
import { getProductIntakeReadiness, sanitizeProductIntakeDraftPatch } from './product-intake.patch.js';
import { buildMockProductIntakeOutput } from './product-intake.fixture.js';
import { isUnknownUserReply } from './intake-unknown.js';

describe('product intake required-field completion (12.12M)', () => {
  it('derives guided missing fields including description OR sellingPoints', () => {
    expect(PRODUCT_INTAKE_GUIDED_REQUIRED_FIELDS).toEqual([
      'productName',
      'industry',
      'businessGoal',
      'targetAudience',
    ]);
    expect(deriveProductIntakeMissingRequired({})).toEqual([
      'productName',
      'industry',
      'businessGoal',
      'targetAudience',
      'description',
    ]);
    expect(
      deriveProductIntakeMissingRequired({
        productName: '美拍助手',
        industry: '美业',
        businessGoal: '获客',
        targetAudience: '美甲店老板',
        sellingPoints: ['自动剪辑'],
      }),
    ).toEqual([]);
    expect(
      getProductIntakeReadiness({
        productName: '美拍助手',
        industry: '美业',
        businessGoal: '获客',
        targetAudience: '美甲店老板',
        description: '抖音AI工具',
      }).readyForConfirmation,
    ).toBe(true);
  });

  it('question plan prioritizes at most two missing required fields', () => {
    const plan = getProductIntakeQuestionPlan({});
    expect(plan.nextPriorityFields).toEqual(['productName', 'industry']);
    expect(plan.optionalLaterFields).toContain('tone');
    expect(plan.readyForConfirmation).toBe(false);
  });

  it('improve mode does not re-ask hard fields when complete', () => {
    const draft = {
      productName: '美拍助手',
      industry: '美业',
      businessGoal: '到店咨询',
      targetAudience: '美甲店老板',
      description: '抖音获客工具',
    };
    const plan = getProductIntakeQuestionPlan(draft, { improvingExisting: true });
    expect(plan.missingRequiredFields).toEqual([]);
    expect(plan.nextPriorityFields).toEqual([]);
    expect(plan.readyForConfirmation).toBe(true);
    expect(plan.improvingExisting).toBe(true);
  });

  it('compacts empty keys for prompt token control', () => {
    expect(compactProductIntakeDraft({ productName: 'A', industry: '  ', sellingPoints: [] })).toEqual({
      productName: 'A',
    });
  });

  it('rejects unknown replies as scalar/array facts', () => {
    expect(isUnknownUserReply('不知道')).toBe(true);
    expect(sanitizeProductIntakeDraftPatch({ productName: '不知道' })).toEqual({});
    expect(sanitizeProductIntakeDraftPatch({ seedKeywords: ['不确定', '美甲获客'] })).toEqual({
      seedKeywords: ['美甲获客'],
    });
  });

  it('CASE P1: extracts audience/description and asks name+goal next', () => {
    const prompt = `完善已有产品信息：false
当前 Draft（紧凑 JSON）：
{}
最新用户消息：
我做一个给美容院老板用的抖音AI工具。
请输出符合 schema 的 JSON。`;
    const out = buildMockProductIntakeOutput(prompt);
    expect(out.draftPatch.targetAudience).toMatch(/美容院/);
    expect(out.draftPatch.description || out.draftPatch.sellingPoints).toBeTruthy();
    expect(out.missingFields).toContain('productName');
    expect(out.missingFields).toContain('businessGoal');
    expect(out.message).not.toMatch(/语气|竞品|关键词|价格/);
    expect(out.readyForConfirmation).toBe(false);
  });

  it('CASE P2: fills name+goal then ready', () => {
    const draft = {
      industry: '美业',
      targetAudience: '美容院老板',
      description: '给美容院老板用的抖音AI工具',
    };
    const prompt = `完善已有产品信息：false
当前 Draft（紧凑 JSON）：
${JSON.stringify(draft)}
最新用户消息：
叫美拍助手，主要想帮他们获得到店咨询。
请输出符合 schema 的 JSON。`;
    const out = buildMockProductIntakeOutput(prompt);
    const merged = { ...draft, ...out.draftPatch };
    expect(merged.productName).toBe('美拍助手');
    expect(merged.businessGoal).toMatch(/到店咨询|获客/);
    expect(out.readyForConfirmation).toBe(true);
    expect(out.message).toMatch(/可以确认/);
  });

  it('CASE P3: correction replaces audience', () => {
    const prompt = `完善已有产品信息：false
当前 Draft（紧凑 JSON）：
${JSON.stringify({ targetAudience: '美容院老板', productName: '美拍助手' })}
最新用户消息：
不是美容院，是美甲店。
请输出符合 schema 的 JSON。`;
    const out = buildMockProductIntakeOutput(prompt);
    expect(out.draftPatch.targetAudience).toMatch(/美甲/);
    expect(out.draftPatch.targetAudience).not.toMatch(/美容/);
    expect(out.message).toMatch(/已把目标用户调整/);
  });

  it('CASE P4: improve mode opening does not re-ask hard fields', () => {
    const draft = {
      productName: '美拍助手',
      industry: '美业',
      businessGoal: '到店咨询',
      targetAudience: '美甲店老板',
      description: '抖音工具',
    };
    const prompt = `完善已有产品信息：true
当前 Draft（紧凑 JSON）：
${JSON.stringify(draft)}
最新用户消息：
继续完善
请输出符合 schema 的 JSON。`;
    const out = buildMockProductIntakeOutput(prompt);
    expect(out.draftPatch).toEqual({});
    expect(out.message).toMatch(/想先改哪一块|继续完善/);
    expect(out.message).not.toMatch(/产品叫什么|属于哪个行业/);
  });

  it('suggestions stay separate from facts in unknown-keyword path', () => {
    const prompt = `完善已有产品信息：false
当前 Draft（紧凑 JSON）：
${JSON.stringify({
  productName: 'A',
  industry: 'B',
  businessGoal: 'C',
  targetAudience: 'D',
  description: 'E',
})}
最新用户消息：
不知道关键词
请输出符合 schema 的 JSON。`;
    const out = buildMockProductIntakeOutput(prompt);
    expect(out.draftPatch).toEqual({});
    expect(out.suggestions.length).toBeGreaterThan(0);
    expect(out.readyForConfirmation).toBe(true);
  });
});
