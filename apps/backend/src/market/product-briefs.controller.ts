import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { CreateProductBriefDto } from './dto/create-product-brief.dto.js';
import { ProductBriefsService } from './product-briefs.service.js';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductBriefsController {
  constructor(private readonly briefs: ProductBriefsService) {}

  @Get('projects/:projectId/product-briefs/current')
  current(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.briefs.current(auth, projectId, workspaceHint);
  }

  @Get('projects/:projectId/product-briefs')
  list(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.briefs.list(auth, projectId, workspaceHint);
  }

  @Post('projects/:projectId/product-briefs')
  @RequirePermission(Permission.PROJECT_UPDATE)
  create(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProductBriefDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.briefs.create(auth, projectId, dto, workspaceHint);
  }

  @Get('product-briefs/:id')
  getById(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.briefs.getById(auth, id, workspaceHint);
  }
}
