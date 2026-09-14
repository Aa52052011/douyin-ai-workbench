import { Body, Controller, Get, Headers, Param, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { requireIdempotencyKey } from '../publishing/idempotency-key.js';
import { CreateMonitoringMetricsDto, RecordManualExportDto, RegisterPublishedPostDto } from './monitoring.dto.js';
import { MonitoringService } from './monitoring.service.js';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get('projects/:projectId/manual-publication')
  status(@CurrentUser() auth: AuthContext, @Param('projectId') projectId: string) {
    return this.monitoring.projectStatus(auth, projectId);
  }

  @Post('projects/:projectId/manual-publication/export')
  @RequirePermission(Permission.PUBLICATION_CREATE)
  recordExport(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Body() dto: RecordManualExportDto,
  ) {
    return this.monitoring.recordExport(auth, projectId, dto.artifactId, dto.destinationType);
  }

  @Get('projects/:projectId/manual-publication/export-file')
  @RequirePermission(Permission.PUBLICATION_CREATE)
  async download(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Query('artifactId') artifactId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const opened = await this.monitoring.openExportFile(auth, projectId, artifactId);
    await this.monitoring.recordExport(auth, projectId, opened.artifact.artifactId, 'DOWNLOAD');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${opened.filename}"`);
    return new StreamableFile(opened.stream);
  }

  @Post('projects/:projectId/published-posts')
  @RequirePermission(Permission.PUBLICATION_CREATE)
  register(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Body() dto: RegisterPublishedPostDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const key = requireIdempotencyKey(idempotencyKey);
    res.setHeader('x-idempotency-key', key);
    return this.monitoring.register(auth, projectId, { ...dto, idempotencyKey: key });
  }

  @Get('monitoring/posts')
  list(@CurrentUser() auth: AuthContext, @Query('projectId') projectId?: string) {
    return this.monitoring.list(auth, projectId);
  }

  @Get('monitoring/posts/:id')
  getById(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return this.monitoring.getById(auth, id);
  }

  @Post('monitoring/posts/:id/metrics')
  @RequirePermission(Permission.PUBLICATION_CREATE)
  addMetrics(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateMonitoringMetricsDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const key = requireIdempotencyKey(idempotencyKey);
    res.setHeader('x-idempotency-key', key);
    return this.monitoring.addMetrics(auth, id, { ...dto, idempotencyKey: key });
  }
}
