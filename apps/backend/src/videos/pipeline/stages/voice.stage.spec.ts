import { describe, expect, it, vi } from 'vitest';
import { AssetStatus, AssetType } from '@prisma/client';
import { filenameForAudioMime } from '../../../media/audio/audio-format.js';
import { VoiceGenerationStage } from './voice.stage.js';
import type { TtsProvider } from '../../../media/providers/media-provider.types.js';
import type { StageContext } from '../stage-context.js';

const KEY =
  'v1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('VoiceGenerationStage', () => {
  it('creates an AUDIO asset with mime-matching filename and usage', async () => {
    const tts: TtsProvider = {
      id: 'openai-tts',
      async synthesize() {
        return {
          storageKey: KEY,
          duration: 3,
          mimeType: 'audio/mpeg',
          size: 128,
          usage: { inputCharacters: 9, audioSeconds: 3, provider: 'openai-tts', model: 'test-model' },
        };
      },
    };
    const created: unknown[] = [];
    const ctx = {
      prisma: {
        asset: {
          create: vi.fn(async ({ data }: { data: unknown }) => {
            created.push(data);
            return data;
          }),
          findFirst: vi.fn(),
        },
        assetLink: {
          create: vi.fn(async () => ({})),
          findMany: vi.fn(async () => []),
        },
      },
      storage: { delete: vi.fn(), exists: vi.fn() },
      job: {
        id: '11111111-1111-4111-8111-111111111111',
        tenantId: '11111111-1111-4111-8111-111111111111',
        workspaceId: '22222222-2222-4222-8222-222222222222',
        projectId: '33333333-3333-4333-8333-333333333333',
        output: {},
      },
      plan: {
        videoId: '44444444-4444-4444-8444-444444444444',
        voice: { text: '你好世界', style: '冷静、中速、不鸡血', language: 'zh-CN', speed: 1 },
      },
      generationVersion: 'abc',
    } as unknown as StageContext;
    const stage = new VoiceGenerationStage(tts);
    const result = await stage.run(ctx);
    expect(result.duration).toBe(3);
    expect(result.durationExact).toBe(3);
    expect(result.usage?.audioCharacters).toBe(9);
    expect(created[0]).toMatchObject({
      type: AssetType.AUDIO,
      status: AssetStatus.READY,
      mimeType: 'audio/mpeg',
      originalFilename: 'voice.mp3',
      duration: 3,
    });
    expect(filenameForAudioMime('audio/mpeg')).toBe('voice.mp3');
    expect(JSON.stringify(created[0])).not.toContain('Authorization');
    expect((created[0] as { metadata: { provider: string } }).metadata.provider).toBe('openai-tts');
  });

  it('skips the provider when a READY voice asset still exists', async () => {
    const synthesize = vi.fn();
    const tts = { id: 'openai-tts', synthesize } as unknown as TtsProvider;
    const ctx = {
      prisma: {
        asset: {
          findFirst: vi.fn(async () => ({
            id: '55555555-5555-4555-8555-555555555555',
            duration: 4,
            status: AssetStatus.READY,
            deletedAt: null,
            storageKey: KEY,
          })),
        },
      },
      storage: { exists: vi.fn(async () => true) },
      job: {
        tenantId: '11111111-1111-4111-8111-111111111111',
        output: { stages: { voice: { assetIds: ['55555555-5555-4555-8555-555555555555'], duration: 4 } } },
      },
      plan: { voice: { text: 'x', style: 'default', language: 'zh-CN', speed: 1 } },
      generationVersion: 'abc',
    } as unknown as StageContext;
    const result = await new VoiceGenerationStage(tts).run(ctx);
    expect(synthesize).not.toHaveBeenCalled();
    expect(result.duration).toBe(4);
  });

  it('does not start TTS metering when reusing a READY voice asset', async () => {
    const synthesize = vi.fn();
    const startUsage = vi.fn();
    const tts = { id: 'openai-tts', synthesize } as unknown as TtsProvider;
    const metering = { startUsage, completeUsage: vi.fn(), failUsage: vi.fn() };
    const ctx = {
      prisma: {
        asset: {
          findFirst: vi.fn(async () => ({
            id: '55555555-5555-4555-8555-555555555555',
            duration: 4,
            status: AssetStatus.READY,
            deletedAt: null,
            storageKey: KEY,
          })),
        },
      },
      storage: { exists: vi.fn(async () => true) },
      job: {
        tenantId: '11111111-1111-4111-8111-111111111111',
        output: { stages: { voice: { assetIds: ['55555555-5555-4555-8555-555555555555'], duration: 4 } } },
      },
      plan: { voice: { text: 'x', style: 'default', language: 'zh-CN', speed: 1 } },
      generationVersion: 'abc',
    } as unknown as StageContext;
    await new VoiceGenerationStage(tts, metering as never).run(ctx);
    expect(synthesize).not.toHaveBeenCalled();
    expect(startUsage).not.toHaveBeenCalled();
  });
});
