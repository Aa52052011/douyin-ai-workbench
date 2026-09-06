import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ColorBackgroundImageProvider } from './color-background-image.provider.js';
import { isLikelyPng } from '../visual/image-format.js';
import { COLOR_BACKGROUND_HEIGHT, COLOR_BACKGROUND_WIDTH } from '../visual/visual-config.js';
import { LocalStorageProvider } from '../storage/local-storage.provider.js';
import { StorageService } from '../storage/storage.service.js';

const KEY =
  'v1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('ColorBackgroundImageProvider', () => {
  let root: string;
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.MEDIA_STORAGE_ROOT;
    root = mkdtempSync(path.join(os.tmpdir(), 'acf-img-'));
    process.env.MEDIA_STORAGE_ROOT = root;
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.MEDIA_STORAGE_ROOT;
    } else {
      process.env.MEDIA_STORAGE_ROOT = previous;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('writes a local portrait png without http', async () => {
    const storage = new StorageService(new LocalStorageProvider());
    const provider = new ColorBackgroundImageProvider(storage);
    const result = await provider.generate({
      sceneId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sequence: 1,
      prompt: '竖屏静帧',
      clientRequestId: 'job:visual:scene:v1',
      storageKey: KEY,
      width: COLOR_BACKGROUND_WIDTH,
      height: COLOR_BACKGROUND_HEIGHT,
    });
    expect(provider.id).toBe('color-background');
    expect(result.provider).toBe('color-background');
    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(COLOR_BACKGROUND_WIDTH);
    expect(result.height).toBe(COLOR_BACKGROUND_HEIGHT);
    expect(result.storageKey).toBe(KEY);
    const body = await storage.get(KEY);
    expect(isLikelyPng(body)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('Authorization');
  });
});
