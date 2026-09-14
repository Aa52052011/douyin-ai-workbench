import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { CreateVoiceProfileDto } from './dto/create-voice-profile.dto.js';
import { PatchVoiceProfileDto } from './dto/patch-voice-profile.dto.js';
import { VoiceProfilesService } from './voice-profiles.service.js';

@Controller('voice-profiles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VoiceProfilesController {
  constructor(private readonly voices: VoiceProfilesService) {}

  @Get('system')
  listSystem() {
    return this.voices.listSystemVoices();
  }

  @Get()
  list(@CurrentUser() auth: AuthContext, @Headers('x-workspace-id') workspaceHint?: string) {
    return this.voices.list(auth, workspaceHint);
  }

  @Get(':id')
  get(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.voices.get(auth, id, workspaceHint);
  }

  @Post()
  @RequirePermission(Permission.PROJECT_UPDATE)
  create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateVoiceProfileDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.voices.create(auth, dto, workspaceHint);
  }

  @Patch(':id')
  @RequirePermission(Permission.PROJECT_UPDATE)
  patch(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: PatchVoiceProfileDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.voices.patch(auth, id, dto, workspaceHint);
  }

  @Delete(':id')
  @RequirePermission(Permission.PROJECT_UPDATE)
  remove(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.voices.remove(auth, id, workspaceHint);
  }
}
