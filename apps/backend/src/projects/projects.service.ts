import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { UsageMeteringService } from '../usage/usage-metering.service.js';

const publicSelect = {
  id: true,
  tenantId: true,
  workspaceId: true,
  name: true,
  industry: true,
  platform: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly metering: UsageMeteringService,
  ) {}

  list(auth: AuthContext, workspaceHint?: string) {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    return this.prisma.project.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: publicSelect,
    });
  }

  async getById(auth: AuthContext, id: string, workspaceHint?: string) {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const project = await this.prisma.project.findFirst({
      where: {
        id,
        tenantId: auth.tenantId,
        workspaceId,
        deletedAt: null,
      },
      select: publicSelect,
    });
    if (!project) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    return project;
  }

  async getUsageSummary(auth: AuthContext, id: string, workspaceHint?: string) {
    await this.getById(auth, id, workspaceHint);
    const summary = await this.metering.getProjectUsageSummary(auth.tenantId, id);
    return this.metering.toPublicSummary(summary);
  }

  create(
    auth: AuthContext,
    input: { name: string; industry?: string; platform?: string; description?: string },
    workspaceHint?: string,
  ) {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    return this.prisma.project.create({
      data: {
        tenantId: auth.tenantId,
        workspaceId,
        name: input.name,
        industry: input.industry,
        platform: input.platform,
        description: input.description,
      },
      select: publicSelect,
    });
  }

  async update(
    auth: AuthContext,
    id: string,
    input: { name?: string; industry?: string; platform?: string; description?: string },
    workspaceHint?: string,
  ) {
    const current = await this.getById(auth, id, workspaceHint);
    return this.prisma.project.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: {
        name: input.name,
        industry: input.industry,
        platform: input.platform,
        description: input.description,
      },
      select: publicSelect,
    });
  }

  async remove(auth: AuthContext, id: string, workspaceHint?: string) {
    const current = await this.getById(auth, id, workspaceHint);
    await this.prisma.project.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }
}
