import { randomUUID } from 'node:crypto';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from './account-positioning.fixture.js';
import type {
  CampaignStrategyPlanningSnapshot,
  ContentPlanOutput,
  ContentTopic,
} from './content-planning.types.js';

const PILLARS = MOCK_ACCOUNT_POSITIONING_OUTPUT.contentPillars;

export function buildMockContentPlanOutput(options?: {
  planningDays?: number;
  postsPerDay?: number;
  campaignStrategy?: CampaignStrategyPlanningSnapshot;
}): ContentPlanOutput {
  const planningDays = options?.planningDays ?? 7;
  const postsPerDay = options?.postsPerDay ?? 1;
  const strategyHint = strategyGuidance(options?.campaignStrategy);
  const total = planningDays * postsPerDay;
  const topics: ContentTopic[] = [];
  const counts = new Map<string, number>();

  for (let day = 1; day <= planningDays; day += 1) {
    for (let slot = 1; slot <= postsPerDay; slot += 1) {
      const pillar = PILLARS[(topics.length) % PILLARS.length];
      counts.set(pillar.name, (counts.get(pillar.name) ?? 0) + 1);
      topics.push({
        id: randomUUID(),
        dayIndex: day,
        title: strategyHint
          ? `本批第${topics.length + 1}条：${pillar.name}·${strategyHint}`
          : `本批第${topics.length + 1}条：${pillar.name}落地法`,
        hook: `新人最容易在${pillar.name}上踩的坑，不是你想的那样`,
        contentPillar: pillar.name,
        targetAudience: MOCK_ACCOUNT_POSITIONING_OUTPUT.targetAudience.description,
        painPoint: MOCK_ACCOUNT_POSITIONING_OUTPUT.userPainPoints[0],
        contentAngle: strategyHint
          ? `用${pillar.name}体现策略方向「${strategyHint}」`
          : `用${pillar.name}拆一个本周能做的动作`,
        format: MOCK_ACCOUNT_POSITIONING_OUTPUT.contentFormats[0],
        estimatedDuration: '30-45s',
        priority: day === 1 ? 'high' : slot === 1 ? 'medium' : 'low',
        reason: strategyHint
          ? `对应定位支柱「${pillar.name}」，并覆盖策略方向「${strategyHint}」`
          : `对应支柱「${pillar.name}」，覆盖目标用户的核心痛点`,
        keywords: [pillar.name, '职场新人'],
        cta: '评论区留下你这周要改的一件事',
        status: 'planned',
        scheduledDate: undefined,
      });
    }
  }

  const pillarAllocation = PILLARS.map((pillar) => ({
    pillarName: pillar.name,
    percentage: pillar.percentage ?? 0,
    topicCount: counts.get(pillar.name) ?? 0,
  })).filter((item) => item.topicCount > 0);

  return {
    title: `本批职场成长内容规划`,
    summary: `按账号定位生成 ${total} 条选题，覆盖认知纠偏、方法演示与案例复盘。`,
    planningDays,
    postsPerDay,
    platform: 'douyin',
    contentStyle: '冷静具体',
    additionalRequirements: undefined,
    pillarAllocation,
    usedTrendData: false,
    trendNote: '未使用实时趋势数据',
    topics,
  };
}

export const MOCK_CONTENT_PLAN_OUTPUT = buildMockContentPlanOutput({
  planningDays: 7,
  postsPerDay: 1,
});

export function extractCampaignStrategyFromPrompt(prompt: string): CampaignStrategyPlanningSnapshot | undefined {
  const match = prompt.match(/推广策略 JSON[：:]\s*([\s\S]*?)\n历史表现反馈 JSON/);
  const raw = match?.[1]?.trim();
  if (!raw || raw === '无') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as CampaignStrategyPlanningSnapshot;
    if (!parsed?.id || !parsed.payload) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function strategyGuidance(strategy?: CampaignStrategyPlanningSnapshot): string | undefined {
  if (!strategy?.payload) {
    return undefined;
  }
  const pillar = strategy.payload.contentPillars?.[0]?.name?.trim();
  if (pillar) {
    return pillar;
  }
  const angle = strategy.payload.creativeAngles?.[0]?.angle?.trim();
  if (angle) {
    return angle;
  }
  const proposition = strategy.payload.valuePropositions?.[0]?.proposition?.trim();
  return proposition ? proposition.slice(0, 24) : undefined;
}
