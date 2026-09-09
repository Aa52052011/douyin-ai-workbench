import { describe, expect, it } from 'vitest';
import {
  applyDeterministicReadiness,
  getProductIntakeReadiness,
  mergeProductIntakeDraft,
  sanitizeProductIntakeDraftPatch,
  sanitizeProductIntakeSuggestions,
} from './product-intake.patch.js';
import {
  parseProductIntakeInput,
  validateProductIntakeOutput,
} from './product-intake.agent.js';
import { buildMockProductIntakeOutput } from './product-intake.fixture.js';
import { PRODUCT_INTAKE_FIELD_MEANINGS } from './product-intake.types.js';
import { productIntakePromptV1 } from '../prompts/product-intake.prompt.js';
import { PRODUCT_INTAKE_AGENT_ID } from '../agent.types.js';
import { productIntakeDefinition } from './product-intake.agent.js';

describe('product.intake patch validator', () => {
  it('accepts allowlisted fields and trims', () => {
    expect(
      sanitizeProductIntakeDraftPatch({
        productName: ' 美拍助手 ',
        sellingPoints: [' 自动剪辑 ', '自动剪辑', ''],
      }),
    ).toEqual({
      productName: '美拍助手',
      sellingPoints: ['自动剪辑'],
    });
  });

  it('rejects unknown keys and prototype pollution', () => {
    expect(() => sanitizeProductIntakeDraftPatch({ persona: 'x' })).toThrow();
    expect(() =>
      sanitizeProductIntakeDraftPatch(JSON.parse('{"__proto__":{"a":1}}')),
    ).toThrow();
    expect(() => sanitizeProductIntakeDraftPatch({ accountPositioning: {} })).toThrow();
  });

  it('coerces string array fields and object list items safely', () => {
    expect(
      sanitizeProductIntakeDraftPatch({
        painPoints: '老板没时间拍摄',
        sellingPoints: [{ text: '自动生成视频' }, '无需剪辑'],
      }),
    ).toEqual({
      painPoints: ['老板没时间拍摄'],
      sellingPoints: ['自动生成视频', '无需剪辑'],
    });
  });

  it('rejects invalid types and oversized strings', () => {
    expect(() => sanitizeProductIntakeDraftPatch({ productName: 1 })).toThrow();
    expect(() => sanitizeProductIntakeDraftPatch({ sellingPoints: 123 })).toThrow();
    expect(() => sanitizeProductIntakeDraftPatch({ productName: 'x'.repeat(200) })).toThrow();
  });

  it('supports scalar correction overwrite and array replace', () => {
    const merged = mergeProductIntakeDraft(
      { targetAudience: '餐饮店', sellingPoints: ['旧卖点'] },
      { targetAudience: '美容院', sellingPoints: ['新卖点'] },
    );
    expect(merged.targetAudience).toBe('美容院');
    expect(merged.sellingPoints).toEqual(['新卖点']);
  });

  it('does not clear scalars with empty patch values', () => {
    const merged = mergeProductIntakeDraft({ productName: '保留' }, {});
    expect(merged.productName).toBe('保留');
  });

  it('computes deterministic readiness independent of model flags', () => {
    const draft = {
      productName: 'A',
      industry: 'B',
      businessGoal: 'C',
      targetAudience: 'D',
      description: '简介',
    };
    const readiness = getProductIntakeReadiness(draft);
    expect(readiness.readyForConfirmation).toBe(true);
    const forced = applyDeterministicReadiness({
      message: 'ok',
      draftPatch: {},
      suggestions: [],
      draftAfterMerge: { productName: 'A' },
    });
    expect(forced.readyForConfirmation).toBe(false);
    expect(forced.missingFields.length).toBeGreaterThan(0);
  });

  it('sanitizes suggestions against allowlist', () => {
    expect(
      sanitizeProductIntakeSuggestions([
        { id: '1', field: 'seedKeywords', value: ['短视频获客', '短视频获客'], label: '建议' },
      ]),
    ).toEqual([{ id: '1', field: 'seedKeywords', value: ['短视频获客'], label: '建议' }]);
    expect(() =>
      sanitizeProductIntakeSuggestions([{ id: '2', field: 'persona', value: 'x' }]),
    ).toThrow();
  });
});

