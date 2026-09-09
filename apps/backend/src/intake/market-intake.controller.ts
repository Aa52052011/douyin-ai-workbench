import { Body, Controller, Headers, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { resolveRequestId } from '../common/request-id.js';
import { MarketIntakeTurnDto } from './dto/market-intake-turn.dto.js';
import { MarketIntakeTurnService } from './market-intake-turn.service.js';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MarketIntakeController {
  constructor(private readonly turns: MarketIntakeTurnService) {}

  @Post('projects/:projectId/intake/market/turn')
  @RequirePermission(Permission.AGENT_EXECUTE)
  turn(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Body() dto: MarketIntakeTurnDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-request-id') requestIdHeader?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const requestId = resolveRequestId(requestIdHeader);
    res.setHeader('x-request-id', requestId);
    const locale = dto.locale || acceptLanguage?.split(',')[0]?.trim() || 'zh-CN';
    return this.turns.turn(auth, projectId, dto, {
      requestId,
      workspaceHint,
      locale,
    });
  }
}
