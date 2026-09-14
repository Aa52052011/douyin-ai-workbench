import { Injectable, Logger } from '@nestjs/common';
import { AssetConsentStatus, DigitalHumanProfileStatus, PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { ELIGIBILITY_REASON_LABELS } from '../voice/voice-eligibility.js';
import {
  isDigitalHumanProfileProductionEligible,
  isDigitalHumanSourceAllowed,
} from './digital-human-eligibility.js';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  REGISTERING: '注册中',
  READY: '已就绪',
  FAILED: '失败',
  DISABLED: '已停用',
};
const CONSENT_LABELS: Record<string, string> = {
  NOT_REQUIRED: '无需授权',
  PENDING: '待确认授权',
  CONFIRMED: '已确认授权',
  REVOKED: '授权已撤回',
};

@Injectable()
export class DigitalHumanProfilesService {
  private readonly logger = new Logger(DigitalHumanProfilesService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async list(auth: AuthContext, workspaceHint?: string) {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const rows = await this.prisma.digitalHumanProfile.findMany({
      where: { tenantId: auth.tenantId, workspaceId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: { sourceAsset: true },
    });
    return rows.map((row) => this.toPublic(row, auth));
  }

  async get(auth: AuthContext, id: string, workspaceHint?: string) {
    return this.toPublic(await this.require(auth, id, workspaceHint), auth);
  }

  async create(
    auth: AuthContext,
    input: { name: string; sourceAssetId: string; projectId?: string; consentConfirmed?: boolean },
    workspaceHint?: string,
  ) {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    if (input.consentConfirmed !== true) {
      throw new AppError(ErrorCode.CONSENT_REQUIRED);
    }
    if (!isUuid(input.sourceAssetId)) throw new AppError(ErrorCode.PROFILE_SOURCE_ASSET_INVALID);
    const source = await this.prisma.asset.findFirst({
      where: { id: input.sourceAssetId, tenantId: auth.tenantId, workspaceId, deletedAt: null },
    });
    if (!source) throw new AppError(ErrorCode.ASSET_NOT_FOUND);
    const denied = isDigitalHumanSourceAllowed(source, auth.tenantId);
    if (denied.length) {
      throw new AppError(ErrorCode.PROFILE_SOURCE_ASSET_INVALID);
    }
    const now = new Date();
    const row = await this.prisma.digitalHumanProfile.create({
      data: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId: input.projectId ?? source.projectId,
        name: input.name.trim().slice(0, 80),
        status: DigitalHumanProfileStatus.DRAFT,
        sourceAssetId: source.id,
        rightsStatus: source.rightsStatus,
        consentStatus: AssetConsentStatus.CONFIRMED,
        consentConfirmedAt: now,
        consentConfirmedByUserId: auth.userId,
        createdByUserId: auth.userId,
        metadata: { providerConfigured: false },
      },
      include: { sourceAsset: true },
    });
    this.logger.log(
      JSON.stringify({
        event: 'digital_human_profile_create',
        profileId: row.id,
        status: row.status,
        consent: row.consentStatus,
        provider: row.provider ?? 'none',
      }),
    );
    return this.toPublic(row, auth);
  }

  async patch(
    auth: AuthContext,
    id: string,
    input: { name?: string; consentStatus?: 'CONFIRMED' | 'REVOKED'; status?: 'DISABLED' },
    workspaceHint?: string,
  ) {
    const current = await this.require(auth, id, workspaceHint);
    const data: Record<string, unknown> = {};
    if (input.name) data.name = input.name.trim().slice(0, 80);
    if (input.status === 'DISABLED') data.status = DigitalHumanProfileStatus.DISABLED;
    if (input.consentStatus === 'REVOKED') {
      data.consentStatus = AssetConsentStatus.REVOKED;
      data.consentRevokedAt = new Date();
      data.status = DigitalHumanProfileStatus.DISABLED;
    }
    if (input.consentStatus === 'CONFIRMED') {
      data.consentStatus = AssetConsentStatus.CONFIRMED;
      data.consentConfirmedAt = new Date();
      data.consentConfirmedByUserId = auth.userId;
    }
    const row = await this.prisma.digitalHumanProfile.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data,
      include: { sourceAsset: true },
    });
    this.logger.log(
      JSON.stringify({
        event: 'digital_human_profile_update',
        profileId: row.id,
        status: row.status,
        consent: row.consentStatus,
      }),
    );
    return this.toPublic(row, auth);
  }

  async remove(auth: AuthContext, id: string, workspaceHint?: string) {
    const current = await this.require(auth, id, workspaceHint);
    await this.prisma.digitalHumanProfile.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: { deletedAt: new Date(), status: DigitalHumanProfileStatus.DISABLED },
    });
    this.logger.log(JSON.stringify({ event: 'digital_human_profile_delete', profileId: current.id }));
    return { id: current.id };
  }

  async listEligibleIds(auth: AuthContext, workspaceHint?: string): Promise<string[]> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const rows = await this.prisma.digitalHumanProfile.findMany({
      where: { tenantId: auth.tenantId, workspaceId, deletedAt: null },
      take: 8,
      include: { sourceAsset: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows
      .filter(
        (row) =>
          isDigitalHumanProfileProductionEligible({
            profile: row,
            tenantId: auth.tenantId,
            workspaceId,
            source: row.sourceAsset,
          }).eligible,
      )
      .map((row) => row.id)
      .slice(0, 5);
  }

  private async require(auth: AuthContext, id: string, workspaceHint?: string) {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    if (!isUuid(id)) throw new AppError(ErrorCode.DIGITAL_HUMAN_PROFILE_NOT_FOUND);
    const row = await this.prisma.digitalHumanProfile.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId, deletedAt: null },
      include: { sourceAsset: true },
    });
    if (!row) throw new AppError(ErrorCode.DIGITAL_HUMAN_PROFILE_NOT_FOUND);
    return row;
  }

  private toPublic(row: Awaited<ReturnType<DigitalHumanProfilesService['require']>>, auth: AuthContext) {
    const eligibility = isDigitalHumanProfileProductionEligible({
      profile: row,
      tenantId: auth.tenantId,
      workspaceId: row.workspaceId,
      source: row.sourceAsset,
    });
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      statusLabel: STATUS_LABELS[row.status] ?? row.status,
      consentStatus: row.consentStatus,
      consentLabel: CONSENT_LABELS[row.consentStatus] ?? '待确认授权',
      rightsStatus: row.rightsStatus,
      sourceAssetId: row.sourceAssetId,
      sourceTypeLabel: row.sourceAsset?.type === 'VIDEO' || row.sourceAsset?.type === 'SOURCE_VIDEO' ? '视频人像' : '人像素材',
      providerConfigured: false,
      providerStatusLabel: '数字人生成服务尚未配置',
      eligible: eligibility.eligible,
      eligibilityLabels: eligibility.reasonCodes.map((c) => ELIGIBILITY_REASON_LABELS[c]),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
