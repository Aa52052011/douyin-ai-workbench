import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
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
import { resolveRequestId } from '../common/request-id.js';
import { CreateScriptDto } from './dto/create-script.dto.js';
import { ListScriptsQueryDto } from './dto/list-scripts.dto.js';
import { UpdateScriptDto } from './dto/update-script.dto.js';
import { ScriptsService } from './scripts.service.js';

@Controller('scripts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ScriptsController {
  constructor(private readonly scripts: ScriptsService) {}

  @Get()
  list(
    @CurrentUser() auth: AuthContext,
    @Query() query: ListScriptsQueryDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.scripts.list(auth, query, workspaceHint);
  }

  @Get(':id')
  getById(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.scripts.getById(auth, id, workspaceHint);
  }

  @Post()
  @RequirePermission(Permission.AGENT_EXECUTE)
  create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateScriptDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-request-id') requestIdHeader?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
    @Headers('accept-language') locale?: string,
  ) {
    const requestId = resolveRequestId(requestIdHeader);
    res.setHeader('x-request-id', requestId);
    return this.scripts.create(auth, dto, { requestId, locale, workspaceHint });
  }

  @Patch(':id')
  @RequirePermission(Permission.PROJECT_UPDATE)
  update(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateScriptDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.scripts.update(auth, id, dto, workspaceHint);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @RequirePermission(Permission.PROJECT_UPDATE)
  confirm(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
    @Headers('x-approval-source') approvalSource?: string,
  ) {
    return this.scripts.confirm(auth, id, workspaceHint, { approvalSource });
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission(Permission.PROJECT_UPDATE)
  archive(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.scripts.archive(auth, id, workspaceHint);
  }
}
