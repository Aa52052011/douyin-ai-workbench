import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { Permission } from '../../authz/permissions.js';
import { PermissionsGuard } from '../../authz/permissions.guard.js';
import { RequirePermission } from '../../authz/require-permission.decorator.js';
import { CropApprovalPersistenceService } from './approval-persistence.js';

@Controller('production-v2/crop-execution')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CropExecutionRunController {
  constructor(private readonly persist: CropApprovalPersistenceService) {}

  @Get(':runId')
  @RequirePermission(Permission.PROJECT_UPDATE)
  get(@CurrentUser() auth: AuthContext, @Param('runId') runId: string) {
    const run = this.persist.store.getRun(runId, {
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      projectId: 'unbound',
      userId: auth.userId,
    });
    if (!run) return { ok: false, code: 'RUN_NOT_FOUND_OR_FORBIDDEN' };
    return { ok: true, run, cropExecutionCompleted: run.status === 'COMPLETED', videoFinalApproved: false, publishApproved: false };
  }
}
