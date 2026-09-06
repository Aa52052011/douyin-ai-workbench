import { emptyPerformanceFeedback } from '../../metrics/performance-feedback.builder.js';
import type { CompactPerformanceFeedback } from '../../metrics/performance-feedback.types.js';
import { parseModelJson } from './account-positioning.agent.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from './account-positioning.fixture.js';
import { parseCampaignStrategyInput } from './campaign-strategy.agent.js';
import type { MarketInsightOutputV1 } from './market-intelligence.types.js';
import {
  LIMITED_MARKET_SAMPLE_LIMITATION,
  NO_MARKET_INSIGHT_LIMITATION,
  NO_PERFORMANCE_HISTORY_LIMITATION,
  collectMarketInsightCodes,
  collectPerformanceSignalCodes,
  type CampaignStrategyEvidenceBasis,
  type CampaignStrategyInputSnapshot,
  type CampaignStrategyOutputV1,
} from '../../campaign/campaign-strategy.types.js';

export function buildMockCampaignStrategyOutput(snapshot: CampaignStrategyInputSnapshot): CampaignStrategyOutputV1 {
  const brief = snapshot.productBrief.payload;
  const positioning = snapshot.accountPositioning.output;
  const evidence: CampaignStrategyEvidenceBasis[] = [
    { type: 'PRODUCT_BRIEF', ref: 'productName' },
    { type: 'ACCOUNT_POSITIONING', ref: 'accountPositioning' },
  ];
  if (snapshot.currentUserGoal?.userGoal) {
    evidence.push({ type: 'USER_GOAL', ref: 'userGoal' });
  }
  const insightCode = snapshot.marketInsight ? collectMarketInsightCodes(snapshot.marketInsight.payload)[0] : undefined;
  if (insightCode) {
    evidence.push({ type: 'MARKET_INSIGHT', ref: insightCode });
  }
  const performanceCode = collectPerformanceSignalCodes(snapshot.performanceFeedback)[0];
  if (performanceCode) {
    evidence.push({ type: 'PERFORMANCE_FEEDBACK', ref: performanceCode });
  }

  const dataLimitations: string[] = [];
  if (snapshot.flags.includes('NO_MARKET_INSIGHT')) {
    dataLimitations.push(NO_MARKET_INSIGHT_LIMITATION);
  }
  if (snapshot.flags.includes('NO_PERFORMANCE_HISTORY')) {
    dataLimitations.push(NO_PERFORMANCE_HISTORY_LIMITATION);
  }
  if (snapshot.dataState.market === 'LIMITED') {
    dataLimitations.push(LIMITED_MARKET_SAMPLE_LIMITATION);
  }
  if (dataLimitations.length === 0) {
    dataLimitations.push('SAMPLE_NOT_PLATFORM_WIDE');
  }

  const audience =
    brief.targetAudience?.trim() ||
    positioning.targetAudience.description ||
    '与账号定位一致的核心用户';
  const marketNote =
    snapshot.dataState.market === 'LIMITED'
      ? '当前样本中的有限市场信号仅作方向参考'
      : snapshot.marketInsight
        ? '结合已确认的市场洞察方向'
        : '在缺少市场洞察时先以产品与定位为准';

  return {
    version: 'v1',
    objective: {
      businessGoal: brief.businessGoal,
      ...(brief.conversionGoal ? { conversionGoal: brief.conversionGoal } : {}),
      primaryObjective: snapshot.currentUserGoal?.userGoal?.trim() || brief.businessGoal,
    },
    targetAudience: {
      primary: audience,
      pains: (positioning.userPainPoints ?? []).slice(0, 3),
      motivations: ['理解产品如何解决问题', '确认是否适合自己'],
    },
    positioning: {
      accountRole: positioning.persona.identity,
      marketPosition: positioning.accountPositioning.slice(0, 200),
      differentiation: positioning.differentiation.slice(0, 3),
    },
    valuePropositions: [
      {
        proposition: `${brief.productName} 应先讲清对用户的具体帮助，而不是铺开全部卖点。`,
        evidenceBasis: evidence.slice(0, 3),
        priority: 'high',
      },
    ],
    contentPillars: (positioning.contentPillars.length > 0 ? positioning.contentPillars : [{ name: '认知', description: '讲清问题' }])
      .slice(0, 3)
      .map((pillar, index) => ({
        name: pillar.name,
        purpose: pillar.description || marketNote,
        priority: index === 0 ? 'high' : 'medium',
        evidenceBasis: [{ type: 'ACCOUNT_POSITIONING', ref: 'contentPillars' }],
      })),
    contentMix:
      snapshot.dataState.market === 'USABLE'
        ? [
            { type: '认知讲解', percentage: 50, purpose: '建立问题意识' },
            { type: '方法演示', percentage: 30, purpose: '展示可执行动作' },
            { type: '信任证明', percentage: 20, purpose: '降低尝试门槛' },
          ]
        : [
            { type: '认知讲解', purpose: '先验证问题是否被理解' },
            { type: '方法演示', purpose: '用可执行内容收集反馈' },
          ],
    creativeAngles: [
      {
        angle: `围绕${brief.productName}的使用场景提问`,
        rationale: marketNote,
        evidenceBasis: [{ type: 'PRODUCT_BRIEF', ref: 'productName' }],
      },
    ],
    conversionPath: {
      awareness: '先让用户识别自己是否有对应问题',
      consideration: '再用产品限制与适用边界帮助判断',
      conversion: snapshot.currentUserGoal?.userGoal?.includes('认知')
        ? '本阶段只引导了解与关注，不强调立即购买'
        : '引导用户到主页或评论区继续了解产品',
    },
    ctaStrategy: {
      principles: ['优先互动与收藏', '不承诺结果，不制造虚假紧迫'],
      allowedDirections: ['评论区补充方法', '主页了解产品'],
    },
    testingStrategy: {
      hypotheses: [
        {
          hypothesis: snapshot.performanceFeedback.dataState === 'NONE'
            ? '待验证：该内容支柱能否吸引目标用户停留与互动'
            : '在已有信号方向上验证同一支柱是否仍然有效',
          evidenceBasis: performanceCode
            ? [{ type: 'PERFORMANCE_FEEDBACK', ref: performanceCode }]
            : [{ type: 'PRODUCT_BRIEF', ref: 'businessGoal' }],
        },
      ],
      variables: ['内容支柱', '开头问题'],
      successSignals: ['comment rate', 'share rate', 'completion rate'],
    },
    publishingCadence: {
      guidance: '先以稳定频率测试 2–3 个内容支柱，再依据表现调整。',
    },
    risks: [
      {
        risk: snapshot.marketInsight ? '把当前样本信号外推成平台结论' : '在缺少市场洞察时过度推断需求',
        mitigation: '保持样本表述，并用测试假设验证',
      },
    ],
    confidence: snapshot.confidenceCeiling,
    dataLimitations,
  };
}

