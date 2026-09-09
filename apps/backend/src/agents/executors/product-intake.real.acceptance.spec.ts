import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AgentRegistry } from '../agent.registry.js';
import type { AgentContext } from '../agent.types.js';
import { PRODUCT_INTAKE_AGENT_ID, PRODUCT_INTAKE_AGENT_VERSION } from '../agent.types.js';
import { mergeProductIntakeDraft } from '../definitions/product-intake.patch.js';
import type { ProductIntakeDraft } from '../definitions/product-intake.types.js';
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
    // ignore missing file
  }
}

loadRootEnv();
process.env.NODE_ENV = 'development';
process.env.MODEL_PROVIDER = 'real';

const enabled =
  process.env.PRODUCT_INTAKE_REAL_ACCEPTANCE === 'true' && isRealModelConfigured();

describe.skipIf(!enabled)('product.intake real provider acceptance', () => {
  it(
    'completes up to 3 turns with stable schema and no positioning leakage',
    async () => {
      const context: AgentContext = {
        userId: 'u',
        tenantId: 't',
        workspaceId: 'w',
        projectId: 'p',
        requestId: 'req-pi-real',
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
        '我做一款帮助本地美容院自动生成短视频的工具，主要是老板没时间拍摄和剪辑。',
        '产品叫美拍助手，我主要想帮美容院通过抖音获得到店咨询。行业是美业。',
        '最大的卖点是输入活动内容就自动生成视频，不用自己剪辑。',
      ];

      let draft: ProductIntakeDraft = {};
      const latencies: number[] = [];
      const usages: Array<{ input: number | null; output: number | null; total: number | null }> = [];

      for (let i = 0; i < turns.length; i += 1) {
        const started = Date.now();
        const result = await executor.execute(
          {
            requestId: `req-pi-real-${i + 1}`,
            agentId: PRODUCT_INTAKE_AGENT_ID,
            agentVersion: PRODUCT_INTAKE_AGENT_VERSION,
            context: { ...context, requestId: `req-pi-real-${i + 1}` },
            input: {
              mode: 'product',
              currentDraft: draft,
              recentConversation: [],
              latestUserMessage: turns[i],
              locale: 'zh-CN',
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

        expect(result.status).toBe('COMPLETED');
        expect(result.output).toBeTruthy();
        const output = result.output as {
          message: string;
          draftPatch: ProductIntakeDraft;
          suggestions: unknown[];
          missingFields: string[];
          readyForConfirmation: boolean;
        };
        expect(typeof output.message).toBe('string');
        expect(output.message.length).toBeGreaterThan(0);
        expect(output.draftPatch).toBeTypeOf('object');
        expect(JSON.stringify(output)).not.toMatch(/accountPositioning|contentPillars|persona/);
        if (i === 0) {
          expect(output.draftPatch.productName).toBeUndefined();
        }
        draft = mergeProductIntakeDraft(draft, output.draftPatch ?? {});
      }

      expect(latencies.length).toBeLessThanOrEqual(4);
      // eslint-disable-next-line no-console
      console.log(
        'PRODUCT_INTAKE_REAL_METRICS',
        JSON.stringify({ callCount: latencies.length, latenciesMs: latencies, usages }),
      );
    },
    180_000,
  );
});
