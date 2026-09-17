import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_STRATEGY_BRIEF_REFS,
  CAMPAIGN_STRATEGY_POSITIONING_REFS,
  CAMPAIGN_STRATEGY_USER_GOAL_REFS,
} from '../../campaign/campaign-strategy.types.js';
import { PromptRegistry } from './prompt.registry.js';

describe('PromptRegistry', () => {
  it('loads a versioned prompt and renders variables', () => {
    const registry = new PromptRegistry();
    const rendered = registry.render('system.echo', 'v1', { message: 'hello' });
    expect(rendered.name).toBe('system.echo');
    expect(rendered.version).toBe('v1');
    expect(rendered.userPrompt).toBe('hello');
    expect(rendered.systemPrompt).toContain('system.echo');
  });

  it('loads account.positioning:v1', () => {
    const registry = new PromptRegistry();
    const rendered = registry.render('account.positioning', 'v1', {
      industry: '教育',
      platform: 'douyin',
      accountType: 'IP',
      goal: '增长',
      targetAudience: '',
      expertise: '',
      additionalInfo: '',
    });
    expect(rendered.version).toBe('v1');
    expect(rendered.userPrompt).toContain('教育');
  });

  it('loads content.planning:v1', () => {
    const registry = new PromptRegistry();
    const rendered = registry.render('content.planning', 'v1', {
      planningDays: '7',
      postsPerDay: '1',
      platform: 'douyin',
      contentStyle: '',
      additionalRequirements: '',
      trendData: '无',
      campaignStrategy: '无',
      performanceFeedback: '{"dataState":"NONE"}',
      acceptedPerformanceFeedback: '[]',
      positioning: '{}',
      allowedContentPillars: '认知纠偏',
    });
    expect(rendered.version).toBe('v1');
    expect(rendered.systemPrompt).toContain('未使用实时趋势数据');
    expect(rendered.systemPrompt).toContain('必须从用户提示中的「可用内容支柱名称」逐字复制');
    expect(rendered.userPrompt).toContain('可用内容支柱名称');
    expect(rendered.userPrompt).toContain('认知纠偏');
    expect(rendered.systemPrompt).toContain('历史表现反馈');
    expect(rendered.systemPrompt).toContain('CampaignStrategy');
    expect(rendered.systemPrompt).toContain('Current User Request');
    expect(rendered.systemPrompt).toContain('Account Positioning');
    expect(rendered.systemPrompt).toContain('contentMix.percentage');
    expect(rendered.systemPrompt).toContain('不要生成最终 CTA 文案体系');
    expect(rendered.userPrompt).toContain('规划周期：7');
    expect(rendered.userPrompt).toContain('"dataState":"NONE"');
    expect(rendered.systemPrompt).toContain('用户已采纳的历史复盘建议');
  });

  it('loads script.generation:v1', () => {
    const registry = new PromptRegistry();
    const rendered = registry.render('script.generation', 'v1', {
      targetDuration: '30',
      platform: 'douyin',
      contentStyle: '',
      planTitle: '',
      requirements: '',
      contentPlanContext: '{}',
      previousScriptSummaries: '[]',
      strategyContext: '{}',
      accountMemoryContext: '{}',
      referenceContext: '{}',
      topic: '{}',
      positioning: '{}',
    });
    expect(rendered.version).toBe('v1');
    expect(rendered.systemPrompt).toContain('只输出一个 JSON 对象');
    expect(rendered.systemPrompt).toContain('连续内容批次');
    expect(rendered.systemPrompt).toContain('accountMemoryContext');
    expect(rendered.systemPrompt).toContain('referenceContext');
    expect(rendered.userPrompt).toContain('目标时长：30');
    expect(rendered.userPrompt).toContain('本周内容规划上下文 JSON');
    expect(rendered.userPrompt).toContain('参考结构模式 JSON');
  });

  it('loads market.intelligence:v1', () => {
    const registry = new PromptRegistry();
    const rendered = registry.render('market.intelligence', 'v1', {
      inputJson: '{"productBrief":{},"marketEvidence":{}}',
    });
    expect(rendered.version).toBe('v1');
    expect(rendered.systemPrompt).toContain('市场证据分析');
    expect(rendered.systemPrompt).toContain('当前样本不等于全抖音');
    expect(rendered.systemPrompt).toContain('evidenceCodes');
    expect(rendered.systemPrompt).not.toContain('每周发');
    expect(rendered.userPrompt).toContain('marketEvidence');
  });

  it('loads campaign.strategy:v1', () => {
    const registry = new PromptRegistry();
    const rendered = registry.render('campaign.strategy', 'v1', {
      inputJson: '{"version":"v1","productBrief":{}}',
    });
    expect(rendered.version).toBe('v1');
    expect(rendered.systemPrompt).toContain('推广策略');
    expect(rendered.systemPrompt).toContain('USER_GOAL');
    expect(rendered.systemPrompt).toContain('confidenceCeiling');
    expect(rendered.systemPrompt).not.toContain('每天 9:00');
    expect(rendered.userPrompt).toContain('productBrief');
  });

  it('loads product.intake:v1', () => {
    const registry = new PromptRegistry();
    const rendered = registry.render('product.intake', 'v1', {
      mode: 'product',
      locale: 'zh-CN',
      improvingExisting: 'false',
      currentDraftJson: '{}',
      missingRequiredFields: '["productName"]',
      nextPriorityFields: '["productName"]',
      missingRequiredLabels: '["产品名称"]',
      optionalLaterFields: '["tone"]',
      recentConversationText: '（无）',
      latestUserMessage: '你好',
    });
    expect(rendered.version).toBe('v1');
    expect(rendered.systemPrompt).toContain('产品信息采集助手');
    expect(rendered.systemPrompt).toContain('Extract > Infer');
    expect(rendered.systemPrompt).toContain('不要编造 productName');
    expect(rendered.systemPrompt).toContain('不是：账号定位师');
    expect(rendered.systemPrompt).toContain('Priority 1');
    expect(rendered.systemPrompt).toContain('businessGoal:');
    expect(rendered.userPrompt).toContain('最新用户消息');
    expect(rendered.userPrompt).toContain('系统计算的缺失必要字段');
    expect(rendered.userPrompt).toContain('你好');
  });

  it('loads market.intake:v1', () => {
    const registry = new PromptRegistry();
    const rendered = registry.render('market.intake', 'v1', {
      mode: 'market',
      locale: 'zh-CN',
      noDataAllowed: 'true',
      improvingExisting: 'false',
      hasMarketMaterial: 'false',
      userAcknowledgedLimitedData: 'false',
      alreadyFilledFields: '[]',
      nextPriorityFields: '["keywords"]',
      confirmedProductBriefJson: '{}',
      currentDraftJson: '{}',
      recentConversationText: '（无）',
      latestUserMessage: '我想研究关键词',
    });
    expect(rendered.version).toBe('v1');
    expect(rendered.systemPrompt).toContain('市场调研素材采集助手');
    expect(rendered.systemPrompt).toContain('Market Intelligence');
    expect(rendered.systemPrompt).toContain('播放量');
    expect(rendered.systemPrompt).toContain('低数据');
    expect(rendered.userPrompt).toContain('我想研究关键词');
    expect(rendered.userPrompt).toContain('是否已有市场素材');
  });

  it('loads performance.analysis:v1 without credentials', () => {
    const registry = new PromptRegistry();
    const rendered = registry.render('performance.analysis', 'v1', {
      metricsSummary: '{"latestPlayCount":1}',
      dataSufficiency: 'SPARSE',
      benchmarkContext: 'NONE',
      evidenceIndex: '[]',
      scriptSnapshot: '{"title":"hook"}',
      contentPlanSnapshot: '{"title":"plan"}',
      publicationSnapshot: '{"id":"p1"}',
    });
    expect(rendered.systemPrompt).toContain('data-first');
    expect(rendered.systemPrompt).toContain('no fabricated metrics');
    expect(rendered.systemPrompt).toContain('no causal overclaim');
    expect(rendered.systemPrompt).toContain('no benchmark invention');
    expect(rendered.systemPrompt).not.toMatch(/sk-|Bearer /);
    expect(rendered.userPrompt).toContain('SPARSE');
  });

  it('aligns campaign.strategy evidence refs with validator allowlists', () => {
    const registry = new PromptRegistry();
    const rendered = registry.render('campaign.strategy', 'v1', {
      inputJson: '{"version":"v1"}',
      marketInsightCodes: 'TREND_ASSESSMENT_GAP, CONTENT_SAMPLE_METRICS',
      performanceSignalCodes: 'NONE',
    });
    const system = rendered.systemPrompt;
    for (const ref of CAMPAIGN_STRATEGY_BRIEF_REFS) {
      expect(system).toContain(ref);
    }
    for (const ref of CAMPAIGN_STRATEGY_POSITIONING_REFS) {
      expect(system).toContain(ref);
    }
    for (const ref of CAMPAIGN_STRATEGY_USER_GOAL_REFS) {
      expect(system).toContain(ref);
    }
    expect(system).toContain('evidenceBasis.ref 是标识符');
    expect(system).toContain('禁止自造别名');
    expect(system).toContain('Available MARKET_INSIGHT evidence refs');
    expect(system).toContain('Available PERFORMANCE_FEEDBACK evidence refs');
    expect(system).toContain('ACCOUNT_POSITIONING 是合法 type');
    expect(system).not.toContain('不要引用 positioning');
    expect(system).toContain('"type":"ACCOUNT_POSITIONING","ref":"contentPillars"');
    expect(system).toContain('"type":"PRODUCT_BRIEF","ref":"productName"');
    expect(system).toContain('valuePropositions');
    expect(system).toContain('contentPillars');
    expect(system).toContain('confidenceCeiling');
    expect(system).toContain('overall=LIMITED 时不得 HIGH');
    expect(system).toContain('priority 只能出现在 valuePropositions[] 与 contentPillars[]');
    expect(system).toContain('NO_MARKET_INSIGHT');
    expect(system).toContain('NO_PERFORMANCE_HISTORY');
    expect(system).toContain('LIMITED_MARKET_SAMPLE');
    expect(system).toContain('flags 含 NO_MARKET_INSIGHT');
    expect(system).toContain('flags 含 NO_PERFORMANCE_HISTORY');
    expect(system).toContain('dataState.market=LIMITED');
    expect(system).toContain('BRIEF_VERSION_MISMATCH 不要写入 dataLimitations');
    expect(system).not.toMatch(/所有 flags.*dataLimitations/);
    expect(rendered.userPrompt).toContain('Available MARKET_INSIGHT evidence refs: TREND_ASSESSMENT_GAP, CONTENT_SAMPLE_METRICS');
    expect(rendered.userPrompt).toContain('Available PERFORMANCE_FEEDBACK evidence refs: NONE');
  });
});
