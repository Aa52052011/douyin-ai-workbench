import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
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
import { CreatePublicationDto } from './dto/create-publication.dto.js';
import { ListPublicationsQueryDto } from './dto/list-publications.dto.js';
import { ManualCompletePublicationDto } from './dto/manual-complete-publication.dto.js';
import { requireIdempotencyKey } from './idempotency-key.js';
import { PublicationsService } from './publications.service.js';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PublicationsController {
  constructor(private readonly publications: PublicationsService) {}

  @Post('videos/:videoId/publications')
  @RequirePermission(Permission.PUBLICATION_CREATE)
  create(
    @CurrentUser() auth: AuthContext,
    @Param('videoId') videoId: string,
    @Body() dto: CreatePublicationDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-idempotency-key') idempotencyKey?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    const key = requireIdempotencyKey(idempotencyKey);
    res.setHeader('x-idempotency-key', key);
    return this.publications.create(auth, videoId, dto, { idempotencyKey: key, workspaceHint });
  }

  @Get('publications')
  list(
    @CurrentUser() auth: AuthContext,
    @Query() query: ListPublicationsQueryDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.publications.list(auth, query, workspaceHint);
  }

  @Get('publications/:id')
  getById(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.publications.getById(auth, id, workspaceHint);
  }

  @Post('publications/:id/retry')
  @HttpCode(200)
  @RequirePermission(Permission.PUBLICATION_CREATE)
  retry(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-idempotency-key') idempotencyKey?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    const key = requireIdempotencyKey(idempotencyKey);
    res.setHeader('x-idempotency-key', key);
    return this.publications.retry(auth, id, { idempotencyKey: key, workspaceHint });
  }

  @Post('publications/:id/manual-complete')
  @HttpCode(200)
  @RequirePermission(Permission.PUBLICATION_CREATE)
  completeManual(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ManualCompletePublicationDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.publications.completeManual(auth, id, dto, workspaceHint);
  }
}
