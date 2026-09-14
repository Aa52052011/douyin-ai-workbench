import type { Asset, AssetConsentStatus, AssetRightsStatus, AssetSourceType, AssetType } from '@prisma/client';
import { isVoiceCloneCurrentlyAvailable } from '../media/voice-clone/voice-clone-config.js';
import { isSystemVoiceId } from './voice.registry.js';

export const VOICE_ELIGIBILITY_REASONS = [
  'NOT_READY',
  'TENANT_MISMATCH',
  'RIGHTS_RESTRICTED',
  'CONSENT_REQUIRED',
  'CONSENT_REVOKED',
  'REFERENCE_SOURCE',
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_UNSUPPORTED',
  'SOURCE_ASSET_INVALID',
  'DELETED',
] as const;
export type VoiceEligibilityReason = (typeof VOICE_ELIGIBILITY_REASONS)[number];

export const ELIGIBILITY_REASON_LABELS: Record<VoiceEligibilityReason, string> = {
  NOT_READY: '尚未就绪',
  TENANT_MISMATCH: '不属于当前工作空间',
  RIGHTS_RESTRICTED: '权利状态不允许用于制作',
  CONSENT_REQUIRED: '需要明确授权确认',
  CONSENT_REVOKED: '授权已撤回',
  REFERENCE_SOURCE: '参考素材不能用于克隆或定制声音',
  PROVIDER_NOT_CONFIGURED: '相关服务尚未配置',
  PROVIDER_UNSUPPORTED: '当前能力不支持',
  SOURCE_ASSET_INVALID: '来源素材无效',
  DELETED: '已删除',
};

export type VoiceEligibility = { eligible: boolean; reasonCodes: VoiceEligibilityReason[] };

type VoiceLike = {
  tenantId: string;
  workspaceId: string;
  type: string;
  status: string;
  rightsStatus: AssetRightsStatus | string;
  consentStatus: AssetConsentStatus | string;
  deletedAt?: Date | null;
  sampleAssetId?: string | null;
};

type SampleLike = Pick<
  Asset,
  'tenantId' | 'deletedAt' | 'status' | 'type' | 'sourceType' | 'referenceOnly' | 'rightsStatus' | 'consentStatus'
>;

const PRODUCTION_RIGHTS = new Set(['OWNED', 'LICENSED', 'USER_CONFIRMED']);

export function isVoiceProfileProductionEligible(input: {
  profile: VoiceLike;
  tenantId: string;
  workspaceId: string;
  sample?: SampleLike | null;
}): VoiceEligibility {
  const reasons: VoiceEligibilityReason[] = [];
  const { profile, sample } = input;
  if (profile.deletedAt) reasons.push('DELETED');
  if (profile.tenantId !== input.tenantId || profile.workspaceId !== input.workspaceId) {
    reasons.push('TENANT_MISMATCH');
  }
  if (isSystemVoiceId(profile.type === 'SYSTEM' ? 'sys.default' : '') && profile.type === 'SYSTEM') {
    return { eligible: reasons.length === 0, reasonCodes: reasons };
  }
  if (profile.type === 'SYSTEM') {
    return { eligible: reasons.length === 0, reasonCodes: reasons };
  }
  if (profile.status !== 'READY' && profile.status !== 'DRAFT') {
    /* custom/clone production requires READY */
  }
  if (profile.type === 'CUSTOM' || profile.type === 'CLONED') {
    if (profile.status !== 'READY') reasons.push('NOT_READY');
    if (profile.consentStatus === 'REVOKED') reasons.push('CONSENT_REVOKED');
    if (profile.consentStatus !== 'CONFIRMED') reasons.push('CONSENT_REQUIRED');
    if (!PRODUCTION_RIGHTS.has(String(profile.rightsStatus))) reasons.push('RIGHTS_RESTRICTED');
    if (profile.type === 'CLONED' && !isVoiceCloneCurrentlyAvailable()) {
      reasons.push('PROVIDER_NOT_CONFIGURED');
    }
    if (!sample) {
      reasons.push('SOURCE_ASSET_INVALID');
    } else {
      if (sample.deletedAt) reasons.push('DELETED');
      if (sample.tenantId !== input.tenantId) reasons.push('TENANT_MISMATCH');
      if (sample.status !== 'READY') reasons.push('SOURCE_ASSET_INVALID');
      if (sample.type !== ('VOICE_SAMPLE' as AssetType) && sample.type !== ('AUDIO' as AssetType) && sample.type !== ('SOURCE_AUDIO' as AssetType)) {
        reasons.push('SOURCE_ASSET_INVALID');
      }
      if (sample.referenceOnly || sample.sourceType === ('REFERENCE' as AssetSourceType)) {
        reasons.push('REFERENCE_SOURCE');
      }
    }
  }
  return { eligible: reasons.length === 0, reasonCodes: [...new Set(reasons)] };
}
