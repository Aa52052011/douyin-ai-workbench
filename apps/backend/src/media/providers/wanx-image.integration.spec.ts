import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageProvider } from '../storage/local-storage.provider.js';
import { StorageService } from '../storage/storage.service.js';
import { isWanxImageConfigured } from '../visual/wanx-config.js';
import { WanxImageProvider, type WanxFetch } from './wanx-image.provider.js';

function isRealWanxIntegrationEnabled(): boolean {
  try {
    return (
      process.env.RUN_REAL_VISUAL_TESTS === 'true' &&
      process.env.MEDIA_IMAGE_PROVIDER === 'wanx' &&
      isWanxImageConfigured()
    );
  } catch {
    return false;
  }
}

const enabled = isRealWanxIntegrationEnabled();

const KEY =
  'v1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('WanxImageProvider real integration', () => {
  let root: string;
  let previousRoot: string | undefined;

  beforeEach((ctx) => {
    if (!enabled) {
      ctx.skip();
      return;
    }
    previousRoot = process.env.MEDIA_STORAGE_ROOT;
    root = mkdtempSync(path.join(os.tmpdir(), 'acf-real-wanx-'));
    process.env.MEDIA_STORAGE_ROOT = root;
  });

  afterEach(() => {
    if (!enabled) {
      return;
    }
    if (previousRoot === undefined) {
      delete process.env.MEDIA_STORAGE_ROOT;
    } else {
      process.env.MEDIA_STORAGE_ROOT = previousRoot;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('generates exactly one low-cost portrait image', async () => {
    const storage = new StorageService(new LocalStorageProvider());
    const provider = new WanxImageProvider(storage);
    let generationPosts = 0;
    let generationStatus: number | undefined;
    const fetchImpl: WanxFetch = async (url, init) => {
      const target = String(url);
      const isGeneration = target.includes('/services/aigc/multimodal-generation/generation');
      if (isGeneration) {
        generationPosts += 1;
        if (generationPosts > 1) {
          throw new Error('generation POST retry is forbidden');
        }
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe('wan2.6-t2i');
        expect(body.parameters.n).toBe(1);
        expect(body.parameters.prompt_extend).toBe(false);
        expect(body.parameters.size).toBe(process.env.WANX_SIZE?.trim() || '960*1696');
        expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/X-DashScope-Async/i);
      }
      const response = await globalThis.fetch(url, init);
      if (isGeneration) {
        generationStatus = response.status;
      }
      return response;
    };
    const result = await provider.generateWith(
      {
        sceneId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sequence: 1,
        prompt: '现代中国城市夜景，摩天大楼和霓虹灯，电影感灯光，竖屏构图，写实摄影风格，无文字，无水印',
        negativePrompt: '文字，水印，logo，模糊，低质量，变形',
        aspectRatio: '9:16',
        clientRequestId: 'real-wanx-integration',
        storageKey: KEY,
      },
      fetchImpl,
    );
    expect(generationPosts).toBe(1);
    expect(generationStatus).toBe(200);
    expect(result.size).toBeGreaterThan(0);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.mimeType === 'image/png' || result.mimeType === 'image/jpeg').toBe(true);
    expect(result.provider).toBe('wanx');
    expect(result.model).toBe('wan2.6-t2i');
    expect(result.usage?.imageCount).toBe(1);
    expect(await storage.exists(KEY)).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Authorization');
    expect(serialized).not.toContain(process.env.WANX_API_KEY);
    expect(serialized).not.toContain('Signature=');
    expect(serialized).not.toContain('dashscope-result');
    console.info(
      JSON.stringify({
        event: 'wanx_real_integration_ok',
        provider: result.provider,
        model: result.model,
        mimeType: result.mimeType,
        bytes: result.size,
        width: result.width,
        height: result.height,
        imageCount: result.usage?.imageCount,
        providerRequestId: result.providerTaskId ?? null,
        generationPosts,
        generationStatus,
        storageExists: true,
        storageKeyTail: KEY.slice(-12),
      }),
    );
  }, 180_000);
});
