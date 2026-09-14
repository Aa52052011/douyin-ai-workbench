import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { Permission } from '../../authz/permissions.js';
import { PermissionsGuard } from '../../authz/permissions.guard.js';
import { RequirePermission } from '../../authz/require-permission.decorator.js';
import { DurableCropReviewHttpService } from '../crop-approval-persistence/durable-http.service.js';
import {
  ApproveCropDto,
  AuthorizeExecutionDto,
  PatchBackgroundDto,
  PatchChecklistDto,
  RejectCropDto,
  RequestChangesCropDto,
  RequestPreviewDto,
} from '../crop-approval-persistence/crop-review.http.dto.js';
import type { HumanCropApprovalCommandV1 } from './review-flow.types.js';
import type { AuthorizedCropExecutionRequestV1 } from '../crop-approval-persistence/persistence.types.js';
import { CROP_EXECUTION_AUTHORIZATION_VERSION } from '../crop-approval-persistence/persistence.types.js';

@Controller('production-v2/crop-review')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CropReviewController {
  constructor(private readonly durable: DurableCropReviewHttpService) {}

  @Get(':sessionId/preview-media')
  @RequirePermission(Permission.PROJECT_UPDATE)
  async previewMedia(
    @CurrentUser() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Res() res: Response,
    @Query('projectId') projectId?: string,
  ) {
    const opened = await this.durable.openPreviewMedia(auth, sessionId, projectId);
    if (!opened.ok) {
      res.status(404).json({ code: opened.code, message: 'Preview not available' });
      return;
    }
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'inline; filename="review-preview.mp4"');
    res.setHeader('X-Preview-Only', 'true');
    opened.stream.pipe(res);
  }

  @Get(':sessionId/final-production-media')
  @RequirePermission(Permission.PROJECT_UPDATE)
  async finalProductionMedia(
    @CurrentUser() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Res() res: Response,
    @Query('projectId') projectId?: string,
    @Query('profile') profile?: string,
  ) {
    const opened = await this.durable.openFinalProductionMedia(auth, sessionId, profile ?? '', projectId);
    if (!opened.ok) {
      res.status(404).json({ code: opened.code, message: 'Final production artifact not available' });
      return;
    }
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'inline; filename="final-production.mp4"');
    res.setHeader('X-Final-Production', 'true');
    opened.stream.pipe(res);
  }

  @Get(':sessionId')
  @RequirePermission(Permission.PROJECT_UPDATE)
  get(
    @CurrentUser() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.durable.getReview(auth, sessionId, projectId);
  }

  @Patch(':sessionId/background')
  @RequirePermission(Permission.PROJECT_UPDATE)
  patchBackground(
    @CurrentUser() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Body() body: PatchBackgroundDto,
    @Query('projectId') projectId?: string,
  ) {
    return this.durable.patchBackground(auth, sessionId, body.backgroundTreatment, projectId);
  }

  @Patch(':sessionId/checklist')
  @RequirePermission(Permission.PROJECT_UPDATE)
  patchChecklist(
    @CurrentUser() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Body() body: PatchChecklistDto,
    @Query('projectId') projectId?: string,
  ) {
    return this.durable.patchChecklist(auth, sessionId, body.itemId, body.interaction, projectId);
  }

  @Post(':sessionId/preview')
  @RequirePermission(Permission.PROJECT_UPDATE)
  requestPreview(
    @CurrentUser() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Body() body: RequestPreviewDto,
    @Query('projectId') projectId?: string,
  ) {
    return this.durable.requestPreview(auth, sessionId, body.intent ?? 'REQUEST_RENDER', projectId, {
      clientRequestId: body.clientRequestId,
      solidColor: body.solidColor,
      staticImageAssetId: body.staticImageAssetId,
    });
  }

  @Post(':sessionId/source-aware-preview')
  @RequirePermission(Permission.PROJECT_UPDATE)
  requestSourceAwarePreview(
    @CurrentUser() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.durable.requestSourceAwarePreview(auth, sessionId, projectId);
  }

  @Post(':sessionId/editorial-preview')
  @RequirePermission(Permission.PROJECT_UPDATE)
  requestEditorialPreview(
    @CurrentUser() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.durable.requestEditorialPreview(auth, sessionId, projectId);
  }

  @Post(':sessionId/dynamic-preview')
  @RequirePermission(Permission.PROJECT_UPDATE)
  requestDynamicPreview(
    @CurrentUser() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.durable.requestDynamicPreview(auth, sessionId, projectId);
  }

  @Post(':sessionId/approve')
  @RequirePermission(Permission.PROJECT_UPDATE)
  approve(
    @CurrentUser() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Body() body: ApproveCropDto,
    @Query('projectId') projectId?: string,
  ) {
    return this.durable.approve(auth, sessionId, body as HumanCropApprovalCommandV1, projectId);
  }

  @Post(':sessionId/authorize-execution')
  @RequirePermission(Permission.PROJECT_UPDATE)
  authorize(
    @CurrentUser() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Body() body: AuthorizeExecutionDto,
    @Query('projectId') projectId?: string,
  ) {
    const request: AuthorizedCropExecutionRequestV1 = {
      schemaVersion: CROP_EXECUTION_AUTHORIZATION_VERSION,
      approvalId: body.approvalId,
      reviewSessionId: body.reviewSessionId ?? sessionId,
      assetId: body.assetId ?? '00000000-0000-4000-8000-000000000000',
      candidateId: body.candidateId ?? '',
      candidateVersion: body.candidateVersion ?? '',
      previewVersion: body.previewVersion ?? '',
      backgroundTreatment: body.backgroundTreatment ?? '',
      executionPlanVersion: body.executionPlanVersion ?? 'ffmpeg.crop-execution-plan:v1',
      clientRequestId: body.clientRequestId,
    };
    return this.durable.authorize(auth, sessionId, request, projectId);
  }

  @Post(':sessionId/reject')
  @RequirePermission(Permission.PROJECT_UPDATE)
  reject(
    @CurrentUser() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Body() body: RejectCropDto,
    @Query('projectId') projectId?: string,
  ) {
    return this.durable.reject(auth, sessionId, body.reason, projectId);
  }

  @Post(':sessionId/request-changes')
  @RequirePermission(Permission.PROJECT_UPDATE)
  changes(
    @CurrentUser() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Body() body: RequestChangesCropDto,
    @Query('projectId') projectId?: string,
  ) {
    return this.durable.requestChanges(auth, sessionId, body.request, projectId);
  }
}
