import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseWavHeader } from '../audio/silent-wav.js';
import { wavIsAudible, wavPcmPeak } from '../audio/wav-pcm.js';
import { LocalStorageProvider } from '../storage/local-storage.provider.js';
import { StorageService } from '../storage/storage.service.js';
import { MockTtsProvider } from './mock-tts.provider.js';

describe('MockTtsProvider WAV', () => {
  let root: string;
  let previousRoot: string | undefined;
  let previousEngine: string | undefined;

  beforeEach(() => {
    previousRoot = process.env.MEDIA_STORAGE_ROOT;
    previousEngine = process.env.ACF_MOCK_TTS_ENGINE;
    root = mkdtempSync(path.join(os.tmpdir(), 'acf-tts-'));
    process.env.MEDIA_STORAGE_ROOT = root;
    process.env.ACF_MOCK_TTS_ENGINE = 'placeholder';
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.MEDIA_STORAGE_ROOT;
    } else {
      process.env.MEDIA_STORAGE_ROOT = previousRoot;
    }
    if (previousEngine === undefined) {
      delete process.env.ACF_MOCK_TTS_ENGINE;
    } else {
      process.env.ACF_MOCK_TTS_ENGINE = previousEngine;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('writes a legal non-silent WAV with a deterministic duration', async () => {
    const storage = new StorageService(new LocalStorageProvider());
    const tts = new MockTtsProvider(storage);
    const key = 'v1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555';
    const first = await tts.synthesize({ text: '你好世界测试旁白', storageKey: key });
    const second = await tts.synthesize({ text: '你好世界测试旁白', storageKey: key });
    expect(first.mimeType).toBe('audio/wav');
    expect(first.duration).toBe(second.duration);
    expect(first.usage?.provider).toBe('mock-tts');
    expect(first.usage?.estimatedCost).toBe(0);
    expect(first.usage?.model).toBe('audible-placeholder');
    const body = await storage.get(key);
    const header = parseWavHeader(body);
    expect(header.riff).toBe('RIFF');
    expect(header.wave).toBe('WAVE');
    expect(header.duration).toBe(first.duration);
    expect(wavIsAudible(body)).toBe(true);
    expect(wavPcmPeak(body)).toBeGreaterThan(800);
  });
});
