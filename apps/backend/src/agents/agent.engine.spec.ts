import { randomUUID } from 'node:crypto';
import { AgentRunStatus, type PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors/app-error.js';
import { AgentEngine } from './agent.engine.js';
import { AgentError } from './agent.errors.js';
import { AgentRegistry } from './agent.registry.js';
import type { AgentContext, InternalAgentResponse } from './agent.types.js';
import type { AgentExecutor } from './executors/agent.executor.js';

type Row = Record<string, unknown>;

function mockPrisma() {
  const rows: Row[] = [];
  const prisma = {
    agentRun: {
      create: async ({ data }: { data: Row }) => {
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
        data: Row;
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

function context(): AgentContext {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    requestId: 'req-engine',
    locale: 'zh-CN',
  };
}

describe('AgentEngine', () => {
  it('creates a run and marks it completed', async () => {
    const { prisma, rows } = mockPrisma();
    const executor: AgentExecutor = {
      async execute(): Promise<InternalAgentResponse> {
        return {
          status: 'COMPLETED',
          output: { message: 'hello', agent: 'system.echo', version: 'v1' },
          usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4, estimatedCost: 0 },
        };
      },
    };
    const engine = new AgentEngine(prisma, new AgentRegistry(), executor);
    const definition = engine.getDefinition('system.echo', 'v1');
    const run = await engine.execute({
      definition,
      context: context(),
      input: { message: 'hello' },
    });
    expect(run.status).toBe(AgentRunStatus.COMPLETED);
    expect(run.requestId).toBe('req-engine');
    expect(run.agentVersion).toBe('v1');
    expect(run.output).toEqual({ message: 'hello', agent: 'system.echo', version: 'v1' });
    expect(rows[0]?.status).toBe(AgentRunStatus.COMPLETED);
  });

  it('persists a failed run and does not leak raw errors', async () => {
    const { prisma, rows } = mockPrisma();
    const executor: AgentExecutor = {
      async execute() {
        throw new Error('sk-openai-secret-should-not-leak');
      },
    };
    const engine = new AgentEngine(prisma, new AgentRegistry(), executor);
    await expect(
      engine.execute({
        definition: engine.getDefinition('system.echo'),
        context: context(),
        input: { message: 'hello' },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.AGENT_EXECUTION_FAILED });
    expect(rows[0]?.status).toBe(AgentRunStatus.FAILED);
    expect(JSON.stringify(rows[0]?.error)).not.toContain('sk-openai');
    expect((rows[0]?.error as { code: string }).code).toBe(ErrorCode.AGENT_EXECUTION_FAILED);
  });

  it('reserves enqueue() for future async execution', () => {
    const { prisma } = mockPrisma();
    const engine = new AgentEngine(prisma, new AgentRegistry(), {
      execute: async () => ({ status: 'COMPLETED' }),
    });
    expect(() =>
      engine.enqueue({
        definition: engine.getDefinition('system.echo'),
        context: context(),
        input: { message: 'hello' },
      }),
    ).toThrow(AgentError);
  });
});
