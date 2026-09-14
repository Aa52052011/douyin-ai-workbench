import {
  Controller,
  Delete,
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
import { ListPlatformAccountsQueryDto } from './dto/list-platform-accounts.dto.js';
import { parseDouyinOAuthPurpose } from './oauth/douyin-oauth.config.js';
import { DouyinOAuthService } from './oauth/douyin-oauth.service.js';
import { connectedHtml } from './platform-accounts.mapper.js';

@Controller('platform-accounts')
export class PlatformAccountsController {
  constructor(private readonly accounts: DouyinOAuthService) {}

  @Post('douyin/connect')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Permission.PLATFORM_ACCOUNT_MANAGE)
  connect(
    @CurrentUser() auth: AuthContext,
    @Headers('x-workspace-id') workspaceHint?: string,
    @Query('purpose') purpose?: string,
  ) {
    return this.accounts.startConnect(auth, workspaceHint, parseDouyinOAuthPurpose(purpose));
  }

  @Get('douyin/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    await this.accounts.handleCallback({ code, state, error });
    res.status(200).type('html').send(connectedHtml());
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  list(
    @CurrentUser() auth: AuthContext,
    @Query() query: ListPlatformAccountsQueryDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.accounts.list(auth, query, workspaceHint);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  getById(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.accounts.getById(auth, id, workspaceHint);
  }

  @Post(':id/refresh')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Permission.PLATFORM_ACCOUNT_MANAGE)
  refresh(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.accounts.refreshDouyinCredential(auth, id, workspaceHint);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Permission.PLATFORM_ACCOUNT_MANAGE)
  disconnect(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.accounts.disconnect(auth, id, workspaceHint);
  }
}
