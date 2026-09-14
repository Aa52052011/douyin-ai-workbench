import { Injectable, Logger } from '@nestjs/common';
import {
  AssetConsentStatus,
  AssetRightsStatus,
  PrismaClient,
  VoiceProfileStatus,
  VoiceProfileType,
} from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { ELIGIBILITY_REASON_LABELS, isVoiceProfileProductionEligible } from './voice-eligibility.js';
import { listSupportedVoicesPublic } from './voice.registry.js';

const TYPE_LABELS: Record<string, string> = {
  SYSTEM: '系统声音',
  CUSTOM: '我的声音',
  CLONED: '克隆声音',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
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
export class VoiceProfilesService {
  private readonly logger = new Logger(VoiceProfilesService.name);

  constructor(private readonly prisma: PrismaClient) {}

  listSystemVoices() {
    return listSupportedVoicesPublic();
  }

  async list(auth: AuthContext, workspaceHint?: string) {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const rows = await this.prisma.voiceProfile.findMany({
      where: { tenantId: auth.tenantId, workspaceId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { sampleAsset: true },
    });
    return rows.map((row) => this.toPublic(row, auth));
  }

  async get(auth: AuthContext, id: string, workspaceHint?: string) {
    return this.toPublic(await this.require(auth, id, workspaceHint), auth);
  }

  async create(
    auth: AuthContext,
    input: {
      name: string;
      type: 'CUSTOM' | 'CLONED';
      sampleAssetId?: string;
      projectId?: string;
      consentConfirmed?: boolean;
    },
    workspaceHint?: string,
  ) {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    if (input.consentConfirmed !== true) {
      throw new AppError(ErrorCode.CONSENT_REQUIRED);
    }
    const sample = input.sampleAssetId ? await this.requireSample(auth, workspaceId, input.sampleAssetId) : null;
    if (!sample) {
      throw new AppError(ErrorCode.PROFILE_SOURCE_ASSET_INVALID);
    }
    const now = new Date();
    const row = await this.prisma.voiceProfile.create({
      data: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId: input.projectId ?? sample.projectId,
        name: input.name.trim().slice(0, 80),
        type: input.type === 'CLONED' ? VoiceProfileType.CLONED : VoiceProfileType.CUSTOM,
        status: VoiceProfileStatus.DRAFT,
        sampleAssetId: sample.id,
        rightsStatus: sample.rightsStatus,
        consentStatus: AssetConsentStatus.CONFIRMED,
        consentConfirmedAt: now,
        consentConfirmedByUserId: auth.userId,
        createdByUserId: auth.userId,
        metadata: { cloneProviderConfigured: false },
      },
      include: { sampleAsset: true },
    });
    this.logger.log(
      JSON.stringify({
        event: 'voice_profile_create',
        profileId: row.id,
        type: row.type,
        status: row.status,
        consent: row.consentStatus,
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
    if (input.status === 'DISABLED') data.status = VoiceProfileStatus.DISABLED;
    if (input.consentStatus === 'REVOKED') {
      data.consentStatus = AssetConsentStatus.REVOKED;
      data.consentRevokedAt = new Date();
      data.status = VoiceProfileStatus.DISABLED;
    }
    if (input.consentStatus === 'CONFIRMED') {
      data.consentStatus = AssetConsentStatus.CONFIRMED;
      data.consentConfirmedAt = new Date();
      data.consentConfirmedByUserId = auth.userId;
      data.consentRevokedAt = null;
    }
    const row = await this.prisma.voiceProfile.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data,
      include: { sampleAsset: true },
    });
    this.logger.log(
      JSON.stringify({
        event: 'voice_profile_update',
        profileId: row.id,
        status: row.status,
        consent: row.consentStatus,
      }),
    );
    return this.toPublic(row, auth);
  }

  async remove(auth: AuthContext, id: string, workspaceHint?: string) {
    const current = await this.require(auth, id, workspaceHint);
    await this.prisma.voiceProfile.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: { deletedAt: new Date(), status: VoiceProfileStatus.DISABLED },
    });
    this.logger.log(JSON.stringify({ event: 'voice_profile_delete', profileId: current.id, status: 'DISABLED' }));
    return { id: current.id };
  }

  private async require(auth: AuthContext, id: string, workspaceHint?: string) {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    if (!isUuid(id)) throw new AppError(ErrorCode.VOICE_PROFILE_NOT_FOUND);
    const row = await this.prisma.voiceProfile.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId, deletedAt: null },
      include: { sampleAsset: true },
    });
    if (!row) throw new AppError(ErrorCode.VOICE_PROFILE_NOT_FOUND);
    return row;
  }

  private async requireSample(auth: AuthContext, workspaceId: string, assetId: string) {
    if (!isUuid(assetId)) throw new AppError(ErrorCode.PROFILE_SOURCE_ASSET_INVALID);
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId: auth.tenantId, workspaceId, deletedAt: null },
    });
    if (!asset) throw new AppError(ErrorCode.ASSET_NOT_FOUND);
    const eligibility = isVoiceProfileProductionEligible({
      profile: {
        tenantId: auth.tenantId,
        workspaceId,
        type: 'CUSTOM',
        status: 'READY',
        rightsStatus: asset.rightsStatus,
        consentStatus: AssetConsentStatus.CONFIRMED,
        sampleAssetId: asset.id,
      },
      tenantId: auth.tenantId,
      workspaceId,
      sample: asset,
    });
    if (eligibility.reasonCodes.includes('REFERENCE_SOURCE') || eligibility.reasonCodes.includes('SOURCE_ASSET_INVALID')) {
      throw new AppError(ErrorCode.PROFILE_SOURCE_ASSET_INVALID);
    }
    return asset;
  }

  private toPublic(
    row: Awaited<ReturnType<VoiceProfilesService['require']>>,
    auth: AuthContext,
  ) {
    const eligibility = isVoiceProfileProductionEligible({
      profile: row,
      tenantId: auth.tenantId,
      workspaceId: row.workspaceId,
      sample: row.sampleAsset,
    });
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      typeLabel: TYPE_LABELS[row.type] ?? '声音',
      status: row.status,
      statusLabel: STATUS_LABELS[row.status] ?? row.status,
      language: row.language,
      consentStatus: row.consentStatus,
      consentLabel: CONSENT_LABELS[row.consentStatus] ?? '待确认授权',
      rightsStatus: row.rightsStatus,
      sampleAssetId: row.sampleAssetId,
      eligible: eligibility.eligible,
      eligibilityLabels: eligibility.reasonCodes.map((c) => ELIGIBILITY_REASON_LABELS[c]),
      cloneConfigured: false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export { AssetRightsStatus };
