/**
 * Step 13.3 — Asset Library eligibility / labels / legacy defaults.
 * Deterministic; no LLM.
 */

import type {
  Asset,
  AssetConsentStatus,
  AssetRightsStatus,
  AssetSourceType,
  AssetStatus,
} from '@prisma/client';

export type ProductionEligibilityReason =
  | 'NOT_READY'
  | 'REFERENCE_ONLY'
  | 'NOT_REUSABLE'
  | 'RIGHTS_RESTRICTED'
  | 'CONSENT_REVOKED'
  | 'TENANT_MISMATCH'
  | 'DELETED'
  | 'NOT_LIBRARY_VISIBLE';

export type ProductionEligibility = {
  eligible: boolean;
  reasonCodes: ProductionEligibilityReason[];
};

export type AssetLibraryView = {
  id: string;
  projectId: string;
  type: string;
  status: string;
  originalFilename: string | null;
  mimeType: string | null;
  size: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  sourceType: string;
  sourceLabel: string;
  ownerType: string;
  referenceOnly: boolean;
  reusable: boolean;
  rightsStatus: string;
  rightsLabel: string;
  consentStatus: string;
  libraryVisible: boolean;
  usedCount: number;
  lastUsedAt: Date | null;
  contentPath: string;
  createdAt: Date;
  updatedAt: Date;
};

const SOURCE_LABELS: Record<string, string> = {
  USER_UPLOAD: '用户上传',
  PROJECT_UPLOAD: '项目上传',
  SYSTEM_GENERATED: '系统生成',
  PROVIDER_GENERATED: '服务商生成',
  REFERENCE: '参考素材',
  SYSTEM_LIBRARY: '系统素材库',
  DERIVED: '派生素材',
  FINAL_OUTPUT: '成片输出',
  UNKNOWN: '未分类',
};

const RIGHTS_LABELS: Record<string, string> = {
  OWNED: '自有',
  LICENSED: '已授权',
  USER_CONFIRMED: '用户确认可用',
  REFERENCE_ONLY: '仅参考',
  UNKNOWN: '未确认',
  RESTRICTED: '受限',
};

const TYPE_LABELS: Record<string, string> = {
  IMAGE: '图片',
  VIDEO: '视频',
  AUDIO: '音频',
  SUBTITLE: '字幕',
  DOCUMENT: '文档',
  SOURCE_VIDEO: '源视频',
  SOURCE_AUDIO: '源音频',
  VOICE_SAMPLE: '声音样本',
  LOGO: 'Logo',
  BROLL: '空镜',
  DIGITAL_HUMAN: '数字人',
  FINAL_VIDEO: '成片',
  OTHER: '其它',
};

export function assetSourceLabel(code: string): string {
  return SOURCE_LABELS[code] ?? '未分类';
}

export function assetRightsLabel(code: string): string {
  return RIGHTS_LABELS[code] ?? '未确认';
}

export function assetTypeLabel(code: string): string {
  return TYPE_LABELS[code] ?? '其它';
}

/** Lazy defaults for rc.2 rows that still have UNKNOWN / libraryVisible=false. */
export function deriveLegacyLibraryHints(asset: Pick<Asset, 'type' | 'sourceType' | 'metadata'>): {
  sourceType: AssetSourceType;
  reusable: boolean;
  referenceOnly: boolean;
  rightsStatus: AssetRightsStatus;
  libraryVisible: boolean;
} {
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const stage = typeof meta.stage === 'string' ? meta.stage : '';
  if (asset.sourceType !== 'UNKNOWN') {
    return {
      sourceType: asset.sourceType,
      reusable: true,
      referenceOnly: asset.sourceType === 'REFERENCE',
      rightsStatus: asset.sourceType === 'REFERENCE' ? 'REFERENCE_ONLY' : 'UNKNOWN',
      libraryVisible: asset.sourceType === 'FINAL_OUTPUT' || asset.sourceType === 'USER_UPLOAD' || asset.sourceType === 'PROJECT_UPLOAD' || asset.sourceType === 'REFERENCE',
    };
  }
  if (stage === 'compose' || asset.type === 'FINAL_VIDEO') {
    return {
      sourceType: 'FINAL_OUTPUT',
      reusable: false,
      referenceOnly: false,
      rightsStatus: 'OWNED',
      libraryVisible: true,
    };
  }
  if (stage === 'subtitle' || asset.type === 'SUBTITLE') {
    return {
      sourceType: 'DERIVED',
      reusable: false,
      referenceOnly: false,
      rightsStatus: 'UNKNOWN',
      libraryVisible: false,
    };
  }
  if (stage === 'visual' || stage === 'voice' || asset.type === 'IMAGE' || asset.type === 'AUDIO') {
    return {
      sourceType: 'PROVIDER_GENERATED',
      reusable: true,
      referenceOnly: false,
      rightsStatus: 'UNKNOWN',
      libraryVisible: false,
    };
  }
  return {
    sourceType: 'UNKNOWN',
    reusable: true,
    referenceOnly: false,
    rightsStatus: 'UNKNOWN',
    libraryVisible: false,
  };
}

