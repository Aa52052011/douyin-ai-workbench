import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  AssetConsentStatus,
  AssetOwnerType,
  AssetRightsStatus,
  AssetSourceType,
  AssetStatus,
  AssetType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { ASSET_MIME_ALLOWLIST, LOCAL_STORAGE_PROVIDER_ID, MEDIA_MAX_UPLOAD_BYTES, normalizeLibraryMime } from '../media/media.constants.js';
import { extensionOf, buildStorageKey, sanitizeOriginalFilename } from '../media/storage/storage-key.js';
import { StorageService } from '../media/storage/storage.service.js';
import {
  isAssetProductionEligible,
  libraryCreateDefaults,
  pipelineAssetDefaults,
  toAssetLibraryView,
  type AssetLibraryView,
} from './asset-library.js';
import { toPublicAsset, type AssetPublic } from './assets.mapper.js';

export type ListLibraryQuery = {
  projectId: string;
  type?: AssetType;
  status?: AssetStatus;
  sourceType?: AssetSourceType;
  reusable?: boolean;
  libraryVisible?: boolean;
  referenceOnly?: boolean;
};

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
  ) {}

  async list(
    auth: AuthContext,
    query: ListLibraryQuery,
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
        sourceType: query.sourceType,
        reusable: query.reusable,
        libraryVisible: query.libraryVisible,
        referenceOnly: query.referenceOnly,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toPublicAsset);
  }

  async listLibrary(
    auth: AuthContext,
    query: ListLibraryQuery,
    workspaceHint?: string,
  ): Promise<AssetLibraryView[]> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    await this.requireProject(auth.tenantId, workspaceId, query.projectId);
    const rows = await this.prisma.asset.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId: query.projectId,
        type: query.type,
        status: query.status,
        sourceType: query.sourceType,
        reusable: query.reusable,
        referenceOnly: query.referenceOnly,
        libraryVisible: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toAssetLibraryView);
  }

  async getById(auth: AuthContext, id: string, workspaceHint?: string): Promise<AssetPublic> {
    return toPublicAsset(await this.requireAsset(auth, id, workspaceHint));
  }

  async getLibraryById(auth: AuthContext, id: string, workspaceHint?: string): Promise<AssetLibraryView> {
    const asset = await this.requireAsset(auth, id, workspaceHint);
    return toAssetLibraryView(asset);
  }

  async init(
    auth: AuthContext,
    input: {
      projectId: string;
      type: AssetType;
      originalFilename?: string;
      mimeType?: string;
      size?: number;
      referenceOnly?: boolean;
      rightsConfirmed?: boolean;
      libraryVisible?: boolean;
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
    const library = libraryCreateDefaults({
      referenceOnly: input.referenceOnly,
      rightsConfirmed: input.rightsConfirmed,
      createdByUserId: auth.userId,
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
        sourceType: library.sourceType,
        ownerType: AssetOwnerType.PROJECT,
        referenceOnly: library.referenceOnly,
        reusable: library.reusable,
        rightsStatus: library.rightsStatus,
        consentStatus: library.consentStatus,
        libraryVisible: input.libraryVisible ?? library.libraryVisible,
        createdByUserId: library.createdByUserId,
      },
    });
    return toPublicAsset(created);
  }

  /** One-shot library upload: init + put + complete. */
  async uploadLibraryFile(
    auth: AuthContext,
    input: {
      projectId: string;
      file: { buffer: Buffer; mimetype: string; originalname: string; size: number };
      referenceOnly?: boolean;
      rightsConfirmed?: boolean;
    },
    workspaceHint?: string,
  ): Promise<AssetLibraryView> {
    const type = this.typeFromMime(input.file.mimetype, input.file.originalname);
    const mimeType = normalizeLibraryMime(input.file.mimetype, input.file.originalname);
    const inited = await this.init(
      auth,
      {
        projectId: input.projectId,
        type,
        originalFilename: input.file.originalname,
        mimeType,
        size: input.file.size,
        referenceOnly: input.referenceOnly,
        rightsConfirmed: input.rightsConfirmed,
        libraryVisible: true,
      },
      workspaceHint,
    );
    await this.uploadContent(auth, inited.id, input.file, workspaceHint);
    await this.complete(auth, inited.id, workspaceHint);
    return this.getLibraryById(auth, inited.id, workspaceHint);
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
    const mimeType = normalizeLibraryMime(file.mimetype, file.originalname);
    const originalFilename =
      sanitizeOriginalFilename(file.originalname) ?? current.originalFilename;
    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(current.storageKey, file.buffer, { mimeType });
    const updated = await this.prisma.asset.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: {
        originalFilename,
        mimeType,
        size: file.size,
        contentHash,
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
    if (current.ownerType === AssetOwnerType.SYSTEM || current.sourceType === AssetSourceType.SYSTEM_LIBRARY) {
      throw new AppError(ErrorCode.ASSET_CONFLICT);
    }
    const links = await this.prisma.assetLink.count({
      where: { assetId: current.id, tenantId: auth.tenantId },
    });
    if (links > 0) {
      // Keep row + storage for historical Video; hide from library / production reuse.
      await this.prisma.asset.update({
        where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
        data: { libraryVisible: false, reusable: false },
      });
      return { id: current.id };
    }
    await this.prisma.asset.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: { deletedAt: new Date(), libraryVisible: false, reusable: false },
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
    pipelineKind?: 'visual' | 'voice' | 'subtitle' | 'compose';
  }) {
    const defaults = pipelineAssetDefaults(data.pipelineKind ?? 'visual');
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
        sourceType: defaults.sourceType,
        ownerType: defaults.ownerType,
        referenceOnly: defaults.referenceOnly,
        reusable: defaults.reusable,
        rightsStatus: defaults.rightsStatus,
        consentStatus: defaults.consentStatus,
        libraryVisible: defaults.libraryVisible,
      },
    });
  }

  /** Record production usage once per asset+video+usageType; bumps usedCount. */
  async recordUsage(input: {
    tenantId: string;
    workspaceId: string;
    projectId?: string | null;
    assetId: string;
    videoId: string;
    jobId?: string | null;
    usageType: string;
  }): Promise<{ created: boolean; usedCount: number }> {
    const existing = await this.prisma.assetUsage.findUnique({
      where: {
        tenantId_assetId_videoId_usageType: {
          tenantId: input.tenantId,
          assetId: input.assetId,
          videoId: input.videoId,
          usageType: input.usageType,
        },
      },
    });
    if (existing) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: input.assetId, tenantId: input.tenantId },
        select: { usedCount: true },
      });
      return { created: false, usedCount: asset?.usedCount ?? 0 };
    }
    await this.prisma.assetUsage.create({
      data: {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? undefined,
        assetId: input.assetId,
        videoId: input.videoId,
        jobId: input.jobId ?? undefined,
        usageType: input.usageType,
      },
    });
    const updated = await this.prisma.asset.update({
      where: { id_tenantId: { id: input.assetId, tenantId: input.tenantId } },
      data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
      select: { usedCount: true },
    });
    return { created: true, usedCount: updated.usedCount };
  }

  eligibilityFor(auth: AuthContext, assetId: string, workspaceHint?: string) {
    return this.requireAsset(auth, assetId, workspaceHint).then((asset) =>
      isAssetProductionEligible({
        asset,
        callerTenantId: auth.tenantId,
        requireLibraryVisible: true,
        libraryVisible: asset.libraryVisible,
      }),
    );
  }

  private typeFromMime(mimeType: string, filename?: string): AssetType {
    const normalized = normalizeLibraryMime(mimeType, filename);
    const allowed = ASSET_MIME_ALLOWLIST.get(normalized);
    if (allowed) {
      return allowed.type as AssetType;
    }
    throw new AppError(ErrorCode.ASSET_INVALID_FILE);
  }

  private assertAllowedFile(type: AssetType, mimeType: string, filename?: string): void {
    const normalized = normalizeLibraryMime(mimeType, filename);
    const allowed = ASSET_MIME_ALLOWLIST.get(normalized);
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
      type === AssetType.FINAL_VIDEO ||
      type === AssetType.BROLL ||
      type === AssetType.LOGO ||
      type === AssetType.VOICE_SAMPLE ||
      type === AssetType.DIGITAL_HUMAN ||
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
