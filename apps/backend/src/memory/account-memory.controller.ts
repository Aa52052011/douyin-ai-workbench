import { Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { AccountMemoryService } from './account-memory.service.js';

/**
 * Minimal internal/debug read API. Does not expose storageKey or secrets.
 * Not a user-facing memory editor.
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountMemoryController {
  constructor(private readonly memory: AccountMemoryService) {}

  @Get('projects/:projectId/memory')
  async getLatest(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    const row = await this.memory.getOrBootstrap(auth, projectId, workspaceHint);
    return {
      id: row.id,
      projectId: row.projectId,
      version: row.version,
      status: row.status,
      sourceWatermark: row.sourceWatermark,
      meta: row.payload.meta,
      core: row.payload.core,
      recent: row.payload.recent,
      patternCounts: {
        winning: row.payload.patterns.winningPatterns.length,
        losing: row.payload.patterns.losingPatterns.length,
        candidates: row.payload.patterns.candidateSignals.length,
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  @Get('projects/:projectId/memory/context')
  async getContext(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.memory.getMemoryContext(auth, projectId, { workspaceHint });
  }

  @Post('projects/:projectId/memory/refresh')
  @RequirePermission(Permission.PROJECT_UPDATE)
  refresh(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.memory.rebuildProjectMemory(auth, projectId, workspaceHint);
  }
}
