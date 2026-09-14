import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRegistry } from '../agent.registry.js';
import type { AgentContext } from '../agent.types.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from '../definitions/account-positioning.fixture.js';
import { buildMockContentPlanOutput } from '../definitions/content-planning.fixture.js';
import { MockModelProvider } from '../models/mock.provider.js';
import { ModelRouter } from '../models/model.router.js';
import type { ModelGenerateRequest, ModelGenerateResult } from '../models/model.types.js';
import type { RealModelProvider } from '../models/real.provider.js';
import { PromptRegistry } from '../prompts/prompt.registry.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { runMeteringScope } from '../../usage/metering-context.js';
import type { UsageMeteringService } from '../../usage/usage-metering.service.js';
import { InProcessAgentExecutor } from './in-process.executor.js';

const PRIMARY = 'openai/gpt-5.5';
const BACKUP = 'anthropic/claude-haiku-4.5';

const context: AgentContext = {
  userId: 'u',
  tenantId: 't',
  workspaceId: 'w',
  projectId: 'p',
  requestId: 'req-cp-route',
  locale: 'zh-CN',
};

function okPlan(): ModelGenerateResult {
  return {
    text: JSON.stringify(buildMockContentPlanOutput({ planningDays: 7, postsPerDay: 1 })),
    provider: 'real',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: null },
  };
}

describe('content.planning route timeout integration', () => {
  beforeEach(() => {
    process.env.MODEL_NAME = PRIMARY;
    process.env.MODEL_FALLBACK_1_NAME = BACKUP;
    process.env.MODEL_CIRCUIT_FAILURE_THRESHOLD = '2';
    process.env.MODEL_ROUTE_TIMEOUT_MS = '40';
    process.env.MODEL_BACKUP_ROUTE_TIMEOUT_MS = '80';
  });

  afterEach(() => {
    delete process.env.MODEL_FALLBACK_1_NAME;
    delete process.env.MODEL_CIRCUIT_FAILURE_THRESHOLD;
    delete process.env.MODEL_ROUTE_TIMEOUT_MS;
    delete process.env.MODEL_BACKUP_ROUTE_TIMEOUT_MS;
  });

  it('fails over a hanging Primary to Backup and completes planning', async () => {
    const starts: Array<Record<string, unknown>> = [];
    const metering = {
      startUsage: vi.fn(async (input: { idempotencyKey: string; metadata?: Record<string, unknown>; model?: string }) => {
        starts.push(input);
        return { id: input.idempotencyKey, reused: false };
      }),
      completeUsage: vi.fn(async () => undefined),
      failUsage: vi.fn(async () => undefined),
    } as unknown as UsageMeteringService;
    const generate = vi.fn(async (request: ModelGenerateRequest) => {
      if (request.model === PRIMARY) {
        await new Promise((_resolve, reject) => {
          request.abortSignal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      }
      return okPlan();
    });
    const real = { id: 'real', generate } as unknown as RealModelProvider;
    const router = new ModelRouter(new MockModelProvider(), real, metering);
    router.defaultProviderId = 'real';
    const executor = new InProcessAgentExecutor(
      new AgentRegistry(),
      router,
      new ToolRegistry(),
      new PromptRegistry(),
    );
    const result = await runMeteringScope(
      { tenantId: 't', workspaceId: 'w', projectId: 'p', agentRunId: 'run-plan', stage: 'AGENT' },
      () =>
        executor.execute(
          {
            requestId: context.requestId,
            agentId: 'content.planning',
            agentVersion: 'v1',
            context,
            input: {
              positioning: MOCK_ACCOUNT_POSITIONING_OUTPUT,
              planningDays: 7,
              postsPerDay: 1,
              platform: 'douyin',
            },
          },
          250,
        ),
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.output?.topics).toHaveLength(7);
    expect(metering.failUsage).toHaveBeenCalledOnce();
    expect(metering.completeUsage).toHaveBeenCalledOnce();
    const attempts = starts.map((item) => (item.metadata as { attempt: string }).attempt);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).not.toBe(attempts[1]);
    expect(starts[0]?.model).toBe(PRIMARY);
    expect(starts[1]?.model).toBe(BACKUP);
  });
});
