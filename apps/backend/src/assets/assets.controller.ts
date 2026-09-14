import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../authz/permissions.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';
import { MEDIA_MAX_UPLOAD_BYTES } from '../media/media.constants.js';
import { AssetsService } from './assets.service.js';
import { InitAssetDto } from './dto/init-asset.dto.js';
import { ListAssetsQueryDto } from './dto/list-assets.dto.js';

@Controller('assets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(
    @CurrentUser() auth: AuthContext,
    @Query() query: ListAssetsQueryDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.assets.list(auth, query, workspaceHint);
  }

  @Get('library')
  listLibrary(
    @CurrentUser() auth: AuthContext,
    @Query() query: ListAssetsQueryDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.assets.listLibrary(auth, query, workspaceHint);
  }

  @Post()
  @RequirePermission(Permission.PROJECT_UPDATE)
  init(
    @CurrentUser() auth: AuthContext,
    @Body() dto: InitAssetDto,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.assets.init(auth, dto, workspaceHint);
  }

  @Post('upload')
  @RequirePermission(Permission.PROJECT_UPDATE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MEDIA_MAX_UPLOAD_BYTES },
    }),
  )
  uploadOneShot(
    @CurrentUser() auth: AuthContext,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    @Body()
    body: { projectId: string; referenceOnly?: string; rightsConfirmed?: string },
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.assets.uploadLibraryFile(
      auth,
      {
        projectId: body.projectId,
        file,
        referenceOnly: body.referenceOnly === 'true' || body.referenceOnly === '1',
        rightsConfirmed: body.rightsConfirmed === 'true' || body.rightsConfirmed === '1',
      },
      workspaceHint,
    );
  }

  @Get(':id/content')
  async content(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Res() res: Response,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    const file = await this.assets.streamContent(auth, id, workspaceHint);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    res.send(file.body);
  }

  @Get(':id/eligibility')
  eligibility(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.assets.eligibilityFor(auth, id, workspaceHint);
  }

  @Put(':id/content')
  @RequirePermission(Permission.PROJECT_UPDATE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MEDIA_MAX_UPLOAD_BYTES },
    }),
  )
  upload(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.assets.uploadContent(auth, id, file, workspaceHint);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermission(Permission.PROJECT_UPDATE)
  complete(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.assets.complete(auth, id, workspaceHint);
  }

  @Get(':id')
  getById(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.assets.getById(auth, id, workspaceHint);
  }

  @Delete(':id')
  @RequirePermission(Permission.PROJECT_UPDATE)
  remove(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Headers('x-workspace-id') workspaceHint?: string,
  ) {
    return this.assets.remove(auth, id, workspaceHint);
  }
}
