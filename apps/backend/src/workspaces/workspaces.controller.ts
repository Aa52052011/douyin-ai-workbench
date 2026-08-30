import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto.js';
import { WorkspacesService } from './workspaces.service.js';

@Controller('workspaces')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentUser() auth: AuthContext) {
    return this.workspaces.list(auth);
  }

  @Get(':id')
  getById(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return this.workspaces.getById(auth, id);
  }

  @Post()
  @RequirePermission(Permission.WORKSPACE_CREATE)
  create(@CurrentUser() auth: AuthContext, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(auth, dto.name);
  }

  @Patch(':id')
  @RequirePermission(Permission.WORKSPACE_UPDATE)
  update(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspaces.update(auth, id, dto.name);
  }

  @Delete(':id')
  @RequirePermission(Permission.WORKSPACE_DELETE)
  remove(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return this.workspaces.remove(auth, id);
  }
}
