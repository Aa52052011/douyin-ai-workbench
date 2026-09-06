import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isMiniMaxTtsConfigured } from '../tts/minimax-tts-config.js';
import { LocalStorageProvider } from '../storage/local-storage.provider.js';
import { StorageService } from '../storage/storage.service.js';
import { MiniMaxTtsProvider } from './minimax-tts.provider.js';

const enabled =
  process.env.RUN_REAL_TTS_TESTS === 'true' &&
  process.env.MEDIA_TTS_PROVIDER === 'minimax-tts' &&
  isMiniMaxTtsConfigured();

const KEY =
  'v1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe.skipIf(!enabled)('MiniMaxTtsProvider real integration', () => {
  let root: string;
  let previousRoot: string | undefined;

  beforeEach(() => {
    previousRoot = process.env.MEDIA_STORAGE_ROOT;
    root = mkdtempSync(path.join(os.tmpdir(), 'acf-real-minimax-'));
    process.env.MEDIA_STORAGE_ROOT = root;
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.MEDIA_STORAGE_ROOT;
    } else {
      process.env.MEDIA_STORAGE_ROOT = previousRoot;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('synthesizes a short clip without leaking secrets', async () => {
    const storage = new StorageService(new LocalStorageProvider());
    const provider = new MiniMaxTtsProvider(storage);
    const result = await provider.synthesize({
      text: '你好，这是测试。',
      storageKey: KEY,
      speed: 1,
      language: 'zh-CN',
      clientRequestId: 'real-minimax-integration',
    });
    expect(result.size).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.mimeType === 'audio/mpeg' || result.mimeType === 'audio/wav').toBe(true);
    expect(await storage.exists(KEY)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('Authorization');
    expect(JSON.stringify(result)).not.toMatch(/sk-[a-zA-Z0-9]/);
  }, 60_000);
});
