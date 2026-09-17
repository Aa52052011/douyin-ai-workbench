import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { AnalyzePublishedPostDto, ReviewRecommendationDto } from './performance-analysis.dto.js';
import { PerformanceAnalysisService } from './performance-analysis.service.js';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceAnalysisController {
  constructor(private readonly analyses: PerformanceAnalysisService) {}

  @Post('monitoring/posts/:publishedPostId/analyze')
  analyze(
    @CurrentUser() auth: AuthContext,
    @Param('publishedPostId') publishedPostId: string,
    @Body() dto: AnalyzePublishedPostDto,
  ) {
    return this.analyses.analyze(auth, publishedPostId, dto);
  }

  @Get('monitoring/posts/:publishedPostId/analyses')
  list(@CurrentUser() auth: AuthContext, @Param('publishedPostId') publishedPostId: string) {
    return this.analyses.list(auth, publishedPostId);
  }

  @Get('projects/:projectId/accepted-performance-feedback')
  listAccepted(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.analyses.listAcceptedForProject(auth, projectId, workspaceHint);
  }

  @Get('performance-analyses/:analysisId')
  getById(@CurrentUser() auth: AuthContext, @Param('analysisId') analysisId: string) {
    return this.analyses.getById(auth, analysisId);
  }

  @Post('performance-analyses/:analysisId/recommendations/:recommendationId/review')
  @RequirePermission(Permission.AGENT_EXECUTE)
  review(
    @CurrentUser() auth: AuthContext,
    @Param('analysisId') analysisId: string,
    @Param('recommendationId') recommendationId: string,
    @Body() dto: ReviewRecommendationDto,
  ) {
    return this.analyses.reviewRecommendation(auth, analysisId, recommendationId, dto.action, dto.userNote);
  }

  @Post('performance-analyses/:analysisId/feedback-cycle/apply')
  @RequirePermission(Permission.AGENT_EXECUTE)
  apply(@CurrentUser() auth: AuthContext, @Param('analysisId') analysisId: string) {
    return this.analyses.applyFeedback(auth, analysisId);
  }
}
