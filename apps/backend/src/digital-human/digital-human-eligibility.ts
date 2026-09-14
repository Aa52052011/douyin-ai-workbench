import type { Asset, AssetConsentStatus, AssetRightsStatus, AssetSourceType, AssetType } from '@prisma/client';
import { isDigitalHumanCurrentlyAvailable } from '../media/dh/digital-human-config.js';
import type { VoiceEligibilityReason } from '../voice/voice-eligibility.js';

export type DigitalHumanEligibility = { eligible: boolean; reasonCodes: VoiceEligibilityReason[] };

type ProfileLike = {
  tenantId: string;
  workspaceId: string;
  status: string;
  rightsStatus: AssetRightsStatus | string;
  consentStatus: AssetConsentStatus | string;
  deletedAt?: Date | null;
  sourceAssetId: string;
};

type SourceLike = Pick<
  Asset,
  'tenantId' | 'deletedAt' | 'status' | 'type' | 'sourceType' | 'referenceOnly' | 'rightsStatus' | 'consentStatus'
>;

const PRODUCTION_RIGHTS = new Set(['OWNED', 'LICENSED', 'USER_CONFIRMED']);
const ALLOWED_SOURCE_TYPES = new Set(['IMAGE', 'VIDEO', 'SOURCE_VIDEO', 'DIGITAL_HUMAN']);

export function isDigitalHumanProfileProductionEligible(input: {
  profile: ProfileLike;
  tenantId: string;
  workspaceId: string;
  source?: SourceLike | null;
}): DigitalHumanEligibility {
  const reasons: VoiceEligibilityReason[] = [];
  const { profile, source } = input;
  if (profile.deletedAt) reasons.push('DELETED');
  if (profile.tenantId !== input.tenantId || profile.workspaceId !== input.workspaceId) {
    reasons.push('TENANT_MISMATCH');
  }
  if (profile.status !== 'READY') reasons.push('NOT_READY');
  if (profile.consentStatus === 'REVOKED') reasons.push('CONSENT_REVOKED');
  if (profile.consentStatus !== 'CONFIRMED') reasons.push('CONSENT_REQUIRED');
  if (!PRODUCTION_RIGHTS.has(String(profile.rightsStatus))) reasons.push('RIGHTS_RESTRICTED');
  if (!isDigitalHumanCurrentlyAvailable()) reasons.push('PROVIDER_NOT_CONFIGURED');
  if (!source) {
    reasons.push('SOURCE_ASSET_INVALID');
  } else {
    if (source.deletedAt) reasons.push('DELETED');
    if (source.tenantId !== input.tenantId) reasons.push('TENANT_MISMATCH');
    if (source.status !== 'READY') reasons.push('SOURCE_ASSET_INVALID');
    if (!ALLOWED_SOURCE_TYPES.has(String(source.type))) reasons.push('SOURCE_ASSET_INVALID');
    if (source.referenceOnly || source.sourceType === ('REFERENCE' as AssetSourceType)) {
      reasons.push('REFERENCE_SOURCE');
    }
  }
  return { eligible: reasons.length === 0, reasonCodes: [...new Set(reasons)] };
}

export function isDigitalHumanSourceAllowed(source: SourceLike, tenantId: string): VoiceEligibilityReason[] {
  const reasons: VoiceEligibilityReason[] = [];
  if (source.deletedAt) reasons.push('DELETED');
  if (source.tenantId !== tenantId) reasons.push('TENANT_MISMATCH');
  if (source.status !== 'READY') reasons.push('SOURCE_ASSET_INVALID');
  if (!ALLOWED_SOURCE_TYPES.has(String(source.type as AssetType))) reasons.push('SOURCE_ASSET_INVALID');
  if (source.referenceOnly || source.sourceType === ('REFERENCE' as AssetSourceType)) reasons.push('REFERENCE_SOURCE');
  if (source.rightsStatus === 'RESTRICTED' || source.rightsStatus === 'REFERENCE_ONLY') reasons.push('RIGHTS_RESTRICTED');
  if (source.consentStatus === 'REVOKED') reasons.push('CONSENT_REVOKED');
  return reasons;
}
