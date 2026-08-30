import { Inject, Injectable } from '@nestjs/common';
import { AgentRunStatus, Prisma, PrismaClient } from '@prisma/client';
import { ErrorCode } from '../common/errors/app-error.js';
import { AgentError, isRetryableError, toAgentError } from './agent.errors.js';
import { AgentRunLogger } from './agent.logger.js';
import { AgentRegistry } from './agent.registry.js';
import { toPublicAgentRun } from './agent.run-mapper.js';
import type {
  AgentContext,
  AgentDefinition,
  AgentRunPublic,
  InternalAgentRequest,
} from './agent.types.js';
import { AGENT_EXECUTOR, type AgentExecutor } from './executors/agent.executor.js';

export type ExecuteParams = {
  definition: AgentDefinition;
  context: AgentContext;
  input: unknown;
};

@Injectable()
export class AgentEngine {
  private readonly logger = new AgentRunLogger();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: AgentRegistry,
    @Inject(AGENT_EXECUTOR) private readonly executor: AgentExecutor,
  ) {}

  listDefinitions(): AgentDefinition[] {
    return this.registry.list();
  }

  getDefinition(id: string, version?: string): AgentDefinition {
    return this.registry.get(id, version);
  }

  async execute(params: ExecuteParams): Promise<AgentRunPublic> {
    const { definition, context, input } = params;
    const created = await this.prisma.agentRun.create({
      data: {
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId: definition.id,
        agentVersion: definition.version,
        status: AgentRunStatus.PENDING,
        input: input as Prisma.InputJsonValue,
        requestId: context.requestId,
      },
    });

    const startedAt = new Date();
    await this.prisma.agentRun.update({
      where: { id_tenantId: { id: created.id, tenantId: context.tenantId } },
      data: { status: AgentRunStatus.RUNNING, startedAt },
    });

    const request: InternalAgentRequest = {
      requestId: context.requestId,
      agentId: definition.id,
      agentVersion: definition.version,
      context,
      input,
    };

    try {
      const result = await this.executor.execute(request, definition.timeoutMs);
      if (result.status === 'FAILED') {
        throw new AgentError(
          ErrorCode.AGENT_EXECUTION_FAILED,
          result.error?.message,
          result.error?.retryable,
        );
      }
      const completedAt = new Date();
      const usage = result.usage;
      const updated = await this.prisma.agentRun.update({
        where: { id_tenantId: { id: created.id, tenantId: context.tenantId } },
        data: {
          status: AgentRunStatus.COMPLETED,
          output: (result.output ?? {}) as Prisma.InputJsonValue,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
          estimatedCost: usage ? new Prisma.Decimal(usage.estimatedCost) : undefined,
          completedAt,
        },
      });
      this.logger.log({
        requestId: context.requestId,
        agent: definition.id,
        version: definition.version,
        status: AgentRunStatus.COMPLETED,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        totalTokens: usage?.totalTokens,
      });
      return toPublicAgentRun(updated);
    } catch (error) {
      const agentError = toAgentError(error);
      const payload = agentError.getResponse() as { code: string; message: string };
      const completedAt = new Date();
      await this.prisma.agentRun.update({
        where: { id_tenantId: { id: created.id, tenantId: context.tenantId } },
        data: {
          status: AgentRunStatus.FAILED,
          error: {
            code: payload.code,
            message: payload.message,
            retryable: isRetryableError(agentError),
          },
          completedAt,
        },
      });
      this.logger.log({
        requestId: context.requestId,
        agent: definition.id,
        version: definition.version,
        status: AgentRunStatus.FAILED,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        errorCode: agentError.code,
      });
      throw agentError;
    }
  }

  /**
   * V2 预留。本阶段不接 Redis / BullMQ。
   */
  enqueue(_params: ExecuteParams): never {
    throw new AgentError(ErrorCode.AGENT_ASYNC_NOT_IMPLEMENTED);
  }
}
