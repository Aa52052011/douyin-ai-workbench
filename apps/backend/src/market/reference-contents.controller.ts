import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request } from 'express';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { ReferenceContentsService } from './reference-contents.service.js';
import { ReferenceIntelligenceService } from './reference-intelligence.service.js';

class CreateReferenceDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonForReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;
}

class ListReferenceQuery {
  @IsUUID()
  projectId!: string;
}

class AnalyzeReferenceDto {
  @IsOptional()
  @IsBoolean()
  reanalyze?: boolean;

  @IsOptional()
  @IsBoolean()
  useAgent?: boolean;
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReferenceContentsController {
  constructor(
    private readonly references: ReferenceContentsService,
    private readonly intelligence: ReferenceIntelligenceService,
  ) {}

  @Get('projects/:projectId/references')
  listByProject(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.references.list(auth, projectId, workspaceHint);
  }

  @Get('reference-contents')
  list(
    @CurrentUser() auth: AuthContext,
    @Query() query: ListReferenceQuery,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.references.list(auth, query.projectId, workspaceHint);
  }

  @Post('reference-contents')
  @RequirePermission(Permission.PROJECT_UPDATE)
  create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateReferenceDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.references.create(auth, dto, workspaceHint);
  }

  @Delete('reference-contents/:id')
  @RequirePermission(Permission.PROJECT_UPDATE)
  remove(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.references.remove(auth, id, workspaceHint);
  }

  @Post('projects/:projectId/references/:referenceId/analyze')
  @RequirePermission(Permission.PROJECT_UPDATE)
  analyze(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Param('referenceId') referenceId: string,
    @Body() dto: AnalyzeReferenceDto,
    @Req() req: Request,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.intelligence.analyze(auth, projectId, referenceId, {
      reanalyze: dto?.reanalyze === true,
      useAgent: dto?.useAgent === true,
      workspaceHint,
      requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : undefined,
    });
  }

  @Get('projects/:projectId/references/:referenceId/analysis')
  async getAnalysis(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Param('referenceId') referenceId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    const analysis = await this.intelligence.getLatestAnalysis(
      auth,
      projectId,
      referenceId,
      workspaceHint,
    );
    return { analysis };
  }

  @Get('projects/:projectId/references/:referenceId/patterns')
  listPatterns(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Param('referenceId') referenceId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.intelligence.listPatterns(auth, projectId, referenceId, workspaceHint);
  }
}
