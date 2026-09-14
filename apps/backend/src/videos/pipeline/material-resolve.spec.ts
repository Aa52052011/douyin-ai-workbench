import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { resolveShotMaterials, toMaterialSnapshot } from './material-resolve.js';
import type { ResolverAsset, ResolverShotInput } from './material-resolve.types.js';

const TENANT = 't1';
const WS = 'w1';
const PROJECT = 'p1';

function asset(partial: Partial<ResolverAsset> & { id: string; type: string }): ResolverAsset {
  return {
    tenantId: TENANT,
    workspaceId: WS,
    projectId: PROJECT,
    status: 'READY',
    duration: 10,
    width: 1080,
    height: 1920,
    sourceType: 'USER_UPLOAD',
    referenceOnly: false,
    reusable: true,
    rightsStatus: 'OWNED',
    consentStatus: 'NOT_REQUIRED',
    deletedAt: null,
    storageKey: `key/${partial.id}`,
    usedCount: 0,
    ...partial,
  };
}

function shot(sequence: number, extra: Partial<ResolverShotInput> = {}): ResolverShotInput {
  return {
    sequence,
    shotPurpose: sequence === 1 ? 'HOOK' : 'OTHER',
    requestedDurationMs: 3000,
    ...extra,
  };
}

const caps = { aiImage: true, aiVideo: false, digitalHuman: false };

