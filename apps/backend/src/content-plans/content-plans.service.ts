import { Injectable } from '@nestjs/common';
import { ContentPlanStatus, Prisma, PrismaClient } from '@prisma/client';
import { AgentsService } from '../agents/agent.service.js';
import {
  CONTENT_PLANNING_AGENT_ID,
  CONTENT_PLANNING_AGENT_VERSION,
} from '../agents/agent.types.js';
import type { ContentPlanOutput } from '../agents/definitions/content-planning.types.js';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { toPublicContentPlan, type ContentPlanPublic } from './content-plans.mapper.js';

@Injectable()
export class ContentPlansService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly agents: AgentsService,
  ) {}

  async list(
    auth: AuthContext,
    query: { projectId: string },
    workspaceHint?: string,
  ): Promise<ContentPlanPublic[]> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    await this.requireProject(auth.tenantId, workspaceId, query.projectId);
    const plans = await this.prisma.contentPlan.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId: query.projectId,
        deletedAt: null,
      },
      orderBy: { version: 'desc' },
    });
    return plans.map(toPublicContentPlan);
  }

  async getById(auth: AuthContext, id: string, workspaceHint?: string): Promise<ContentPlanPublic> {
    return toPublicContentPlan(await this.requirePlan(auth, id, workspaceHint));
  }

  async create(
    auth: AuthContext,
    input: {
      projectId: string;
      planningDays: number;
      postsPerDay: number;
      platform: string;
      contentStyle?: string;
      additionalRequirements?: string;
      positioning?: Record<string, unknown>;
      positioningRunId?: string;
      strategyId?: string;
    },
    meta: { requestId: string; locale?: string; workspaceHint?: string },
  ): Promise<ContentPlanPublic> {
    const workspaceId = resolveWorkspaceId(auth, meta.workspaceHint);
    const project = await this.requireProject(auth.tenantId, workspaceId, input.projectId);
    if (!input.positioning && !input.positioningRunId) {
      throw new AppError(ErrorCode.CONTENT_PLAN_POSITIONING_REQUIRED);
    }

    const run = await this.agents.execute(
      auth,
      {
        agentId: CONTENT_PLANNING_AGENT_ID,
        agentVersion: CONTENT_PLANNING_AGENT_VERSION,
        projectId: project.id,
        input: {
          positioning: input.positioning,
          positioningRunId: input.positioningRunId,
          planningDays: input.planningDays,
          postsPerDay: input.postsPerDay,
          platform: input.platform,
          contentStyle: input.contentStyle,
          additionalRequirements: input.additionalRequirements,
          strategyId: input.strategyId,
        },
      },
      meta,
    );

    const output = run.output as ContentPlanOutput;
    const snapshot = extractPositioningSnapshot(run.input);
    const version = await this.nextVersion(auth.tenantId, project.id);

    const created = await this.prisma.contentPlan.create({
      data: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId: project.id,
        title: output.title,
        description: output.summary,
        status: ContentPlanStatus.DRAFT,
        version,
        payload: output as unknown as Prisma.InputJsonValue,
        positioningSnapshot: snapshot as Prisma.InputJsonValue,
        sourceAgentRunId: run.id,
        planningDays: output.planningDays,
        postsPerDay: output.postsPerDay,
        platform: output.platform,
        usedTrendData: output.usedTrendData,
      },
    });
    return toPublicContentPlan(created);
  }

  async update(
    auth: AuthContext,
    id: string,
    input: { title?: string; description?: string; payload?: Record<string, unknown> },
    workspaceHint?: string,
  ): Promise<ContentPlanPublic> {
    const current = await this.requirePlan(auth, id, workspaceHint);
    if (current.status !== ContentPlanStatus.DRAFT) {
      throw new AppError(ErrorCode.CONTENT_PLAN_CONFLICT);
    }
    const updated = await this.prisma.contentPlan.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: {
        title: input.title,
        description: input.description,
        payload: input.payload as Prisma.InputJsonValue | undefined,
      },
    });
    return toPublicContentPlan(updated);
  }

  async confirm(auth: AuthContext, id: string, workspaceHint?: string): Promise<ContentPlanPublic> {
    const current = await this.requirePlan(auth, id, workspaceHint);
    if (current.status !== ContentPlanStatus.DRAFT) {
      throw new AppError(ErrorCode.CONTENT_PLAN_CONFLICT);
    }
    const updated = await this.prisma.contentPlan.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: { status: ContentPlanStatus.CONFIRMED },
    });
    return toPublicContentPlan(updated);
  }

  async archive(auth: AuthContext, id: string, workspaceHint?: string): Promise<ContentPlanPublic> {
    const current = await this.requirePlan(auth, id, workspaceHint);
    if (current.status !== ContentPlanStatus.CONFIRMED) {
      throw new AppError(ErrorCode.CONTENT_PLAN_CONFLICT);
    }
    const updated = await this.prisma.contentPlan.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: { status: ContentPlanStatus.ARCHIVED },
    });
    return toPublicContentPlan(updated);
  }

  private async requirePlan(auth: AuthContext, id: string, workspaceHint?: string) {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.CONTENT_PLAN_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const plan = await this.prisma.contentPlan.findFirst({
      where: {
        id,
        tenantId: auth.tenantId,
        workspaceId,
        deletedAt: null,
      },
    });
    if (!plan) {
      throw new AppError(ErrorCode.CONTENT_PLAN_NOT_FOUND);
    }
    return plan;
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

  private async nextVersion(tenantId: string, projectId: string): Promise<number> {
    const last = await this.prisma.contentPlan.findFirst({
      where: { tenantId, projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (last?.version ?? 0) + 1;
  }
}

function extractPositioningSnapshot(input: unknown): Prisma.InputJsonValue {
  if (typeof input === 'object' && input !== null && 'positioning' in input) {
    return (input as { positioning: Prisma.InputJsonValue }).positioning;
  }
  return {};
}