export function isAssetProductionEligible(input: {
  asset: Pick<
    Asset,
    | 'tenantId'
    | 'status'
    | 'deletedAt'
    | 'referenceOnly'
    | 'reusable'
    | 'rightsStatus'
    | 'consentStatus'
    | 'sourceType'
  >;
  callerTenantId: string;
  /** When true, also require libraryVisible (library pickers). Default false for pipeline internal reuse. */
  requireLibraryVisible?: boolean;
  libraryVisible?: boolean;
}): ProductionEligibility {
  const reasons: ProductionEligibilityReason[] = [];
  const { asset } = input;
  if (asset.tenantId !== input.callerTenantId) {
    reasons.push('TENANT_MISMATCH');
  }
  if (asset.deletedAt) {
    reasons.push('DELETED');
  }
  if (asset.status !== ('READY' as AssetStatus)) {
    reasons.push('NOT_READY');
  }
  if (asset.referenceOnly || asset.sourceType === 'REFERENCE') {
    reasons.push('REFERENCE_ONLY');
  }
  if (!asset.reusable) {
    reasons.push('NOT_REUSABLE');
  }
  if (asset.rightsStatus === 'RESTRICTED' || asset.rightsStatus === 'REFERENCE_ONLY') {
    reasons.push('RIGHTS_RESTRICTED');
  }
  if (asset.consentStatus === ('REVOKED' as AssetConsentStatus)) {
    reasons.push('CONSENT_REVOKED');
  }
  if (input.requireLibraryVisible && input.libraryVisible === false) {
    reasons.push('NOT_LIBRARY_VISIBLE');
  }
  return { eligible: reasons.length === 0, reasonCodes: reasons };
}

export function toAssetLibraryView(asset: Asset): AssetLibraryView {
  const hints =
    asset.sourceType === 'UNKNOWN'
      ? deriveLegacyLibraryHints(asset)
      : {
          sourceType: asset.sourceType,
          reusable: asset.reusable,
          referenceOnly: asset.referenceOnly,
          rightsStatus: asset.rightsStatus,
          libraryVisible: asset.libraryVisible,
        };
  const sourceType = asset.sourceType === 'UNKNOWN' ? hints.sourceType : asset.sourceType;
  const rightsStatus = asset.rightsStatus === 'UNKNOWN' && hints.rightsStatus !== 'UNKNOWN' ? hints.rightsStatus : asset.rightsStatus;
  return {
    id: asset.id,
    projectId: asset.projectId,
    type: asset.type,
    status: asset.status,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    size: asset.size,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    sourceType,
    sourceLabel: assetSourceLabel(sourceType),
    ownerType: asset.ownerType,
    referenceOnly: asset.referenceOnly || sourceType === 'REFERENCE',
    reusable: asset.reusable && !asset.referenceOnly && sourceType !== 'REFERENCE',
    rightsStatus,
    rightsLabel: assetRightsLabel(rightsStatus),
    consentStatus: asset.consentStatus,
    libraryVisible: asset.libraryVisible || hints.libraryVisible,
    usedCount: asset.usedCount,
    lastUsedAt: asset.lastUsedAt,
    contentPath: `/assets/${asset.id}/content`,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

export function libraryCreateDefaults(input: {
  referenceOnly?: boolean;
  rightsConfirmed?: boolean;
  createdByUserId?: string;
}): {
  sourceType: AssetSourceType;
  ownerType: 'PROJECT';
  referenceOnly: boolean;
  reusable: boolean;
  rightsStatus: AssetRightsStatus;
  consentStatus: AssetConsentStatus;
  libraryVisible: boolean;
  createdByUserId?: string;
} {
  const referenceOnly = Boolean(input.referenceOnly);
  const rightsConfirmed = Boolean(input.rightsConfirmed);
  return {
    sourceType: referenceOnly ? 'REFERENCE' : 'PROJECT_UPLOAD',
    ownerType: 'PROJECT',
    referenceOnly,
    reusable: !referenceOnly && rightsConfirmed,
    rightsStatus: referenceOnly
      ? 'REFERENCE_ONLY'
      : rightsConfirmed
        ? 'USER_CONFIRMED'
        : 'REFERENCE_ONLY',
    consentStatus: 'NOT_REQUIRED',
    libraryVisible: true,
    createdByUserId: input.createdByUserId,
  };
}

export function pipelineAssetDefaults(kind: 'visual' | 'voice' | 'subtitle' | 'compose'): {
  sourceType: AssetSourceType;
  ownerType: 'PROJECT';
  referenceOnly: boolean;
  reusable: boolean;
  rightsStatus: AssetRightsStatus;
  consentStatus: AssetConsentStatus;
  libraryVisible: boolean;
} {
  if (kind === 'compose') {
    return {
      sourceType: 'FINAL_OUTPUT',
      ownerType: 'PROJECT',
      referenceOnly: false,
      reusable: false,
      rightsStatus: 'OWNED',
      consentStatus: 'NOT_REQUIRED',
      libraryVisible: true,
    };
  }
  if (kind === 'subtitle') {
    return {
      sourceType: 'DERIVED',
      ownerType: 'PROJECT',
      referenceOnly: false,
      reusable: false,
      rightsStatus: 'UNKNOWN',
      consentStatus: 'NOT_REQUIRED',
      libraryVisible: false,
    };
  }
  return {
    sourceType: 'PROVIDER_GENERATED',
    ownerType: 'PROJECT',
    referenceOnly: false,
    reusable: true,
    rightsStatus: 'UNKNOWN',
    consentStatus: 'NOT_REQUIRED',
    libraryVisible: false,
  };
}