export function buildMockCampaignStrategyText(prompt: string): string {
  return JSON.stringify(buildMockCampaignStrategyOutput(parseCampaignStrategyInput(parseModelJson(prompt))));
}

export function buildTestCampaignStrategySnapshot(
  overrides: Partial<CampaignStrategyInputSnapshot> = {},
): CampaignStrategyInputSnapshot {
  const performance = overrides.performanceFeedback ?? emptyPerformanceFeedback(new Date('2026-09-05T00:00:00.000Z'));
  const marketInsight = overrides.marketInsight === undefined ? null : overrides.marketInsight;
  const flags = overrides.flags ?? [
    ...(marketInsight ? [] : ['NO_MARKET_INSIGHT' as const]),
    ...(performance.dataState === 'NONE' ? ['NO_PERFORMANCE_HISTORY' as const] : []),
  ];
  const snapshot: CampaignStrategyInputSnapshot = {
    version: 'v1',
    composedAt: '2026-09-05T00:00:00.000Z',
    productBrief: {
      id: '11111111-1111-1111-1111-111111111111',
      version: 1,
      payload: {
        productName: '防脱精华',
        industry: '个护',
        businessGoal: '获客',
        seedKeywords: ['防脱'],
        sellingPoints: ['植物防脱'],
      },
    },
    marketInsight,
    accountPositioning: {
      positioningRunId: '22222222-2222-2222-2222-222222222222',
      output: MOCK_ACCOUNT_POSITIONING_OUTPUT,
    },
    performanceFeedback: performance,
    currentUserGoal: { userGoal: '本阶段只做品牌认知，不做立即转化' },
    projectContext: { name: '策略项目', industry: '个护', platform: 'douyin' },
    dataState: {
      market: marketInsight ? 'LIMITED' : 'NONE',
      performance: performance.dataState === 'USABLE' ? 'USABLE' : performance.dataState === 'NONE' ? 'NONE' : 'LIMITED',
      positioning: 'AVAILABLE',
      productBrief: 'AVAILABLE',
      overall: 'LIMITED',
    },
    confidenceCeiling: 'LOW',
    flags,
    inputPriority: [
      'USER_GOAL',
      'PRODUCT_BRIEF',
      'ACCOUNT_POSITIONING',
      'MARKET_INSIGHT',
      'PERFORMANCE_FEEDBACK',
      'PROJECT_CONTEXT',
    ],
    ...overrides,
  };
  return snapshot;
}

export function limitedInsightPayload(): MarketInsightOutputV1 {
  return {
    version: 'v1',
    marketResearchId: '33333333-3333-3333-3333-333333333333',
    evidenceVersion: 'v1',
    executiveSummary: '当前样本中防脱相关内容更常见。',
    marketState: 'LIMITED_SIGNAL',
    keywordInsights: [
      {
        code: 'KW-FANGTUO',
        statement: '当前样本中防脱关键词出现更频繁。',
        evidenceKind: 'INFERRED',
        confidence: 'LOW',
        evidenceCodes: ['HIGH_VOLUME_SIGNAL_KEYWORDS'],
      },
    ],
    contentInsights: [],
    competitorInsights: [],
    trendInsights: [],
    audienceInsights: [],
    opportunityInsights: [],
    strategicImplications: [],
    dataLimitations: ['LIMITED_SAMPLE'],
    confidence: 'LOW',
    evidenceCoverage: { evidenceItemsAvailable: 1, evidenceItemsReferenced: 1, coverageRate: 1 },
  };
}

export function usablePerformanceFeedback(): CompactPerformanceFeedback {
  return {
    ...emptyPerformanceFeedback(new Date('2026-09-05T00:00:00.000Z')),
    dataState: 'USABLE',
    sampleSize: 8,
    publicationsConsidered: 8,
    dataQuality: { sufficientCount: 8, partialCount: 0, insufficientCount: 0 },
    positiveSignals: [
      {
        code: 'HIGH_COMMENT_RATE',
        category: 'ENGAGEMENT',
        confidence: 'MEDIUM',
        supportCount: 3,
        publicationIds: ['44444444-4444-4444-4444-444444444444'],
        representativeEvidence: [],
      },
    ],
    cautionSignals: [],
    dataQualitySignals: [],
  };
}
