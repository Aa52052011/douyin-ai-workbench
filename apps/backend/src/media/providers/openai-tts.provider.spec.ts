import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { buildSilentWav } from '../audio/silent-wav.js';
import { LocalStorageProvider } from '../storage/local-storage.provider.js';
import { StorageService } from '../storage/storage.service.js';
import { OpenAiTtsProvider } from './openai-tts.provider.js';

const KEY =
  'v1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555';

describe('OpenAiTtsProvider', () => {
  let root: string;
  const previous = { ...process.env };

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'acf-tts-'));
    process.env.MEDIA_STORAGE_ROOT = root;
    process.env.TTS_BASE_URL = 'https://api.example.com/v1';
    process.env.TTS_API_KEY = 'test-tts-key';
    process.env.TTS_MODEL = 'test-model';
    process.env.TTS_VOICE = 'alloy';
    process.env.TTS_FORMAT = 'wav';
    process.env.TTS_TIMEOUT_MS = '2000';
    process.env.TTS_MAX_RESPONSE_BYTES = String(10 * 1024 * 1024);
  });

  afterEach(() => {
    process.env.MEDIA_STORAGE_ROOT = previous.MEDIA_STORAGE_ROOT;
    process.env.TTS_BASE_URL = previous.TTS_BASE_URL;
    process.env.TTS_API_KEY = previous.TTS_API_KEY;
    process.env.TTS_MODEL = previous.TTS_MODEL;
    process.env.TTS_VOICE = previous.TTS_VOICE;
    process.env.TTS_FORMAT = previous.TTS_FORMAT;
    process.env.TTS_TIMEOUT_MS = previous.TTS_TIMEOUT_MS;
    process.env.TTS_MAX_RESPONSE_BYTES = previous.TTS_MAX_RESPONSE_BYTES;
    rmSync(root, { recursive: true, force: true });
  });

  function provider(): OpenAiTtsProvider {
    return new OpenAiTtsProvider(new StorageService(new LocalStorageProvider()));
  }

  it('stores probed wav audio without using the mock character formula', async () => {
    const wav = buildSilentWav(2);
    const tts = provider();
    const result = await tts.synthesizeWith(
      { text: '你好，这是测试。', storageKey: KEY, speed: 1, clientRequestId: 'job:voice:v1' },
      async (url, init) => {
        expect(String(url)).toBe('https://api.example.com/v1/audio/speech');
        const headers = new Headers(init?.headers);
        expect(headers.get('authorization')).toBe('Bearer test-tts-key');
        expect(headers.get('x-client-request-id')).toBe('job:voice:v1');
        const body = JSON.parse(String(init?.body));
        expect(body.input).toBe('你好，这是测试。');
        expect(body.voice).toBe('alloy');
        expect(body.model).toBe('test-model');
        expect(body.response_format).toBe('wav');
        return new Response(new Uint8Array(wav), { status: 200, headers: { 'content-type': 'audio/wav' } });
      },
      async () => 2,
    );
    expect(result.mimeType).toBe('audio/wav');
    expect(result.duration).toBe(2);
    expect(result.duration).not.toBe(1);
    expect(result.usage?.provider).toBe('openai-tts');
    expect(result.usage?.model).toBe('test-model');
    expect(result.usage?.audioSecondsExact).toBe(2);
    expect(JSON.stringify(result)).not.toContain('test-tts-key');
  });

  it('rejects oversized audio before treating it as valid', async () => {
    process.env.TTS_MAX_RESPONSE_BYTES = '64';
    const tts = provider();
    await expect(
      tts.synthesizeWith(
        { text: '你好', storageKey: KEY },
        async () =>
          new Response(Buffer.alloc(128, 1), {
            status: 200,
            headers: { 'content-type': 'audio/wav', 'content-length': '128' },
          }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_INVALID_RESPONSE });
  });

  it('classifies 400 401 429 500 and timeout', async () => {
    const tts = provider();
    await expect(
      tts.synthesizeWith({ text: '你好', storageKey: KEY }, async () => new Response('bad', { status: 400 })),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_INVALID_INPUT });
    await expect(
      tts.synthesizeWith({ text: '你好', storageKey: KEY }, async () => new Response('nope', { status: 401 })),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_AUTH });
    await expect(
      tts.synthesizeWith({ text: '你好', storageKey: KEY }, async () => new Response('slow', { status: 429 })),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_RATE_LIMIT });
    await expect(
      tts.synthesizeWith({ text: '你好', storageKey: KEY }, async () => new Response('down', { status: 500 })),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_UNAVAILABLE });
    process.env.TTS_TIMEOUT_MS = '30';
    await expect(
      tts.synthesizeWith(
        { text: '你好', storageKey: KEY },
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(Object.assign(new Error('AbortError'), { name: 'AbortError' })), 5);
          }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_TIMEOUT });
  });

  it('rejects html and missing configuration without leaking secrets', async () => {
    const tts = provider();
    await expect(
      tts.synthesizeWith(
        { text: '你好', storageKey: KEY },
        async () => new Response('<html>fail</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_INVALID_RESPONSE });
    delete process.env.TTS_API_KEY;
    await expect(tts.synthesizeWith({ text: '你好', storageKey: KEY }, async () => new Response('x'))).rejects.toMatchObject({
      code: ErrorCode.TTS_PROVIDER_NOT_CONFIGURED,
    });
  });
});
