import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @CurrentUser() auth: AuthContext,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.projects.list(auth, workspaceHint);
  }

  @Get(':id')
  getById(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.projects.getById(auth, id, workspaceHint);
  }

  @Post()
  @RequirePermission(Permission.PROJECT_CREATE)
  create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateProjectDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.projects.create(auth, dto, workspaceHint);
  }

  @Patch(':id')
  @RequirePermission(Permission.PROJECT_UPDATE)
  update(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.projects.update(auth, id, dto, workspaceHint);
  }

  @Delete(':id')
  @RequirePermission(Permission.PROJECT_DELETE)
  remove(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.projects.remove(auth, id, workspaceHint);
  }
}
