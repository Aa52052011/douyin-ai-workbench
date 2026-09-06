import { mkdtempSync, rmSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { LocalStorageProvider } from '../storage/local-storage.provider.js';
import { StorageService } from '../storage/storage.service.js';
import { encodeSolidPng } from '../visual/color-background-png.js';
import { WANX_CAPABILITIES } from '../visual/wanx-config.js';
import { WanxImageProvider, type WanxFetch } from './wanx-image.provider.js';

const KEY =
  'v1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555';
const SECRET = 'wanx-test-secret-key';
const IMAGE_URL =
  'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/fake.png?Expires=999&Signature=signed-token';
const PNG = encodeSolidPng(8, 16, { r: 12, g: 34, b: 56 });
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x08, 0x01, 0x11, 0x00, 0xff, 0xd9,
]);

const REQUEST = {
  sceneId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  sequence: 1,
  prompt: '现代城市夜景，竖屏构图，电影感灯光，无文字',
  negativePrompt: '字幕, 水印',
  aspectRatio: '9:16',
  width: 1080,
  height: 1920,
  style: '电影感',
  clientRequestId: 'job-1:visual:scene-1:gen-1',
  storageKey: KEY,
};

function successJson(overrides?: Record<string, unknown>) {
  return {
    output: {
      choices: [{ finish_reason: 'stop', message: { content: [{ image: IMAGE_URL, type: 'image' }] } }],
      finished: true,
    },
    usage: { image_count: 1, size: '960*1696' },
    request_id: 'req-wanx-1',
    ...overrides,
  };
}

