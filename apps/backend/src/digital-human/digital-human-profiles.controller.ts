import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { CreateDigitalHumanProfileDto } from './dto/create-digital-human-profile.dto.js';
import { PatchDigitalHumanProfileDto } from './dto/patch-digital-human-profile.dto.js';
import { DigitalHumanProfilesService } from './digital-human-profiles.service.js';

@Controller('digital-human-profiles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DigitalHumanProfilesController {
  constructor(private readonly profiles: DigitalHumanProfilesService) {}

  @Get()
  list(@CurrentUser() auth: AuthContext, @Headers('x-workspace-id') workspaceHint?: string) {
    return this.profiles.list(auth, workspaceHint);
  }

  @Get(':id')
  get(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.profiles.get(auth, id, workspaceHint);
  }

  @Post()
  @RequirePermission(Permission.PROJECT_UPDATE)
  create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateDigitalHumanProfileDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.profiles.create(auth, dto, workspaceHint);
  }

  @Patch(':id')
  @RequirePermission(Permission.PROJECT_UPDATE)
  patch(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: PatchDigitalHumanProfileDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.profiles.patch(auth, id, dto, workspaceHint);
  }

  @Delete(':id')
  @RequirePermission(Permission.PROJECT_UPDATE)
  remove(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.profiles.remove(auth, id, workspaceHint);
  }
}
