import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { AccountMemoryService } from '../memory/account-memory.service.js';
import type { ProductBriefPayload } from './market.types.js';
import { parseProductBriefPayload } from './product-brief.payload.js';
import { toPublicProductBrief, type ProductBriefPublic } from './product-briefs.mapper.js';

@Injectable()
export class ProductBriefsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly memory: AccountMemoryService,
  ) {}

  async list(auth: AuthContext, projectId: string, workspaceHint?: string): Promise<ProductBriefPublic[]> {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const rows = await this.prisma.productBrief.findMany({
      where: { tenantId: auth.tenantId, workspaceId: project.workspaceId, projectId: project.id },
      orderBy: { version: 'desc' },
    });
    return rows.map(toPublicProductBrief);
  }

  async current(auth: AuthContext, projectId: string, workspaceHint?: string): Promise<ProductBriefPublic> {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const row = await this.prisma.productBrief.findFirst({
      where: { tenantId: auth.tenantId, workspaceId: project.workspaceId, projectId: project.id },
      orderBy: { version: 'desc' },
    });
    if (!row) {
      throw new AppError(ErrorCode.PRODUCT_BRIEF_NOT_FOUND);
    }
    return toPublicProductBrief(row);
  }

  async getById(auth: AuthContext, id: string, workspaceHint?: string): Promise<ProductBriefPublic> {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.PRODUCT_BRIEF_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const row = await this.prisma.productBrief.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId },
    });
    if (!row) {
      throw new AppError(ErrorCode.PRODUCT_BRIEF_NOT_FOUND);
    }
    return toPublicProductBrief(row);
  }

  async create(
    auth: AuthContext,
    projectId: string,
    input: unknown,
    workspaceHint?: string,
  ): Promise<ProductBriefPublic> {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const payload = parseProductBriefPayload(input);
    const created = await this.createVersion(auth.tenantId, project.workspaceId, project.id, payload);
    void this.memory.refreshMemorySafe(auth, project.id, 'PRODUCT_BRIEF_CONFIRMED', workspaceHint);
    return created;
  }

  async requireCurrentPayload(
    auth: AuthContext,
    projectId: string,
    productBriefId: string | undefined,
    workspaceHint?: string,
  ): Promise<{ id: string; version: number; payload: ProductBriefPayload }> {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    if (productBriefId) {
      if (!isUuid(productBriefId)) {
        throw new AppError(ErrorCode.PRODUCT_BRIEF_NOT_FOUND);
      }
      const row = await this.prisma.productBrief.findFirst({
        where: {
          id: productBriefId,
          tenantId: auth.tenantId,
          workspaceId: project.workspaceId,
          projectId: project.id,
        },
      });
      if (!row) {
        throw new AppError(ErrorCode.PRODUCT_BRIEF_NOT_FOUND);
      }
      return { id: row.id, version: row.version, payload: row.payload as ProductBriefPayload };
    }
    const current = await this.prisma.productBrief.findFirst({
      where: { tenantId: auth.tenantId, workspaceId: project.workspaceId, projectId: project.id },
      orderBy: { version: 'desc' },
    });
    if (!current) {
      throw new AppError(ErrorCode.PRODUCT_BRIEF_REQUIRED);
    }
    return { id: current.id, version: current.version, payload: current.payload as ProductBriefPayload };
  }

  private async createVersion(
    tenantId: string,
    workspaceId: string,
    projectId: string,
    payload: ProductBriefPayload,
  ): Promise<ProductBriefPublic> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const created = await this.prisma.$transaction(
          async (tx) => {
            const last = await tx.productBrief.findFirst({
              where: { tenantId, projectId },
              orderBy: { version: 'desc' },
              select: { version: true },
            });
            return tx.productBrief.create({
              data: {
                tenantId,
                workspaceId,
                projectId,
                version: (last?.version ?? 0) + 1,
                payload: payload as Prisma.InputJsonValue,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return toPublicProductBrief(created);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2034') &&
          attempt < 4
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Unable to allocate product brief version');
  }

  private async requireProject(auth: AuthContext, projectId: string, workspaceHint?: string) {
    if (!isUuid(projectId)) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: auth.tenantId, workspaceId, deletedAt: null },
      select: { id: true, workspaceId: true },
    });
    if (!project) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    return project;
  }
}
