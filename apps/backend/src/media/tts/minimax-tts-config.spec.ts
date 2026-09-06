import { afterEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import {
  assertMiniMaxTtsConfigured,
  joinT2aV2Url,
  MINIMAX_VOICE_MISSING,
  parseMiniMaxFormat,
  parseMiniMaxLanguageBoost,
  parseMiniMaxSpeed,
} from './minimax-tts-config.js';

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe('minimax tts config', () => {
  const previous = {
    key: process.env.MINIMAX_TTS_API_KEY,
    base: process.env.MINIMAX_TTS_BASE_URL,
    model: process.env.MINIMAX_TTS_MODEL,
    voice: process.env.MINIMAX_TTS_VOICE,
    format: process.env.MINIMAX_TTS_FORMAT,
    boost: process.env.MINIMAX_TTS_LANGUAGE_BOOST,
  };

  afterEach(() => {
    restoreEnv('MINIMAX_TTS_API_KEY', previous.key);
    restoreEnv('MINIMAX_TTS_BASE_URL', previous.base);
    restoreEnv('MINIMAX_TTS_MODEL', previous.model);
    restoreEnv('MINIMAX_TTS_VOICE', previous.voice);
    restoreEnv('MINIMAX_TTS_FORMAT', previous.format);
    restoreEnv('MINIMAX_TTS_LANGUAGE_BOOST', previous.boost);
  });

  it('joins /t2a_v2 without doubling /v1 or the path', () => {
    expect(joinT2aV2Url('https://api.minimax.io/v1')).toBe('https://api.minimax.io/v1/t2a_v2');
    expect(joinT2aV2Url('https://api.minimax.io/v1/')).toBe('https://api.minimax.io/v1/t2a_v2');
    expect(joinT2aV2Url('https://api.minimax.io/v1/t2a_v2')).toBe('https://api.minimax.io/v1/t2a_v2');
    expect(joinT2aV2Url('https://api.minimax.io')).toBe('https://api.minimax.io/t2a_v2');
  });

  it('parses official format language_boost and speed', () => {
    expect(parseMiniMaxFormat('mp3')).toBe('mp3');
    expect(parseMiniMaxFormat('wav')).toBe('wav');
    expect(() => parseMiniMaxFormat('flac')).toThrow();
    expect(parseMiniMaxLanguageBoost(undefined)).toBe('Chinese');
    expect(parseMiniMaxLanguageBoost('Chinese')).toBe('Chinese');
    expect(parseMiniMaxLanguageBoost('auto')).toBe('auto');
    expect(() => parseMiniMaxLanguageBoost('zh')).toThrow();
    expect(parseMiniMaxSpeed(1)).toBe(1);
    expect(parseMiniMaxSpeed(0.5)).toBe(0.5);
    expect(parseMiniMaxSpeed(2)).toBe(2);
    try {
      parseMiniMaxSpeed(3);
    } catch (error) {
      expect((error as { code?: string }).code).toBe(ErrorCode.TTS_PROVIDER_INVALID_INPUT);
    }
  });

  it('requires voice without echoing the secret', () => {
    process.env.MINIMAX_TTS_API_KEY = 'super-secret-minimax-key';
    process.env.MINIMAX_TTS_BASE_URL = 'https://api.minimax.io/v1';
    process.env.MINIMAX_TTS_MODEL = 'speech-2.8-turbo';
    delete process.env.MINIMAX_TTS_VOICE;
    try {
      assertMiniMaxTtsConfigured();
      throw new Error('expected configuration error');
    } catch (error) {
      expect((error as { code?: string }).code).toBe(ErrorCode.TTS_PROVIDER_NOT_CONFIGURED);
      expect(String(error)).toContain(MINIMAX_VOICE_MISSING);
      expect(String(error)).not.toContain('super-secret-minimax-key');
    }
  });

  it('requires key without echoing the secret', () => {
    delete process.env.MINIMAX_TTS_API_KEY;
    process.env.MINIMAX_TTS_BASE_URL = 'https://api.minimax.io/v1';
    process.env.MINIMAX_TTS_MODEL = 'speech-2.8-turbo';
    process.env.MINIMAX_TTS_VOICE = 'Chinese (Mandarin)_Lyrical_Voice';
    try {
      assertMiniMaxTtsConfigured();
      throw new Error('expected configuration error');
    } catch (error) {
      expect((error as { code?: string }).code).toBe(ErrorCode.TTS_PROVIDER_NOT_CONFIGURED);
      expect(String(error)).not.toMatch(/sk-/);
    }
  });
});
