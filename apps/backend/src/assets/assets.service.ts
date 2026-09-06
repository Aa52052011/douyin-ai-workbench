import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AssetStatus, AssetType, Prisma, PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { ASSET_MIME_ALLOWLIST, LOCAL_STORAGE_PROVIDER_ID, MEDIA_MAX_UPLOAD_BYTES } from '../media/media.constants.js';
import { extensionOf, buildStorageKey, sanitizeOriginalFilename } from '../media/storage/storage-key.js';
import { StorageService } from '../media/storage/storage.service.js';
import { toPublicAsset, type AssetPublic } from './assets.mapper.js';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
  ) {}

  async list(
    auth: AuthContext,
    query: { projectId: string; type?: AssetType; status?: AssetStatus },
    workspaceHint?: string,
  ): Promise<AssetPublic[]> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    await this.requireProject(auth.tenantId, workspaceId, query.projectId);
    const rows = await this.prisma.asset.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId: query.projectId,
        type: query.type,
        status: query.status,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toPublicAsset);
  }

  async getById(auth: AuthContext, id: string, workspaceHint?: string): Promise<AssetPublic> {
    return toPublicAsset(await this.requireAsset(auth, id, workspaceHint));
  }

  async init(
    auth: AuthContext,
    input: {
      projectId: string;
      type: AssetType;
      originalFilename?: string;
      mimeType?: string;
      size?: number;
    },
    workspaceHint?: string,
  ): Promise<AssetPublic> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    await this.requireProject(auth.tenantId, workspaceId, input.projectId);
    if (input.size != null && input.size > MEDIA_MAX_UPLOAD_BYTES) {
      throw new AppError(ErrorCode.ASSET_INVALID_FILE);
    }
    const originalFilename = sanitizeOriginalFilename(input.originalFilename);
    const id = randomUUID();
    const storageKey = buildStorageKey({
      tenantId: auth.tenantId,
      workspaceId,
      projectId: input.projectId,
      assetId: id,
    });
    const created = await this.prisma.asset.create({
      data: {
        id,
        tenantId: auth.tenantId,
        workspaceId,
        projectId: input.projectId,
        type: input.type,
        status: AssetStatus.PENDING,
        storageProvider: LOCAL_STORAGE_PROVIDER_ID,
        storageKey,
        originalFilename,
        mimeType: input.mimeType,
        size: input.size,
      },
    });
    return toPublicAsset(created);
  }

  async uploadContent(
    auth: AuthContext,
    id: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    workspaceHint?: string,
  ): Promise<AssetPublic> {
    const current = await this.requireAsset(auth, id, workspaceHint);
    if (current.status !== AssetStatus.PENDING) {
      throw new AppError(ErrorCode.ASSET_CONFLICT);
    }
    if (!file?.buffer || file.size < 1) {
      throw new AppError(ErrorCode.ASSET_INVALID_FILE);
    }
    if (file.size > MEDIA_MAX_UPLOAD_BYTES) {
      throw new AppError(ErrorCode.ASSET_INVALID_FILE);
    }
    this.assertAllowedFile(current.type, file.mimetype, file.originalname);
    const originalFilename =
      sanitizeOriginalFilename(file.originalname) ?? current.originalFilename;
    await this.storage.put(current.storageKey, file.buffer, { mimeType: file.mimetype });
    const updated = await this.prisma.asset.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: {
        originalFilename,
        mimeType: file.mimetype,
        size: file.size,
      },
    });
    return toPublicAsset(updated);
  }

  async complete(auth: AuthContext, id: string, workspaceHint?: string): Promise<AssetPublic> {
    const current = await this.requireAsset(auth, id, workspaceHint);
    if (current.status !== AssetStatus.PENDING) {
      throw new AppError(ErrorCode.ASSET_CONFLICT);
    }
    const exists = await this.storage.exists(current.storageKey);
    if (!exists) {
      await this.prisma.asset.update({
        where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
        data: { status: AssetStatus.FAILED },
      });
      throw new AppError(ErrorCode.ASSET_INVALID_FILE);
    }
    if (!current.mimeType) {
      throw new AppError(ErrorCode.ASSET_INVALID_FILE);
    }
    this.assertAllowedFile(current.type, current.mimeType, current.originalFilename ?? undefined);
    const updated = await this.prisma.asset.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: { status: AssetStatus.READY },
    });
    return toPublicAsset(updated);
  }

  async remove(auth: AuthContext, id: string, workspaceHint?: string): Promise<{ id: string }> {
    const current = await this.requireAsset(auth, id, workspaceHint);
    const links = await this.prisma.assetLink.count({
      where: { assetId: current.id, tenantId: auth.tenantId },
    });
    if (links > 0) {
      throw new AppError(ErrorCode.ASSET_CONFLICT);
    }
    await this.prisma.asset.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: { deletedAt: new Date() },
    });
    return { id: current.id };
  }

  async streamContent(auth: AuthContext, id: string, workspaceHint?: string) {
    const current = await this.requireAsset(auth, id, workspaceHint);
    if (current.status !== AssetStatus.READY && current.status !== AssetStatus.PENDING) {
      throw new AppError(ErrorCode.ASSET_NOT_FOUND);
    }
    const body = await this.storage.get(current.storageKey);
    return {
      body,
      mimeType: current.mimeType ?? 'application/octet-stream',
      filename: current.originalFilename ?? `${current.id}`,
    };
  }

  async createReadyAsset(data: {
    tenantId: string;
    workspaceId: string;
    projectId: string;
    type: AssetType;
    storageKey: string;
    originalFilename?: string;
    mimeType: string;
    size: number;
    duration?: number;
    width?: number;
    height?: number;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.asset.create({
      data: {
        tenantId: data.tenantId,
        workspaceId: data.workspaceId,
        projectId: data.projectId,
        type: data.type,
        status: AssetStatus.READY,
        storageProvider: LOCAL_STORAGE_PROVIDER_ID,
        storageKey: data.storageKey,
        originalFilename: data.originalFilename,
        mimeType: data.mimeType,
        size: data.size,
        duration: data.duration,
        width: data.width,
        height: data.height,
        metadata: data.metadata ?? {},
      },
    });
  }

  private assertAllowedFile(type: AssetType, mimeType: string, filename?: string): void {
    const allowed = ASSET_MIME_ALLOWLIST.get(mimeType.toLowerCase());
    if (!allowed) {
      throw new AppError(ErrorCode.ASSET_INVALID_FILE);
    }
    const ext = extensionOf(filename);
    if (ext && !allowed.extensions.includes(ext)) {
      throw new AppError(ErrorCode.ASSET_INVALID_FILE);
    }
    const mapped = allowed.type as AssetType;
    const compatible =
      type === mapped ||
      type === AssetType.OTHER ||
      (type === AssetType.SOURCE_VIDEO && mapped === AssetType.VIDEO) ||
      (type === AssetType.SOURCE_AUDIO && mapped === AssetType.AUDIO);
    if (!compatible) {
      throw new AppError(ErrorCode.ASSET_INVALID_FILE);
    }
  }

  private async requireAsset(auth: AuthContext, id: string, workspaceHint?: string) {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.ASSET_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const asset = await this.prisma.asset.findFirst({
      where: {
        id,
        tenantId: auth.tenantId,
        workspaceId,
        deletedAt: null,
      },
    });
    if (!asset) {
      throw new AppError(ErrorCode.ASSET_NOT_FOUND);
    }
    return asset;
  }

  private async requireProject(tenantId: string, workspaceId: string, projectId: string) {
    if (!isUuid(projectId)) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId, workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    return project;
  }
}
