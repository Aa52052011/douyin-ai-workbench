import {
  Body,
  Controller,
  Headers,
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
import { ConfirmMetricsImportDto } from './dto/confirm-metrics-import.dto.js';
import { METRICS_IMPORT_MAX_FILE_BYTES } from './import/import-file.constants.js';
import { MetricsImportConfirmService } from './metrics-import-confirm.service.js';
import { MetricsImportPreviewService } from './metrics-import-preview.service.js';

@Controller('metrics/import')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MetricsImportController {
  constructor(
    private readonly previewService: MetricsImportPreviewService,
    private readonly confirmService: MetricsImportConfirmService,
  ) {}

  @Post('preview')
  @RequirePermission(Permission.PUBLICATION_CREATE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: METRICS_IMPORT_MAX_FILE_BYTES },
    }),
  )
  preview(
    @CurrentUser() auth: AuthContext,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined,
    @Body() body: { projectId?: string; observedAtOverride?: string },
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    if (!file?.buffer) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'file is required');
    }
    return this.previewService.preview(auth, {
      file,
      projectId: body.projectId,
      observedAtOverride: body.observedAtOverride,
      workspaceHint,
    });
  }

  @Post('confirm')
  @RequirePermission(Permission.PUBLICATION_CREATE)
  confirm(
    @CurrentUser() auth: AuthContext,
    @Body() dto: ConfirmMetricsImportDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.confirmService.confirm(auth, dto, workspaceHint);
  }
}
