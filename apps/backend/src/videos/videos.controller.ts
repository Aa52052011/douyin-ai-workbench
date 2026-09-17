import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { resolveRequestId } from '../common/request-id.js';
import { CreateVideoDto } from './dto/create-video.dto.js';
import { ListVideosQueryDto } from './dto/list-videos.dto.js';
import { RebuildProductionPlanDto } from './dto/rebuild-production-plan.dto.js';
import { VideosService } from './videos.service.js';

@Controller('videos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get()
  list(
    @CurrentUser() auth: AuthContext,
    @Query() query: ListVideosQueryDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.videos.list(auth, query, workspaceHint);
  }

  @Get(':id/usage-summary')
  getUsageSummary(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.videos.getUsageSummary(auth, id, workspaceHint);
  }

  @Post()
  @RequirePermission(Permission.AGENT_EXECUTE)
  create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateVideoDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-request-id') requestIdHeader?: string,
    @Headers('x-idempotency-key') idempotencyKey?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    const requestId = resolveRequestId(idempotencyKey ?? requestIdHeader);
    res.setHeader('x-request-id', requestId);
    return this.videos.create(auth, dto, { requestId, workspaceHint });
  }

  @Get(':id/export')
  async export(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Res() res: Response,
    @Headers('x-workspace-id') workspaceHint?: string,
    @Query('variant') variant?: string,
  ) {
    const file = await this.videos.export(auth, id, workspaceHint, variant);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.body.length));
    res.setHeader('Content-Disposition', file.contentDisposition);
    res.send(file.body);
  }

  @Post(':id/final-acceptance')
  @HttpCode(200)
  @RequirePermission(Permission.PROJECT_UPDATE)
  acceptFinal(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.videos.acceptFinal(auth, id, workspaceHint);
  }

  @Get(':id')
  getById(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.videos.getById(auth, id, workspaceHint);
  }

  @Get(':id/quality')
  getQuality(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.videos.getQuality(auth, id, workspaceHint);
  }

  @Get(':id/timeline')
  getTimeline(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.videos.getTimeline(auth, id, workspaceHint);
  }

  @Get(':id/production-plan')
  getProductionPlan(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.videos.getProductionPlan(auth, id, workspaceHint);
  }

  @Post(':id/production-plan')
  @RequirePermission(Permission.AGENT_EXECUTE)
  rebuildProductionPlan(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: RebuildProductionPlanDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.videos.rebuildProductionPlan(auth, id, dto, workspaceHint);
  }

  @Post(':id/retry')
  @HttpCode(200)
  @RequirePermission(Permission.AGENT_EXECUTE)
  retry(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-request-id') requestIdHeader?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    const requestId = resolveRequestId(requestIdHeader);
    res.setHeader('x-request-id', requestId);
    return this.videos.retry(auth, id, { requestId, workspaceHint });
  }
}
