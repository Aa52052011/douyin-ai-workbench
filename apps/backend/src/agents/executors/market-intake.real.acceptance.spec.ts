import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AgentRegistry } from '../agent.registry.js';
import type { AgentContext } from '../agent.types.js';
import { MARKET_INTAKE_AGENT_ID, MARKET_INTAKE_AGENT_VERSION } from '../agent.types.js';
import { mergeMarketIntakeDraft } from '../definitions/market-intake.patch.js';
import type { MarketIntakeDraft } from '../definitions/market-intake.types.js';
import { isRealModelConfigured } from '../models/model.config.js';
import { MockModelProvider } from '../models/mock.provider.js';
import { ModelRouter } from '../models/model.router.js';
import { RealModelProvider } from '../models/real.provider.js';
import { PromptRegistry } from '../prompts/prompt.registry.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { InProcessAgentExecutor } from './in-process.executor.js';

function loadRootEnv() {
  const envPath = resolve(process.cwd(), '../../.env');
  try {
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore
  }
}

loadRootEnv();
process.env.NODE_ENV = 'development';
process.env.MODEL_PROVIDER = 'real';

const enabled =
  process.env.MARKET_INTAKE_REAL_ACCEPTANCE === 'true' && isRealModelConfigured();

const brief = {
  productName: '美拍助手',
  industry: '本地服务',
  businessGoal: '到店咨询',
  targetAudience: '美甲店老板',
  description: 'AI帮助美甲店生成抖音短视频',
  sellingPoints: ['自动剪辑'],
};

describe.skipIf(!enabled)('market.intake real provider acceptance', () => {
  it(
    'completes 3–4 turns without fake trends/metrics or MarketInsight',
    async () => {
      const context: AgentContext = {
        userId: 'u',
        tenantId: 't',
        workspaceId: 'w',
        projectId: 'p',
        requestId: 'req-mi-real',
        locale: 'zh-CN',
      };
      const mock = new MockModelProvider();
      const real = new RealModelProvider();
      const router = new ModelRouter(mock, real);
      const executor = new InProcessAgentExecutor(
        new AgentRegistry(),
        router,
        new ToolRegistry(),
        new PromptRegistry(),
      );

      const turns = [
        '我想研究美甲店获客和美甲店短视频。',
        '我没有关注过竞品。',
        '我不知道还有什么可研究的。',
        '我关注过一个叫美业增长实验室的账号，还有这个视频 https://www.douyin.com/video/7123456789012345678',
      ];

      let draft: MarketIntakeDraft = {};
      const latencies: number[] = [];
      const usages: Array<{ input: number | null; output: number | null; total: number | null }> = [];
      let providerRequests = 0;

      for (let i = 0; i < turns.length; i += 1) {
        const before = mock.generateCalls;
        // Real provider goes through RealModelProvider; count via router generate by wrapping is hard.
        // We approximate with turn count + track failed separately.
        const started = Date.now();
        const result = await executor.execute(
          {
            requestId: `req-mi-real-${i + 1}`,
            agentId: MARKET_INTAKE_AGENT_ID,
            agentVersion: MARKET_INTAKE_AGENT_VERSION,
            context: { ...context, requestId: `req-mi-real-${i + 1}` },
            input: {
              mode: 'market',
              confirmedProductBrief: brief,
              currentDraft: draft,
              recentConversation: [],
              latestUserMessage: turns[i],
              locale: 'zh-CN',
              noDataAllowed: true,
            },
          },
          60_000,
        );
        latencies.push(Date.now() - started);
        usages.push({
          input: result.usage?.inputTokens ?? null,
          output: result.usage?.outputTokens ?? null,
          total: result.usage?.totalTokens ?? null,
        });
        providerRequests += 1;
        void before;

        expect(result.status).toBe('COMPLETED');
        const output = result.output as {
          message: string;
          draftPatch: MarketIntakeDraft;
          suggestions: unknown[];
          missingAreas: string[];
          readyForConfirmation: boolean;
        };
        expect(typeof output.message).toBe('string');
        expect(output.message.length).toBeGreaterThan(0);
        expect(JSON.stringify(output)).not.toMatch(
          /市场规模|增长率|爆款播放量|playCount|likeCount|executiveSummary|marketState|MarketInsight/,
        );
        expect(JSON.stringify(output)).not.toMatch(/当前抖音最热门/);
        draft = mergeMarketIntakeDraft(draft, output.draftPatch ?? {});
        if (i === 0) {
          expect(draft.keywords?.length ?? 0).toBeGreaterThan(0);
        }
        if (i === 1) {
          expect(output.draftPatch.competitorAccounts ?? []).toEqual([]);
        }
        if (i === 2) {
          expect(output.suggestions.length).toBeGreaterThan(0);
        }
      }

      expect(draft.competitorAccounts?.some((item) => item.displayName.includes('美业增长'))).toBe(true);

      // eslint-disable-next-line no-console
      console.log(
        'MARKET_INTAKE_REAL_METRICS',
        JSON.stringify({
          turns: turns.length,
          providerRequests,
          latencies,
          usages,
        }),
      );
    },
    180_000,
  );
});
