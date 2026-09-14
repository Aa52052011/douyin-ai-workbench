import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import {
  classifyMarketUrl,
  type MarketSourceType,
} from './market-source.js';

export type ReferenceContentPublic = {
  id: string;
  projectId: string;
  sourceType: string;
  sourceLabel: string;
  platform: string | null;
  title: string | null;
  note: string | null;
  reasonForReference: string | null;
  url: string | null;
  canonicalUrl: string | null;
  assetId: string | null;
  referenceOnly: true;
  createdAt: Date;
  updatedAt: Date;
};

const TYPE_LABELS: Record<string, string> = {
  DOUYIN_VIDEO_URL: '抖音视频链接',
  DOUYIN_ACCOUNT_URL: '抖音账号',
  DOUYIN_URL_UNKNOWN: '抖音链接（待解析）',
  WEB_URL: '网页链接',
  UPLOAD_VIDEO: '上传视频',
  UPLOAD_IMAGE: '上传图片',
  UPLOAD_SCREENSHOT: '市场截图',
  OTHER: '其它',
};

@Injectable()
export class ReferenceContentsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(auth: AuthContext, projectId: string, workspaceHint?: string): Promise<ReferenceContentPublic[]> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    await this.requireProject(auth.tenantId, workspaceId, projectId);
    const rows = await this.prisma.referenceContent.findMany({
      where: { tenantId: auth.tenantId, workspaceId, projectId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toPublic);
  }

  async create(
    auth: AuthContext,
    input: {
      projectId: string;
      sourceType?: string;
      platform?: string;
      title?: string;
      note?: string;
      reasonForReference?: string;
      url?: string;
      assetId?: string;
    },
    workspaceHint?: string,
  ): Promise<ReferenceContentPublic> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    await this.requireProject(auth.tenantId, workspaceId, input.projectId);

    let sourceType = input.sourceType ?? 'OTHER';
    let platform = input.platform ?? null;
    let canonicalUrl: string | null = null;
    let url = input.url?.trim() || null;

    if (url) {
      const classified = classifyMarketUrl(url);
      if (!classified.valid) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '链接无效');
      }
      canonicalUrl = classified.canonicalUrl;
      url = classified.canonicalUrl ?? url;
      if (!input.sourceType) sourceType = classified.sourceType;
      platform = platform ?? classified.platform;
    }

    if (input.assetId) {
      if (!isUuid(input.assetId)) {
        throw new AppError(ErrorCode.ASSET_NOT_FOUND);
      }
      const asset = await this.prisma.asset.findFirst({
        where: {
          id: input.assetId,
          tenantId: auth.tenantId,
          workspaceId,
          projectId: input.projectId,
          deletedAt: null,
        },
      });
      if (!asset) {
        throw new AppError(ErrorCode.ASSET_NOT_FOUND);
      }
    }

    if (canonicalUrl) {
      const dup = await this.prisma.referenceContent.findFirst({
        where: {
          tenantId: auth.tenantId,
          projectId: input.projectId,
          canonicalUrl,
          deletedAt: null,
        },
      });
      if (dup) {
        return toPublic(dup);
      }
    }
    if (input.assetId) {
      const dupAsset = await this.prisma.referenceContent.findFirst({
        where: {
          tenantId: auth.tenantId,
          projectId: input.projectId,
          assetId: input.assetId,
          deletedAt: null,
        },
      });
      if (dupAsset) {
        return toPublic(dupAsset);
      }
    }

    const created = await this.prisma.referenceContent.create({
      data: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId: input.projectId,
        sourceType,
        platform,
        title: input.title?.trim() || null,
        note: input.note?.trim() || null,
        reasonForReference: input.reasonForReference?.trim() || null,
        url,
        canonicalUrl,
        assetId: input.assetId ?? null,
        referenceOnly: true,
        createdByUserId: auth.userId,
        metadata: { role: 'REFERENCE_CONTENT' },
      },
    });
    return toPublic(created);
  }

  async remove(auth: AuthContext, id: string, workspaceHint?: string): Promise<{ id: string }> {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.REFERENCE_CONTENT_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const row = await this.prisma.referenceContent.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId, deletedAt: null },
    });
    if (!row) {
      throw new AppError(ErrorCode.REFERENCE_CONTENT_NOT_FOUND);
    }
    await this.prisma.referenceContent.update({
      where: { id_tenantId: { id: row.id, tenantId: auth.tenantId } },
      data: { deletedAt: new Date() },
    });
    return { id: row.id };
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

function toPublic(row: {
  id: string;
  projectId: string;
  sourceType: string;
  platform: string | null;
  title: string | null;
  note: string | null;
  reasonForReference: string | null;
  url: string | null;
  canonicalUrl: string | null;
  assetId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ReferenceContentPublic {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceType: row.sourceType,
    sourceLabel: TYPE_LABELS[row.sourceType] ?? '爆款参考',
    platform: row.platform,
    title: row.title,
    note: row.note,
    reasonForReference: row.reasonForReference,
    url: row.url,
    canonicalUrl: row.canonicalUrl,
    assetId: row.assetId,
    referenceOnly: true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type { MarketSourceType };
