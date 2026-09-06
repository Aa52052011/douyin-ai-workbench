import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { requireIdempotencyKey } from '../publishing/idempotency-key.js';
import { ConfirmMarketImportDto } from './dto/confirm-market-import.dto.js';
import { MARKET_IMPORT_MAX_FILE_BYTES } from './import/market-import.constants.js';
import { MarketImportConfirmService } from './market-import-confirm.service.js';
import { MarketImportPreviewService } from './market-import-preview.service.js';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MarketImportController {
  constructor(
    private readonly previewService: MarketImportPreviewService,
    private readonly confirmService: MarketImportConfirmService,
  ) {}

  @Post('projects/:projectId/market-research/import/preview')
  @RequirePermission(Permission.PROJECT_UPDATE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MARKET_IMPORT_MAX_FILE_BYTES },
    }),
  )
  preview(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined,
    @Body()
    body: {
      kind?: string;
      productBriefId?: string;
      collectedAtOverride?: string;
      mapping?: string;
      origin?: string;
      selectionMethod?: string;
      sampleScope?: string;
      sourceContext?: string;
    },
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    if (!file?.buffer) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'file is required');
    }
    return this.previewService.preview(
      auth,
      projectId,
      {
        file,
        kind: body.kind ?? '',
        productBriefId: body.productBriefId,
        collectedAtOverride: body.collectedAtOverride,
        mapping: parseMappingField(body.mapping),
        origin: body.origin,
        selectionMethod: body.selectionMethod,
        sampleScope: body.sampleScope,
        sourceContext: body.sourceContext,
      },
      workspaceHint,
    );
  }

  @Post('projects/:projectId/market-research/import/confirm')
  @RequirePermission(Permission.PROJECT_UPDATE)
  confirm(
    @CurrentUser() auth: AuthContext,
    @Param('projectId') projectId: string,
    @Body() dto: ConfirmMarketImportDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    const key = requireIdempotencyKey(idempotencyKey);
    return this.confirmService.confirm(auth, projectId, dto, { idempotencyKey: key, workspaceHint });
  }
}

function parseMappingField(value?: string): Record<string, string> | null {
  if (value == null || value.trim() === '') {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid');
    }
    return parsed as Record<string, string>;
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'mapping is invalid');
  }
}