describe('product.intake agent contract', () => {
  it('registers definition id/version', () => {
    expect(productIntakeDefinition.id).toBe(PRODUCT_INTAKE_AGENT_ID);
    expect(productIntakeDefinition.version).toBe('v1');
  });

  it('parses model-visible input and rejects secrets', () => {
    const parsed = parseProductIntakeInput({
      mode: 'product',
      currentDraft: { productName: 'X' },
      recentConversation: [{ role: 'user', content: '你好' }],
      latestUserMessage: '补充一下',
      locale: 'zh-CN',
    });
    expect(parsed.mode).toBe('product');
    expect(() =>
      parseProductIntakeInput({
        mode: 'product',
        currentDraft: {},
        recentConversation: [],
        latestUserMessage: 'hi',
        locale: 'zh-CN',
        tenantId: 't',
      }),
    ).toThrow();
  });

  it('validates output and overrides readiness', () => {
    const output = validateProductIntakeOutput(
      {
        message: '下一问？',
        draftPatch: { description: '一款工具' },
        suggestions: [],
        missingFields: [],
        readyForConfirmation: true,
      },
      {},
    );
    expect(output.readyForConfirmation).toBe(false);
    expect(output.missingFields).toContain('productName');
  });

  it('rejects positioning leakage in output', () => {
    expect(() =>
      validateProductIntakeOutput(
        {
          message: '定位如下',
          draftPatch: {},
          suggestions: [],
          missingFields: [],
          readyForConfirmation: false,
          accountPositioning: { bio: 'x' },
        },
        {},
      ),
    ).toThrow();
  });
});

describe('product.intake prompt', () => {
  it('contains field semantics, boundaries, and no-invention rules', () => {
    const system = productIntakePromptV1.systemPrompt;
    expect(system).toContain('产品信息采集助手');
    expect(system).toContain('不是：账号定位师');
    expect(system).toContain('Extract > Infer');
    expect(system).toContain('不要编造 productName');
    expect(system).toContain('suggestions');
    for (const key of Object.keys(PRODUCT_INTAKE_FIELD_MEANINGS)) {
      expect(system).toContain(`${key}:`);
    }
    expect(system).toContain(PRODUCT_INTAKE_FIELD_MEANINGS.businessGoal);
  });
});

describe('product.intake mock fixture', () => {
  function promptFor(latest: string, draft: Record<string, unknown> = {}) {
    return `完善已有产品信息：false\n当前 Draft（JSON）：\n${JSON.stringify(draft)}\n最近对话：\n（无）\n最新用户消息：\n${latest}\n请输出`;
  }

  it('extracts evidenced fields without inventing productName', () => {
    const out = buildMockProductIntakeOutput(
      promptFor('我做一个帮助美容院自动生成抖音短视频的工具。'),
    );
    expect(out.draftPatch.productName).toBeUndefined();
    expect(out.draftPatch.description).toBeTruthy();
    expect(out.draftPatch.targetAudience).toBe('美容院');
    expect(out.message).toBeTruthy();
    expect(JSON.stringify(out)).not.toContain('accountPositioning');
  });

  it('supports multi-turn readiness path', () => {
    let draft = {};
    const t1 = buildMockProductIntakeOutput(
      promptFor('我做一个帮助美容院自动生成抖音短视频的工具。', draft),
    );
    draft = mergeProductIntakeDraft(draft, t1.draftPatch);
    const t2 = buildMockProductIntakeOutput(
      promptFor('主要客户是餐饮店。行业是美业。', draft),
    );
    draft = mergeProductIntakeDraft(draft, t2.draftPatch);
    expect(draft.targetAudience).toBe('餐饮店');
    const t3 = buildMockProductIntakeOutput(
      promptFor('刚才说错了，主要是美容院。产品叫美拍助手，我想通过抖音获客。', draft),
    );
    draft = mergeProductIntakeDraft(draft, t3.draftPatch);
    expect(draft.targetAudience).toBe('美容院');
    expect(draft.productName).toBe('美拍助手');
    const t4 = buildMockProductIntakeOutput(
      promptFor('最大的卖点是输入活动内容就自动生成视频，不用自己剪辑。', draft),
    );
    draft = mergeProductIntakeDraft(draft, t4.draftPatch);
    expect(getProductIntakeReadiness(draft).readyForConfirmation).toBe(true);
  });

  it('keeps suggestions out of draftPatch for unknown keywords', () => {
    const out = buildMockProductIntakeOutput(promptFor('我不知道关键词。', { productName: 'A' }));
    expect(out.draftPatch.seedKeywords).toBeUndefined();
    expect(out.suggestions[0]?.field).toBe('seedKeywords');
  });

  it('hallucination sparse input asks instead of inventing', () => {
    const out = buildMockProductIntakeOutput(promptFor('我有一个软件。'));
    expect(out.draftPatch).toEqual({});
    expect(out.message).toMatch(/解决什么问题|叫什么/);
  });

  it('boundary keeps positioning out', () => {
    const out = buildMockProductIntakeOutput(promptFor('你直接告诉我这个账号该怎么定位。'));
    expect(out.message).toContain('账号定位');
    expect(out.draftPatch).toEqual({});
  });
});