describe('WanxImageProvider', () => {
  let root: string;
  const previous = { ...process.env };
  const logs: string[] = [];

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'acf-wanx-'));
    process.env.MEDIA_STORAGE_ROOT = root;
    process.env.WANX_BASE_URL = 'https://workspace-id.cn-beijing.maas.aliyuncs.com/api/v1';
    process.env.WANX_API_KEY = SECRET;
    process.env.WANX_MODEL = 'wan2.6-t2i';
    process.env.WANX_SIZE = '960*1696';
    process.env.WANX_TIMEOUT_MS = '2000';
    process.env.WANX_MAX_RESPONSE_BYTES = String(2 * 1024 * 1024);
    logs.length = 0;
    vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
      logs.push(JSON.stringify(message));
    });
    vi.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
      logs.push(JSON.stringify(message));
    });
    vi.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
      logs.push(JSON.stringify(message));
    });
  });

  afterEach(() => {
    process.env.MEDIA_STORAGE_ROOT = previous.MEDIA_STORAGE_ROOT;
    process.env.WANX_BASE_URL = previous.WANX_BASE_URL;
    process.env.WANX_API_KEY = previous.WANX_API_KEY;
    process.env.WANX_MODEL = previous.WANX_MODEL;
    process.env.WANX_SIZE = previous.WANX_SIZE;
    process.env.WANX_TIMEOUT_MS = previous.WANX_TIMEOUT_MS;
    process.env.WANX_MAX_RESPONSE_BYTES = previous.WANX_MAX_RESPONSE_BYTES;
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  function provider(storage = new StorageService(new LocalStorageProvider())): WanxImageProvider {
    return new WanxImageProvider(storage);
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  function bytesResponse(body: Buffer, status = 200, contentType = 'application/octet-stream'): Response {
    return new Response(body, { status, headers: { 'content-type': contentType } });
  }

  function mockFetch(image: Buffer = PNG): { fetchImpl: WanxFetch; posts: unknown[]; gets: string[]; auths: string[] } {
    const posts: unknown[] = [];
    const gets: string[] = [];
    const auths: string[] = [];
    const fetchImpl: WanxFetch = async (url, init) => {
      const target = String(url);
      const headers = new Headers(init?.headers);
      const auth = headers.get('authorization') ?? '';
      if (target.includes('/services/aigc/multimodal-generation/generation')) {
        posts.push(JSON.parse(String(init?.body)));
        auths.push(auth);
        return jsonResponse(successJson());
      }
      gets.push(target);
      auths.push(auth);
      return bytesResponse(image);
    };
    return { fetchImpl, posts, gets, auths };
  }

  it('stores a successful png generation without persisting the provider url', async () => {
    const { fetchImpl, posts, gets } = mockFetch(PNG);
    const result = await provider().generateWith(REQUEST, fetchImpl);
    expect(posts).toHaveLength(1);
    expect(gets).toEqual([IMAGE_URL]);
    expect(result.provider).toBe('wanx');
    expect(result.model).toBe('wan2.6-t2i');
    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(8);
    expect(result.height).toBe(16);
    expect(result.usage?.imageCount).toBe(1);
    expect(result.providerTaskId).toBe('req-wanx-1');
    expect(JSON.stringify(result)).not.toContain(IMAGE_URL);
    expect(JSON.stringify(result)).not.toContain('Signature');
    expect(WANX_CAPABILITIES.idempotency).toBe(false);
    expect(WANX_CAPABILITIES.taskLookup).toBe(false);
    expect(WANX_CAPABILITIES.async).toBe(false);
  });

  it('constructs a bearer header that is never logged', async () => {
    const { fetchImpl, auths } = mockFetch();
    const result = await provider().generateWith(REQUEST, fetchImpl);
    expect(auths[0]).toBe(`Bearer ${SECRET}`);
    expect(auths[1]).toBe('');
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(logs.join('\n')).not.toContain(SECRET);
    expect(logs.join('\n')).not.toContain('Bearer');
    expect(logs.join('\n')).toBe('');
  });

  it('maps frozen prompt, negative prompt, n=1 and prompt_extend=false', async () => {
    const { fetchImpl, posts } = mockFetch();
    await provider().generateWith(REQUEST, fetchImpl);
    expect(posts[0]).toMatchObject({
      model: 'wan2.6-t2i',
      input: { messages: [{ role: 'user', content: [{ text: REQUEST.prompt }] }] },
      parameters: {
        n: 1,
        prompt_extend: false,
        watermark: false,
        size: '960*1696',
        negative_prompt: '字幕, 水印',
      },
    });
    expect(JSON.stringify(posts[0])).not.toContain('1080');
    expect(JSON.stringify(posts[0])).not.toContain('1920');
  });

  it('accepts jpeg bytes even when content-type is wrong', async () => {
    const { fetchImpl } = mockFetch(JPEG);
    const wrapped: WanxFetch = async (url, init) => {
      const response = await fetchImpl(url, init);
      if (String(url) === IMAGE_URL) {
        return bytesResponse(JPEG, 200, 'text/html');
      }
      return response;
    };
    const result = await provider().generateWith(REQUEST, wrapped);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.width).toBe(8);
    expect(result.height).toBe(16);
  });

  it('rejects invalid empty html json and unknown image bytes', async () => {
    const wanx = provider();
    for (const body of [Buffer.alloc(0), Buffer.from('<html>fail</html>'), Buffer.from('{"error":true}'), Buffer.from('RIFF....WEBP')]) {
      await expect(
        wanx.generateWith(REQUEST, async (url) => {
          if (String(url).includes('/generation')) {
            return jsonResponse(successJson());
          }
          return bytesResponse(body);
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE });
    }
  });

  it('classifies http 401 and 403 as auth failures', async () => {
    const wanx = provider();
    await expect(wanx.generateWith(REQUEST, async () => jsonResponse({ code: 'InvalidApiKey' }, 401))).rejects.toMatchObject({
      code: ErrorCode.VISUAL_PROVIDER_AUTH,
    });
    await expect(wanx.generateWith(REQUEST, async () => new Response('forbidden', { status: 403 }))).rejects.toMatchObject({
      code: ErrorCode.VISUAL_PROVIDER_AUTH,
    });
  });

  it('classifies quota and rate limit without retrying generation post', async () => {
    let posts = 0;
    const wanx = provider();
    await expect(
      wanx.generateWith(REQUEST, async () => {
        posts += 1;
        return jsonResponse({ code: 'Throttling.AllocationQuota', message: 'quota exceeded' }, 429);
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VISUAL_PROVIDER_QUOTA });
    await expect(
      wanx.generateWith(REQUEST, async () => {
        posts += 1;
        return new Response('slow', { status: 429 });
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VISUAL_PROVIDER_RATE_LIMIT });
    expect(posts).toBe(2);
  });

  it('classifies generation timeout as unknown billing and does not retry post', async () => {
    let posts = 0;
    await expect(
      provider().generateWith(REQUEST, async () => {
        posts += 1;
        throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING });
    expect(posts).toBe(1);
  });

  it('classifies malformed success json as unknown billing', async () => {
    await expect(
      provider().generateWith(REQUEST, async () => new Response('{not-json', { status: 200 })),
    ).rejects.toMatchObject({ code: ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING });
  });

  it('classifies provider business errors', async () => {
    await expect(
      provider().generateWith(REQUEST, async () => jsonResponse({ code: 'InvalidParameter', message: 'bad size' }, 200)),
    ).rejects.toMatchObject({ code: ErrorCode.VISUAL_PROVIDER_BAD_REQUEST });
    await expect(
      provider().generateWith(REQUEST, async () => jsonResponse({ code: 'DataInspectionFailed', message: 'blocked' }, 200)),
    ).rejects.toMatchObject({ code: ErrorCode.VISUAL_PROVIDER_BAD_REQUEST });
  });

  it('retries image download but not the generation post', async () => {
    let posts = 0;
    let gets = 0;
    await expect(
      provider().generateWith(REQUEST, async (url) => {
        if (String(url).includes('/generation')) {
          posts += 1;
          return jsonResponse(successJson());
        }
        gets += 1;
        return new Response('missing', { status: 404 });
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VISUAL_PROVIDER_DOWNLOAD });
    expect(posts).toBe(1);
    expect(gets).toBe(3);
  });

  it('cleans up when storage put fails after a billed generation', async () => {
    const storage = {
      put: vi.fn(async () => {
        throw new Error('disk full');
      }),
      delete: vi.fn(async () => undefined),
      exists: vi.fn(async () => false),
    };
    const wanx = new WanxImageProvider(storage as unknown as StorageService);
    await expect(wanx.generateWith(REQUEST, mockFetch().fetchImpl)).rejects.toMatchObject({
      code: ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING,
    });
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith(KEY);
    expect(await new StorageService(new LocalStorageProvider()).exists(KEY)).toBe(false);
  });

  it('classifies a 5xx generation response as unknown billing without a second post', async () => {
    let posts = 0;
    await expect(
      provider().generateWith(REQUEST, async () => {
        posts += 1;
        return new Response('upstream', { status: 502 });
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING });
    expect(posts).toBe(1);
  });

  it('does not treat clientRequestId as an idempotency key', async () => {
    const { fetchImpl, posts } = mockFetch();
    await provider().generateWith(REQUEST, fetchImpl);
    expect(JSON.stringify(posts[0])).not.toContain(REQUEST.clientRequestId);
  });

  it('redacts secrets from thrown errors', async () => {
    await expect(provider().generateWith(REQUEST, async () => jsonResponse({ code: 'InvalidApiKey', message: SECRET }, 401))).rejects.toMatchObject({
      code: ErrorCode.VISUAL_PROVIDER_AUTH,
      message: 'Visual provider authentication failed',
    });
    expect(logs.join('\n')).not.toContain(SECRET);
  });

  it('requires dedicated wanx config and does not fall back to other keys', async () => {
    delete process.env.WANX_API_KEY;
    process.env.MODEL_API_KEY = 'model-secret';
    process.env.MINIMAX_TTS_API_KEY = 'tts-secret';
    process.env.VISUAL_MINIMAX_API_KEY = 'visual-minimax-secret';
    let called = false;
    await expect(
      provider().generateWith(REQUEST, async () => {
        called = true;
        return jsonResponse(successJson());
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VISUAL_PROVIDER_NOT_CONFIGURED });
    expect(called).toBe(false);
  });
});
