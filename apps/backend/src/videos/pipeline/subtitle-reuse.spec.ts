import { describe, expect, it, vi } from 'vitest';
import { AssetStatus, AssetType } from '@prisma/client';
import { findReusableSubtitleAsset, isReusableSubtitleAsset } from './subtitle-reuse.js';
import type { StageContext } from './stage-context.js';

const VIDEO = '44444444-4444-4444-8444-444444444444';
const GEN = 'gen-abc';
const VOICE = '55555555-5555-4555-8555-555555555555';

function ctx(): StageContext {
  return {
    prisma: {
      assetLink: { findMany: vi.fn(async () => []) },
    },
    storage: { exists: vi.fn(async () => true) },
    job: {
      tenantId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
    },
    plan: { videoId: VIDEO },
    generationVersion: GEN,
  } as unknown as StageContext;
}

describe('subtitle-reuse', () => {
  it('rejects voiceAssetId mismatch', async () => {
    const asset = {
      id: 's',
      type: AssetType.SUBTITLE,
      status: AssetStatus.READY,
      deletedAt: null,
      tenantId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      storageKey: 'k',
      metadata: { videoId: VIDEO, generationVersion: GEN, voiceAssetId: 'other-voice' },
    };
    expect(
      await isReusableSubtitleAsset(ctx(), asset as never, { assetId: VOICE, durationExact: 60 }),
    ).toBe(false);
  });

  it('allows legacy subtitle without voiceAssetId when generationVersion matches', async () => {
    const asset = {
      id: 's',
      type: AssetType.SUBTITLE,
      status: AssetStatus.READY,
      deletedAt: null,
      tenantId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      storageKey: 'k',
      metadata: { videoId: VIDEO, generationVersion: GEN },
    };
    expect(
      await isReusableSubtitleAsset(ctx(), asset as never, { assetId: VOICE, durationExact: 60 }),
    ).toBe(true);
  });

  it('finds newest compatible subtitle', async () => {
    const good = {
      id: 'sub-good',
      type: AssetType.SUBTITLE,
      status: AssetStatus.READY,
      deletedAt: null,
      tenantId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      storageKey: 'k',
      metadata: { videoId: VIDEO, generationVersion: GEN, voiceAssetId: VOICE, voiceDurationExact: 60.7 },
    };
    const c = {
      ...ctx(),
      prisma: { assetLink: { findMany: vi.fn(async () => [{ asset: good }]) } },
      storage: { exists: vi.fn(async () => true) },
    } as unknown as StageContext;
    const found = await findReusableSubtitleAsset(c, { assetId: VOICE, durationExact: 60.7 });
    expect(found?.id).toBe('sub-good');
  });
});
