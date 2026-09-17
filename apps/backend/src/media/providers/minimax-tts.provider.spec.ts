import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { LocalStorageProvider } from '../storage/local-storage.provider.js';
import { StorageService } from '../storage/storage.service.js';
import { MiniMaxTtsProvider } from './minimax-tts.provider.js';

const KEY =
  'v1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555';
const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xfb, 0x90, 0x00]);

describe('MiniMaxTtsProvider', () => {
  let root: string;
  const previous = { ...process.env };

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'acf-minimax-'));
    process.env.MEDIA_STORAGE_ROOT = root;
    process.env.MINIMAX_TTS_BASE_URL = 'https://api.minimax.io/v1';
    process.env.MINIMAX_TTS_API_KEY = 'test-minimax-key';
    process.env.MINIMAX_TTS_MODEL = 'speech-2.8-turbo';
    process.env.MINIMAX_TTS_VOICE = 'Chinese (Mandarin)_Lyrical_Voice';
    process.env.MINIMAX_TTS_FORMAT = 'mp3';
    process.env.MINIMAX_TTS_LANGUAGE_BOOST = 'Chinese';
    process.env.MINIMAX_TTS_TIMEOUT_MS = '2000';
    process.env.MINIMAX_TTS_MAX_RESPONSE_BYTES = String(10 * 1024 * 1024);
  });

  afterEach(() => {
    process.env.MEDIA_STORAGE_ROOT = previous.MEDIA_STORAGE_ROOT;
    process.env.MINIMAX_TTS_BASE_URL = previous.MINIMAX_TTS_BASE_URL;
    process.env.MINIMAX_TTS_API_KEY = previous.MINIMAX_TTS_API_KEY;
    process.env.MINIMAX_TTS_MODEL = previous.MINIMAX_TTS_MODEL;
    process.env.MINIMAX_TTS_VOICE = previous.MINIMAX_TTS_VOICE;
    process.env.MINIMAX_TTS_FORMAT = previous.MINIMAX_TTS_FORMAT;
    process.env.MINIMAX_TTS_LANGUAGE_BOOST = previous.MINIMAX_TTS_LANGUAGE_BOOST;
    process.env.MINIMAX_TTS_TIMEOUT_MS = previous.MINIMAX_TTS_TIMEOUT_MS;
    process.env.MINIMAX_TTS_MAX_RESPONSE_BYTES = previous.MINIMAX_TTS_MAX_RESPONSE_BYTES;
    rmSync(root, { recursive: true, force: true });
  });

  function provider(): MiniMaxTtsProvider {
    return new MiniMaxTtsProvider(new StorageService(new LocalStorageProvider()));
  }

  function successJson(overrides?: Record<string, unknown>) {
    return {
      data: { audio: MP3.toString('hex'), status: 2 },
      extra_info: {
        audio_length: 2000,
        audio_size: MP3.byteLength,
        usage_characters: 9,
        audio_format: 'mp3',
      },
      trace_id: 'trace-not-idempotent',
      base_resp: { status_code: 0, status_msg: 'success' },
      ...overrides,
    };
  }

  it('stores probed mp3 from hex without using the mock character formula', async () => {
    const result = await provider().synthesizeWith(
      { text: '你好，这是测试。', storageKey: KEY, speed: 1, voice: '冷静、中速、不鸡血', clientRequestId: 'job:voice:v1' },
      async (url, init) => {
        expect(String(url)).toBe('https://api.minimax.io/v1/t2a_v2');
        const headers = new Headers(init?.headers);
        expect(headers.get('authorization')).toBe('Bearer test-minimax-key');
        expect(headers.get('x-client-request-id')).toBe('job:voice:v1');
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe('speech-2.8-turbo');
        expect(body.text).toBe('你好，这是测试。');
        expect(body.stream).toBe(false);
        expect(body.output_format).toBe('hex');
        expect(body.language_boost).toBe('Chinese');
        expect(body.subtitle_enable).toBe(true);
        expect(body.subtitle_type).toBe('sentence');
        expect(body.voice_setting.voice_id).toBe('Chinese (Mandarin)_Lyrical_Voice');
        expect(body.voice_setting.speed).toBe(1);
        expect(body.audio_setting.format).toBe('mp3');
        return new Response(JSON.stringify(successJson()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
      async () => 2,
    );
    expect(result.mimeType).toBe('audio/mpeg');
    expect(result.duration).toBe(2);
    expect(result.duration).not.toBe(1);
    expect(result.usage?.provider).toBe('minimax-tts');
    expect(result.usage?.model).toBe('speech-2.8-turbo');
    expect(result.usage?.inputCharacters).toBe(9);
    expect(result.usage?.audioSecondsExact).toBe(2);
    expect(result.usage?.providerDurationMs).toBe(2000);
    expect(JSON.stringify(result)).not.toContain('test-minimax-key');
  });

  it('uses official audio_length milliseconds when probe is unavailable', async () => {
    const result = await provider().synthesizeWith(
      { text: '你好，这是测试。', storageKey: KEY, speed: 1 },
      async () =>
        new Response(JSON.stringify(successJson()), { status: 200, headers: { 'content-type': 'application/json' } }),
      async () => null,
    );
    expect(result.duration).toBe(2);
  });

  it('classifies http and business failures without leaking secrets', async () => {
    const tts = provider();
    await expect(
      tts.synthesizeWith({ text: '你好', storageKey: KEY }, async () => new Response('nope', { status: 401 })),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_AUTH });
    await expect(
      tts.synthesizeWith({ text: '你好', storageKey: KEY }, async () => new Response('slow', { status: 429 })),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_RATE_LIMIT });
    await expect(
      tts.synthesizeWith({ text: '你好', storageKey: KEY }, async () => new Response('down', { status: 500 })),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_UNAVAILABLE });
    await expect(
      tts.synthesizeWith(
        { text: '你好', storageKey: KEY },
        async () =>
          new Response(JSON.stringify({ base_resp: { status_code: 1004, status_msg: 'not authorized' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_AUTH });
    process.env.MINIMAX_TTS_TIMEOUT_MS = '30';
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

  it('rejects html url audio invalid hex empty audio and oversized json', async () => {
    const tts = provider();
    await expect(
      tts.synthesizeWith(
        { text: '你好', storageKey: KEY },
        async () => new Response('<html>fail</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_INVALID_RESPONSE });
    await expect(
      tts.synthesizeWith(
        { text: '你好', storageKey: KEY },
        async () =>
          new Response(JSON.stringify(successJson({ data: { audio: 'https://cdn.example.com/a.mp3', status: 2 } })), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_INVALID_RESPONSE });
    await expect(
      tts.synthesizeWith(
        { text: '你好', storageKey: KEY },
        async () =>
          new Response(JSON.stringify(successJson({ data: { audio: 'zzzz', status: 2 } })), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_INVALID_RESPONSE });
    await expect(
      tts.synthesizeWith(
        { text: '你好', storageKey: KEY },
        async () =>
          new Response(JSON.stringify(successJson({ data: { audio: Buffer.from('not-mp3-audio!!').toString('hex'), status: 2 } })), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_INVALID_RESPONSE });
    process.env.MINIMAX_TTS_MAX_RESPONSE_BYTES = '1024';
    await expect(
      tts.synthesizeWith(
        { text: '你好', storageKey: KEY },
        async () =>
          new Response('{"ok":true}', {
            status: 200,
            headers: { 'content-type': 'application/json', 'content-length': '99999' },
          }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.TTS_PROVIDER_INVALID_RESPONSE });
  });
});
