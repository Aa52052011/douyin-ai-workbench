import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
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
import { ContentPlansService } from './content-plans.service.js';
import { CreateContentPlanDto } from './dto/create-content-plan.dto.js';
import { ListContentPlansQueryDto } from './dto/list-content-plans.dto.js';
import { UpdateContentPlanDto } from './dto/update-content-plan.dto.js';

@Controller('content-plans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContentPlansController {
  constructor(private readonly plans: ContentPlansService) {}

  @Get()
  list(
    @CurrentUser() auth: AuthContext,
    @Query() query: ListContentPlansQueryDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.plans.list(auth, query, workspaceHint);
  }

  @Get(':id')
  getById(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.plans.getById(auth, id, workspaceHint);
  }

  @Post()
  @RequirePermission(Permission.AGENT_EXECUTE)
  create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateContentPlanDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-request-id') requestIdHeader?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
    @Headers('accept-language') locale?: string,
  ) {
    const requestId = resolveRequestId(requestIdHeader);
    res.setHeader('x-request-id', requestId);
    return this.plans.create(auth, dto, { requestId, locale, workspaceHint });
  }

  @Patch(':id')
  @RequirePermission(Permission.PROJECT_UPDATE)
  update(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateContentPlanDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.plans.update(auth, id, dto, workspaceHint);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @RequirePermission(Permission.PROJECT_UPDATE)
  confirm(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.plans.confirm(auth, id, workspaceHint);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission(Permission.PROJECT_UPDATE)
  archive(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.plans.archive(auth, id, workspaceHint);
  }
}
