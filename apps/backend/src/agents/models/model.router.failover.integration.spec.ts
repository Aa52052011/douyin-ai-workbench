import { randomUUID } from 'node:crypto';
import { AgentRunStatus, type PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentEngine } from '../agent.engine.js';
import { AgentRegistry } from '../agent.registry.js';
import type { AgentContext } from '../agent.types.js';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import { InProcessAgentExecutor } from '../executors/in-process.executor.js';
import { PromptRegistry } from '../prompts/prompt.registry.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import type { UsageMeteringService } from '../../usage/usage-metering.service.js';
import { MockModelProvider } from './mock.provider.js';
import { ModelRouter } from './model.router.js';
import type { ModelGenerateRequest, ModelGenerateResult } from './model.types.js';
import type { RealModelProvider } from './real.provider.js';

const PRIMARY = 'openai/gpt-5.5';
const BACKUP = 'anthropic/claude-haiku-4.5';

function mockAgentPrisma() {
  const rows: Array<Record<string, unknown>> = [];
  const prisma = {
    agentRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: randomUUID(),
          output: null,
          error: null,
          startedAt: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          estimatedCost: null,
          ...data,
        };
        rows.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id_tenantId: { id: string; tenantId: string } };
        data: Record<string, unknown>;
      }) => {
        const row = rows.find((item) => item.id === where.id_tenantId.id);
        if (!row) {
          throw new Error('missing run');
        }
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
  };
  return { prisma: prisma as unknown as PrismaClient, rows };
}

describe('ModelRouter failover integration', () => {
  afterEach(() => {
    delete process.env.MODEL_FALLBACK_1_NAME;
    delete process.env.MODEL_CIRCUIT_FAILURE_THRESHOLD;
    delete process.env.MODEL_CIRCUIT_COOLDOWN_MS;
  });

  it('completes AgentRun via Backup after Primary 503 without a real Router call', async () => {
    process.env.MODEL_NAME = PRIMARY;
    process.env.MODEL_FALLBACK_1_NAME = BACKUP;
    process.env.MODEL_CIRCUIT_FAILURE_THRESHOLD = '2';
    process.env.MODEL_CIRCUIT_COOLDOWN_MS = '900000';

    const starts: Array<{ model?: string; metadata?: Record<string, unknown> }> = [];
    const statuses: Array<'SUCCEEDED' | 'FAILED'> = [];
    const metering = {
      startUsage: vi.fn(async (input: { idempotencyKey: string; model?: string; metadata?: Record<string, unknown> }) => {
        starts.push(input);
        return { id: input.idempotencyKey, reused: false };
      }),
      completeUsage: vi.fn(async () => {
        statuses.push('SUCCEEDED');
      }),
      failUsage: vi.fn(async () => {
        statuses.push('FAILED');
      }),
    } as unknown as UsageMeteringService;

    const real = {
      id: 'real',
      generate: vi.fn(async (request: ModelGenerateRequest): Promise<ModelGenerateResult> => {
        if (request.model === PRIMARY) {
          throw new AgentError(ErrorCode.MODEL_REQUEST_FAILED, 'Model request failed (HTTP 503)', true, {
            httpStatus: 503,
          });
        }
        return {
          text: 'OK',
          provider: 'real',
          usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3, estimatedCost: null },
        };
      }),
    } as unknown as RealModelProvider;

    const router = new ModelRouter(new MockModelProvider(), real, metering);
    router.defaultProviderId = 'real';
    const { prisma, rows } = mockAgentPrisma();
    const executor = new InProcessAgentExecutor(
      new AgentRegistry(),
      router,
      new ToolRegistry(),
      new PromptRegistry(),
    );
    const engine = new AgentEngine(prisma, new AgentRegistry(), executor);
    const context: AgentContext = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      requestId: 'req-failover',
      locale: 'zh-CN',
    };
    const run = await engine.execute({
      definition: engine.getDefinition('system.echo', 'v1'),
      context,
      input: { message: 'hello' },
    });

    expect(run.status).toBe(AgentRunStatus.COMPLETED);
    expect(JSON.stringify(rows[0]?.output)).not.toMatch(/fallbackUsed|OPEN_CIRCUIT|claude|gpt-5\.5/i);
    expect(starts).toHaveLength(2);
    expect(starts[0]?.model).toBe(PRIMARY);
    expect(starts[1]?.model).toBe(BACKUP);
    expect(statuses).toEqual(['FAILED', 'SUCCEEDED']);
    expect((starts[0]?.metadata as { attempt: string }).attempt).not.toBe(
      (starts[1]?.metadata as { attempt: string }).attempt,
    );
    expect(real.generate).toHaveBeenCalledTimes(2);
  });
});
