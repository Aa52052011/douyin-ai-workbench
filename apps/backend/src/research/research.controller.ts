import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { AutonomousResearchService } from './autonomous-research.service.js';
import { LearningService } from './learning.service.js';
import { ResearchCapabilityService } from './research-capability.service.js';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

class RequestResearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  platform?: string;

  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ResearchController {
  constructor(
    private readonly research: AutonomousResearchService,
    private readonly learning: LearningService,
    private readonly capability: ResearchCapabilityService,
  ) {}

  @Post('projects/:projectId/research')
  @RequirePermission(Permission.PROJECT_UPDATE)
  request(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Body() dto: RequestResearchDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.research.requestResearch(auth, projectId, dto ?? {}, workspaceHint);
  }

  @Get('projects/:projectId/research/latest')
  latest(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.research.getLatest(auth, projectId, workspaceHint);
  }

  @Get('projects/:projectId/research/:id')
  getById(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.research.getById(auth, projectId, id, workspaceHint);
  }

  @Get('projects/:projectId/learning-summary')
  learningSummary(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.learning.summarize(auth, projectId, workspaceHint);
  }

  @Get('projects/:projectId/research-capability')
  capabilityView() {
    return this.capability.getPublicCapability();
  }
}
