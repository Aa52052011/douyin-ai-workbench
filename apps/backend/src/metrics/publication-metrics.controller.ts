import { Body, Controller, Get, Headers, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { requireIdempotencyKey } from '../publishing/idempotency-key.js';
import { CreateImportPublicationMetricsDto } from './dto/create-import-metrics.dto.js';
import { CreateManualPublicationMetricsDto } from './dto/create-manual-metrics.dto.js';
import { ListPublicationMetricsQueryDto } from './dto/list-publication-metrics.dto.js';
import { SyncPublicationMetricsDto } from './dto/sync-publication-metrics.dto.js';
import { MetricsIngestionService } from './metrics-ingestion.service.js';
import { MetricsSyncService } from './metrics-sync.service.js';
import { PublicationMetricsService } from './publication-metrics.service.js';

@Controller('publications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PublicationMetricsController {
  constructor(
    private readonly metrics: PublicationMetricsService,
    private readonly sync: MetricsSyncService,
    private readonly ingestion: MetricsIngestionService,
  ) {}

  @Post(':id/metrics/manual')
  @RequirePermission(Permission.PUBLICATION_CREATE)
  createManual(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateManualPublicationMetricsDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-idempotency-key') idempotencyKey?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    const key = requireIdempotencyKey(idempotencyKey);
    res.setHeader('x-idempotency-key', key);
    return this.metrics.createManual(auth, id, dto, { idempotencyKey: key, workspaceHint });
  }

  @Post(':id/metrics/import')
  @RequirePermission(Permission.PUBLICATION_CREATE)
  ingestImport(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateImportPublicationMetricsDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-idempotency-key') idempotencyKey?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    const key = requireIdempotencyKey(idempotencyKey);
    res.setHeader('x-idempotency-key', key);
    return this.ingestion.ingestImport(auth, id, dto, { idempotencyKey: key, workspaceHint });
  }

  @Post(':id/metrics/sync')
  @RequirePermission(Permission.PUBLICATION_CREATE)
  requestSync(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() _dto: SyncPublicationMetricsDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-idempotency-key') idempotencyKey?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    const key = requireIdempotencyKey(idempotencyKey);
    res.setHeader('x-idempotency-key', key);
    return this.sync.requestSync(auth, id, { idempotencyKey: key, workspaceHint });
  }

  @Get(':id/metrics/latest')
  latest(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.metrics.latest(auth, id, workspaceHint);
  }

  @Get(':id/metrics/summary')
  summary(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.metrics.summary(auth, id, workspaceHint);
  }

  @Get(':id/metrics/insights')
  insights(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.metrics.insights(auth, id, workspaceHint);
  }

  @Get(':id/metrics')
  list(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Query() query: ListPublicationMetricsQueryDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.metrics.list(auth, id, query, workspaceHint);
  }
}
