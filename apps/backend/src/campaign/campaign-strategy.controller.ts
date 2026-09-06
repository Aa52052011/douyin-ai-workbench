import { Body, Controller, Get, Headers, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { resolveRequestId } from '../common/request-id.js';
import { requireIdempotencyKey } from '../publishing/idempotency-key.js';
import { CampaignStrategyService } from './campaign-strategy.service.js';
import { ComposeCampaignStrategyInputDto } from './dto/compose-campaign-strategy-input.dto.js';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CampaignStrategyController {
  constructor(private readonly strategies: CampaignStrategyService) {}

  @Post('projects/:projectId/campaign-strategy/compose-input')
  @RequirePermission(Permission.PROJECT_UPDATE)
  composeInput(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Body() dto: ComposeCampaignStrategyInputDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.strategies.composeInput(auth, projectId, dto, workspaceHint);
  }

  @Post('projects/:projectId/campaign-strategies/generate')
  @RequirePermission(Permission.AGENT_EXECUTE)
  generate(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Body() dto: ComposeCampaignStrategyInputDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-idempotency-key') idempotencyKey?: string,
    @Headers('x-request-id') requestIdHeader?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
    @Headers('accept-language') locale?: string,
  ) {
    const requestId = resolveRequestId(requestIdHeader);
    const key = requireIdempotencyKey(idempotencyKey);
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-idempotency-key', key);
    return this.strategies.generate(auth, projectId, dto, {
      requestId,
      locale,
      workspaceHint,
      idempotencyKey: key,
    });
  }

  @Get('projects/:projectId/campaign-strategies')
  list(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.strategies.list(auth, projectId, workspaceHint);
  }

  @Get('projects/:projectId/campaign-strategies/latest')
  latest(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.strategies.getLatest(auth, projectId, workspaceHint);
  }

  @Get('campaign-strategies/:id')
  getById(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.strategies.getById(auth, id, workspaceHint);
  }
}
