import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { buildAgentContext } from './agent.context.js';
import { AgentEngine } from './agent.engine.js';
import { AgentError } from './agent.errors.js';
import { AgentRegistry } from './agent.registry.js';
import { toPublicAgentRun } from './agent.run-mapper.js';
import type { AgentDefinition, AgentRunPublic } from './agent.types.js';
import { parseEchoInput } from './definitions/system-echo.agent.js';
import { ECHO_AGENT_ID } from './agent.types.js';

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly engine: AgentEngine,
    private readonly registry: AgentRegistry,
  ) {}

  listAgents(): AgentDefinition[] {
    return this.engine.listDefinitions();
  }

  async getRun(auth: AuthContext, id: string, workspaceHint?: string): Promise<AgentRunPublic> {
    if (!isUuid(id)) {
      throw new AgentError(ErrorCode.AGENT_RUN_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const run = await this.prisma.agentRun.findFirst({
      where: {
        id,
        tenantId: auth.tenantId,
        workspaceId,
      },
    });
    if (!run) {
      throw new AgentError(ErrorCode.AGENT_RUN_NOT_FOUND);
    }
    return toPublicAgentRun(run);
  }

  async execute(
    auth: AuthContext,
    input: { agentId: string; agentVersion?: string; projectId: string; input: unknown },
    meta: { requestId: string; locale?: string; workspaceHint?: string },
  ): Promise<AgentRunPublic> {
    const workspaceId = resolveWorkspaceId(auth, meta.workspaceHint);
    const project = await this.requireProject(auth.tenantId, workspaceId, input.projectId);
    const definition = this.registry.get(input.agentId, input.agentVersion);
    const normalized = this.normalizeInput(definition.id, input.input);

    const context = buildAgentContext({
      auth: { ...auth, workspaceId },
      projectId: project.id,
      requestId: meta.requestId,
      locale: meta.locale,
    });

    return this.engine.execute({
      definition,
      context,
      input: normalized,
    });
  }

  private async requireProject(tenantId: string, workspaceId: string, projectId: string) {
    if (!isUuid(projectId)) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        tenantId,
        workspaceId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!project) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    return project;
  }

  private normalizeInput(agentId: string, input: unknown): unknown {
    if (agentId === ECHO_AGENT_ID) {
      const parsed = parseEchoInput(input);
      if (!parsed) {
        throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
      }
      return parsed;
    }
    return input;
  }
}