describe('material resolver', () => {
  it('uses selected eligible asset', () => {
    const img = asset({ id: 'img1', type: 'IMAGE' });
    const shots = resolveShotMaterials({
      shots: [shot(1, { selectedAssetId: 'img1' })],
      candidates: [img],
      tenantId: TENANT,
      workspaceId: WS,
      projectId: PROJECT,
      capabilities: caps,
    });
    assert.equal(shots[0]?.sourceKind, 'EXISTING_ASSET');
    assert.equal(shots[0]?.assetId, 'img1');
    assert.equal(shots[0]?.generationRequired, false);
    assert.equal(shots[0]?.fallbackLevel, 0);
  });

  it('falls back when selected is invalid', () => {
    const bad = asset({ id: 'bad', type: 'IMAGE', status: 'FAILED' });
    const shots = resolveShotMaterials({
      shots: [shot(1, { selectedAssetId: 'bad' })],
      candidates: [bad],
      tenantId: TENANT,
      workspaceId: WS,
      projectId: PROJECT,
      capabilities: caps,
    });
    assert.equal(shots[0]?.sourceKind, 'AI_IMAGE');
    assert.ok(shots[0]?.resolutionWarnings.includes('SELECTED_ASSET_INVALID'));
  });

  it('excludes reference assets even when selected', () => {
    const ref = asset({ id: 'ref', type: 'VIDEO', referenceOnly: true, sourceType: 'REFERENCE' });
    const shots = resolveShotMaterials({
      shots: [shot(1, { selectedAssetId: 'ref' })],
      candidates: [ref],
      tenantId: TENANT,
      workspaceId: WS,
      projectId: PROJECT,
      capabilities: caps,
    });
    assert.notEqual(shots[0]?.assetId, 'ref');
    assert.ok(shots[0]?.resolutionWarnings.includes('REFERENCE_ASSET_BLOCKED'));
  });

  it('excludes deleted and wrong media type and cross-tenant', () => {
    const deleted = asset({ id: 'd', type: 'IMAGE', deletedAt: new Date() });
    const audio = asset({ id: 'a', type: 'AUDIO' });
    const other = asset({ id: 'x', type: 'IMAGE', tenantId: 'other' });
    const shots = resolveShotMaterials({
      shots: [shot(1, { selectedAssetId: 'd' }), shot(2, { selectedAssetId: 'a' }), shot(3, { selectedAssetId: 'x' })],
      candidates: [deleted, audio, other],
      tenantId: TENANT,
      workspaceId: WS,
      projectId: PROJECT,
      capabilities: caps,
    });
    assert.equal(shots.every((item) => item.sourceKind === 'AI_IMAGE'), true);
  });

  it('ignores unsupported AI_VIDEO and DIGITAL_HUMAN as execution result', () => {
    const shots = resolveShotMaterials({
      shots: [shot(1)],
      candidates: [],
      tenantId: TENANT,
      workspaceId: WS,
      projectId: PROJECT,
      capabilities: caps,
    });
    assert.equal(shots[0]?.sourceKind, 'AI_IMAGE');
    assert.ok(shots[0]?.resolutionWarnings.includes('UNSUPPORTED_AI_VIDEO'));
    assert.ok(shots[0]?.resolutionWarnings.includes('UNSUPPORTED_DIGITAL_HUMAN'));
  });

  it('trims long video and freezes short video', () => {
    const long = asset({ id: 'v1', type: 'VIDEO', duration: 10 });
    const short = asset({ id: 'v2', type: 'VIDEO', duration: 2 });
    const shots = resolveShotMaterials({
      shots: [shot(1, { selectedAssetId: 'v1', requestedDurationMs: 3000 }), shot(2, { selectedAssetId: 'v2', requestedDurationMs: 5000 })],
      candidates: [long, short],
      tenantId: TENANT,
      workspaceId: WS,
      projectId: PROJECT,
      capabilities: caps,
    });
    assert.equal(shots[0]?.sourceEndMs, 3000);
    assert.equal(shots[1]?.sourceEndMs, 2000);
    assert.equal(shots[1]?.freezePadMs, 3000);
    assert.ok(shots[1]?.resolutionWarnings.includes('VIDEO_TOO_SHORT'));
  });

  it('hashes stably and counts reuse vs generation', () => {
    const img = asset({ id: 'img1', type: 'IMAGE' });
    const a = toMaterialSnapshot(
      resolveShotMaterials({
        shots: [shot(1, { selectedAssetId: 'img1' }), shot(2)],
        candidates: [img],
        tenantId: TENANT,
        workspaceId: WS,
        projectId: PROJECT,
        capabilities: caps,
      }),
      'gen-1',
    );
    const b = toMaterialSnapshot(
      resolveShotMaterials({
        shots: [shot(1, { selectedAssetId: 'img1' }), shot(2)],
        candidates: [img],
        tenantId: TENANT,
        workspaceId: WS,
        projectId: PROJECT,
        capabilities: caps,
      }),
      'gen-1',
    );
    assert.equal(a.materialHash, b.materialHash);
    assert.equal(a.reusedAssetCount, 2);
    assert.equal(a.generatedShotCount, 0);
  });

  it('spreads preferred IMAGE and VIDEO across shots', () => {
    const img = asset({ id: 'img1', type: 'IMAGE' });
    const vid = asset({ id: 'vid1', type: 'VIDEO', duration: 2 });
    const shots = resolveShotMaterials({
      shots: [
        shot(1, { selectedAssetId: 'vid1' }),
        shot(2, { selectedAssetId: 'vid1' }),
        shot(3, { selectedAssetId: 'vid1' }),
      ],
      candidates: [img, vid],
      preferredAssetIds: ['img1', 'vid1'],
      tenantId: TENANT,
      workspaceId: WS,
      projectId: PROJECT,
      capabilities: caps,
    });
    const types = new Set(shots.map((item) => item.assetType));
    assert.equal(types.has('IMAGE'), true);
    assert.equal(types.has('VIDEO'), true);
    assert.equal(shots.every((item) => item.sourceKind === 'EXISTING_ASSET'), true);
  });

  it('staggers repeated video clip windows', () => {
    const vid = asset({ id: 'vid1', type: 'VIDEO', duration: 30 });
    const shots = resolveShotMaterials({
      shots: [shot(1, { selectedAssetId: 'vid1', requestedDurationMs: 5000 }), shot(2, { selectedAssetId: 'vid1', requestedDurationMs: 5000 })],
      candidates: [vid],
      tenantId: TENANT,
      workspaceId: WS,
      projectId: PROJECT,
      capabilities: { aiImage: false, aiVideo: false, digitalHuman: false },
    });
    assert.equal(shots[0]?.sourceStartMs, 0);
    assert.ok((shots[1]?.sourceStartMs ?? 0) >= 4000);
  });
});
