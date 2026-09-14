import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  deriveLegacyLibraryHints,
  isAssetProductionEligible,
  libraryCreateDefaults,
  pipelineAssetDefaults,
  assetSourceLabel,
  assetRightsLabel,
} from './asset-library.js';
import type { Asset } from '@prisma/client';

function base(partial: Partial<Asset>): Asset {
  return {
    id: 'a1',
    tenantId: 't1',
    workspaceId: 'w1',
    projectId: 'p1',
    type: 'IMAGE',
    status: 'READY',
    storageProvider: 'local',
    storageKey: 'k',
    originalFilename: 'a.png',
    mimeType: 'image/png',
    size: 10,
    duration: null,
    width: null,
    height: null,
    metadata: {},
    sourceType: 'PROJECT_UPLOAD',
    ownerType: 'PROJECT',
    referenceOnly: false,
    reusable: true,
    rightsStatus: 'USER_CONFIRMED',
    consentStatus: 'NOT_REQUIRED',
    libraryVisible: true,
    usedCount: 0,
    lastUsedAt: null,
    contentHash: null,
    createdByUserId: null,
    sourceUrl: null,
    provider: null,
    providerAssetId: null,
    sourceAssetId: null,
    generatedFromJobId: null,
    qualityScore: null,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...partial,
  } as Asset;
}

describe('asset-library eligibility', () => {
  it('allows ready reusable confirmed assets', () => {
    const r = isAssetProductionEligible({ asset: base({}), callerTenantId: 't1' });
    expect(r.eligible).toBe(true);
  });

  it('rejects reference / restricted / revoked / failed / cross-tenant', () => {
    expect(
      isAssetProductionEligible({ asset: base({ referenceOnly: true }), callerTenantId: 't1' }).eligible,
    ).toBe(false);
    expect(
      isAssetProductionEligible({
        asset: base({ rightsStatus: 'RESTRICTED' }),
        callerTenantId: 't1',
      }).reasonCodes,
    ).toContain('RIGHTS_RESTRICTED');
    expect(
      isAssetProductionEligible({
        asset: base({ consentStatus: 'REVOKED' }),
        callerTenantId: 't1',
      }).reasonCodes,
    ).toContain('CONSENT_REVOKED');
    expect(
      isAssetProductionEligible({ asset: base({ status: 'FAILED' }), callerTenantId: 't1' }).reasonCodes,
    ).toContain('NOT_READY');
    expect(
      isAssetProductionEligible({ asset: base({}), callerTenantId: 't2' }).reasonCodes,
    ).toContain('TENANT_MISMATCH');
  });

  it('maps legacy compose/subtitle/visual hints', () => {
    expect(deriveLegacyLibraryHints(base({ sourceType: 'UNKNOWN', metadata: { stage: 'compose' } })).sourceType).toBe(
      'FINAL_OUTPUT',
    );
    expect(deriveLegacyLibraryHints(base({ sourceType: 'UNKNOWN', type: 'SUBTITLE' })).sourceType).toBe('DERIVED');
    expect(deriveLegacyLibraryHints(base({ sourceType: 'UNKNOWN', type: 'IMAGE', metadata: { stage: 'visual' } })).libraryVisible).toBe(
      false,
    );
  });

  it('hides raw enums from user labels', () => {
    expect(assetSourceLabel('REFERENCE')).toBe('参考素材');
    expect(assetRightsLabel('USER_CONFIRMED')).toBe('用户确认可用');
    expect(assetSourceLabel('REFERENCE')).not.toBe('REFERENCE');
  });

  it('upload defaults require rights or become reference-only', () => {
    const ok = libraryCreateDefaults({ rightsConfirmed: true });
    expect(ok.rightsStatus).toBe('USER_CONFIRMED');
    expect(ok.reusable).toBe(true);
    const ref = libraryCreateDefaults({ referenceOnly: true });
    expect(ref.sourceType).toBe('REFERENCE');
    expect(ref.reusable).toBe(false);
    const noConfirm = libraryCreateDefaults({ rightsConfirmed: false });
    expect(noConfirm.rightsStatus).toBe('REFERENCE_ONLY');
    expect(noConfirm.reusable).toBe(false);
  });

  it('pipeline defaults set visibility correctly', () => {
    expect(pipelineAssetDefaults('compose').libraryVisible).toBe(true);
    expect(pipelineAssetDefaults('subtitle').libraryVisible).toBe(false);
    expect(pipelineAssetDefaults('visual').sourceType).toBe('PROVIDER_GENERATED');
  });
});

describe('content hash helper', () => {
  it('sha256 is deterministic', () => {
    const buf = Buffer.from('abc');
    const a = createHash('sha256').update(buf).digest('hex');
    const b = createHash('sha256').update(buf).digest('hex');
    expect(a).toBe(b);
  });
});
