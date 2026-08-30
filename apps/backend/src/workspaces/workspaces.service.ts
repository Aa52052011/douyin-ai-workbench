import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import {
  isDefaultWorkspaceSlug,
  workspaceSlugFromName,
} from '../authz/workspace-context.js';

const publicSelect = {
  id: true,
  tenantId: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaClient) {}

  list(auth: AuthContext) {
    return this.prisma.workspace.findMany({
      where: { tenantId: auth.tenantId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: publicSelect,
    });
  }

  async getById(auth: AuthContext, id: string) {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.WORKSPACE_NOT_FOUND);
    }
    const workspace = await this.prisma.workspace.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: publicSelect,
    });
    if (!workspace) {
      throw new AppError(ErrorCode.WORKSPACE_NOT_FOUND);
    }
    return workspace;
  }

  create(auth: AuthContext, name: string) {
    return this.prisma.workspace.create({
      data: {
        tenantId: auth.tenantId,
        name,
        slug: workspaceSlugFromName(name),
      },
      select: publicSelect,
    });
  }

  async update(auth: AuthContext, id: string, name: string) {
    await this.getById(auth, id);
    return this.prisma.workspace.update({
      where: { id_tenantId: { id, tenantId: auth.tenantId } },
      data: { name },
      select: publicSelect,
    });
  }

  async remove(auth: AuthContext, id: string) {
    const workspace = await this.getById(auth, id);
    if (isDefaultWorkspaceSlug(workspace.slug)) {
      throw new AppError(ErrorCode.WORKSPACE_DEFAULT_CANNOT_DELETE);
    }
    const projectCount = await this.prisma.project.count({
      where: {
        tenantId: auth.tenantId,
        workspaceId: workspace.id,
        deletedAt: null,
      },
    });
    if (projectCount > 0) {
      throw new AppError(ErrorCode.WORKSPACE_NOT_EMPTY);
    }
    await this.prisma.workspace.update({
      where: { id_tenantId: { id, tenantId: auth.tenantId } },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }
}
