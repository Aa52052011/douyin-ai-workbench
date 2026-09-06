import { Body, Controller, Get, Headers, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { resolveRequestId } from '../common/request-id.js';
import { AgentsService } from './agent.service.js';
import { ExecuteAgentDto } from './dto/execute-agent.dto.js';
import { ListAgentRunsQueryDto } from './dto/list-agent-runs.dto.js';

@Controller('agents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  list() {
    return this.agents.listAgents();
  }

  @Get('runs')
  listRuns(
    @CurrentUser() auth: AuthContext,
    @Query() query: ListAgentRunsQueryDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.agents.listRuns(auth, query, workspaceHint);
  }

  @Get('runs/:id')
  getRun(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.agents.getRun(auth, id, workspaceHint);
  }

  @Post('runs')
  @RequirePermission(Permission.AGENT_EXECUTE)
  async execute(
    @CurrentUser() auth: AuthContext,
    @Body() dto: ExecuteAgentDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-request-id') requestIdHeader?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
    @Headers('accept-language') locale?: string,
  ) {
    const requestId = resolveRequestId(requestIdHeader);
    res.setHeader('x-request-id', requestId);
    return this.agents.execute(auth, dto, { requestId, locale, workspaceHint });
  }
}
