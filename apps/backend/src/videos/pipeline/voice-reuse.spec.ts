import { describe, expect, it, vi } from 'vitest';
import { AssetStatus, AssetType } from '@prisma/client';
import { findReusableVoiceAsset, isReusableVoiceAsset, voiceTextFingerprint } from './voice-reuse.js';
import type { StageContext } from './stage-context.js';

const VIDEO = '44444444-4444-4444-8444-444444444444';
const GEN = 'gen-abc';

function ctx(overrides: Partial<StageContext> = {}): StageContext {
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
    plan: {
      videoId: VIDEO,
      voice: { text: '你好世界', style: 'default', language: 'zh-CN', speed: 1 },
    },
    generationVersion: GEN,
    ...overrides,
  } as unknown as StageContext;
}

describe('voice-reuse', () => {
  it('fingerprints voice text stably', () => {
    expect(voiceTextFingerprint('你好')).toBe(voiceTextFingerprint('你好'));
    expect(voiceTextFingerprint('你好')).not.toBe(voiceTextFingerprint('你好!'));
  });

  it('rejects generationVersion mismatch', async () => {
    const asset = {
      id: 'a',
      type: AssetType.AUDIO,
      status: AssetStatus.READY,
      deletedAt: null,
      tenantId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      storageKey: 'k',
      metadata: { videoId: VIDEO, generationVersion: 'other' },
    };
    expect(await isReusableVoiceAsset(ctx(), asset as never)).toBe(false);
  });

  it('rejects voiceTextHash mismatch when present', async () => {
    const asset = {
      id: 'a',
      type: AssetType.AUDIO,
      status: AssetStatus.READY,
      deletedAt: null,
      tenantId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      storageKey: 'k',
      metadata: { videoId: VIDEO, generationVersion: GEN, voiceTextHash: 'deadbeefdeadbeef' },
    };
    expect(await isReusableVoiceAsset(ctx(), asset as never)).toBe(false);
  });

  it('rejects different resolvedVoiceId', async () => {
    const asset = {
      id: 'a',
      type: AssetType.AUDIO,
      status: AssetStatus.READY,
      deletedAt: null,
      tenantId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      storageKey: 'k',
      metadata: { videoId: VIDEO, generationVersion: GEN, resolvedVoiceId: 'sys.calm' },
    };
    expect(await isReusableVoiceAsset(ctx(), asset as never)).toBe(false);
  });

  it('reuses when resolvedVoiceId matches default', async () => {
    const good = {
      id: 'voice-good',
      type: AssetType.AUDIO,
      status: AssetStatus.READY,
      deletedAt: null,
      tenantId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      storageKey: 'k',
      metadata: { videoId: VIDEO, generationVersion: GEN },
    };
    const c = ctx({
      prisma: {
        assetLink: {
          findMany: vi.fn(async () => [{ asset: good }]),
        },
      },
      storage: { exists: vi.fn(async () => true) },
    } as never);
    const found = await findReusableVoiceAsset(c);
    expect(found?.id).toBe('voice-good');
  });
});
