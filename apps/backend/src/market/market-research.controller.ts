import { Body, Controller, Get, Headers, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { resolveRequestId } from '../common/request-id.js';
import { CreateMarketInsightDto } from './dto/create-market-insight.dto.js';
import { PreviewMarketResearchDto } from './dto/preview-market-research.dto.js';
import { MarketEvidenceService } from './market-evidence.service.js';
import { MarketInsightsService } from './market-insights.service.js';
import { MarketResearchService } from './market-research.service.js';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MarketResearchController {
  constructor(
    private readonly research: MarketResearchService,
    private readonly evidence: MarketEvidenceService,
    private readonly insights: MarketInsightsService,
  ) {}

  @Post('projects/:projectId/market-research/preview')
  @RequirePermission(Permission.PROJECT_UPDATE)
  preview(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Body() dto: PreviewMarketResearchDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.research.preview(auth, projectId, dto, workspaceHint);
  }

  @Post('projects/:projectId/market-research/confirm')
  @RequirePermission(Permission.PROJECT_UPDATE)
  confirm(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Body() dto: PreviewMarketResearchDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.research.confirm(auth, projectId, dto, workspaceHint);
  }

  @Get('projects/:projectId/market-research')
  list(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.research.list(auth, projectId, workspaceHint);
  }

  @Get('market-research/:id')
  getById(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.research.getById(auth, id, workspaceHint);
  }

  @Get('market-research/:id/evidence')
  getEvidence(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.evidence.getForResearch(auth, id, workspaceHint);
  }

  @Get('market-research/:id/insights')
  listInsights(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.insights.list(auth, id, workspaceHint);
  }

  @Get('market-research/:id/insights/latest')
  getLatestInsight(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.insights.getLatest(auth, id, workspaceHint);
  }

  @Post('market-research/:id/insights')
  @RequirePermission(Permission.AGENT_EXECUTE)
  createInsight(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateMarketInsightDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-request-id') requestIdHeader?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
    @Headers('accept-language') locale?: string,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const requestId = resolveRequestId(requestIdHeader);
    res.setHeader('x-request-id', requestId);
    return this.insights.create(auth, id, dto, {
      requestId,
      locale,
      workspaceHint,
      idempotencyKey: idempotencyKey?.trim() || undefined,
    });
  }
}
