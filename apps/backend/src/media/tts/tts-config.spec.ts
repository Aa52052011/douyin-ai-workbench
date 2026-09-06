import { afterEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import {
  assertOpenAiTtsConfigured,
  joinAudioSpeechUrl,
  parseTtsFormat,
  parseTtsSpeed,
  resolveTtsProviderId,
} from './tts-config.js';

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe('tts config', () => {
  const previous = {
    node: process.env.NODE_ENV,
    tts: process.env.MEDIA_TTS_PROVIDER,
    run: process.env.RUN_REAL_TTS_TESTS,
    key: process.env.TTS_API_KEY,
    base: process.env.TTS_BASE_URL,
    model: process.env.TTS_MODEL,
  };

  afterEach(() => {
    process.env.NODE_ENV = previous.node;
    restoreEnv('MEDIA_TTS_PROVIDER', previous.tts);
    restoreEnv('RUN_REAL_TTS_TESTS', previous.run);
    restoreEnv('TTS_API_KEY', previous.key);
    restoreEnv('TTS_BASE_URL', previous.base);
    restoreEnv('TTS_MODEL', previous.model);
  });

  it('keeps mock in unit tests even if openai-tts is selected', () => {
    process.env.NODE_ENV = 'test';
    process.env.MEDIA_TTS_PROVIDER = 'openai-tts';
    delete process.env.RUN_REAL_TTS_TESTS;
    expect(resolveTtsProviderId()).toBe('mock');
  });

  it('fails closed on unknown or missing TTS outside tests', () => {
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_TTS_PROVIDER = 'MINIMX';
    expect(() => resolveTtsProviderId()).toThrow(/Unknown MEDIA_TTS_PROVIDER/);
    delete process.env.MEDIA_TTS_PROVIDER;
    expect(() => resolveTtsProviderId()).toThrow(/MEDIA_TTS_PROVIDER is required/);
  });

  it('does not require TTS credentials when mock is selected', () => {
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_TTS_PROVIDER = 'mock';
    delete process.env.TTS_API_KEY;
    delete process.env.TTS_BASE_URL;
    delete process.env.TTS_MODEL;
    expect(resolveTtsProviderId()).toBe('mock');
  });

  it('fails openai-tts configuration without echoing the secret', () => {
    process.env.TTS_API_KEY = 'super-secret-tts-key';
    delete process.env.TTS_BASE_URL;
    delete process.env.TTS_MODEL;
    try {
      assertOpenAiTtsConfigured();
      throw new Error('expected configuration error');
    } catch (error) {
      expect((error as { code?: string }).code).toBe(ErrorCode.TTS_PROVIDER_NOT_CONFIGURED);
      expect(String(error)).not.toContain('super-secret-tts-key');
    }
  });

  it('allows openai-tts only when real tests are opted in', () => {
    process.env.NODE_ENV = 'test';
    process.env.MEDIA_TTS_PROVIDER = 'openai-tts';
    process.env.RUN_REAL_TTS_TESTS = 'true';
    expect(resolveTtsProviderId()).toBe('openai-tts');
  });

  it('keeps mock in unit tests even if minimax-tts is selected', () => {
    process.env.NODE_ENV = 'test';
    process.env.MEDIA_TTS_PROVIDER = 'minimax-tts';
    delete process.env.RUN_REAL_TTS_TESTS;
    expect(resolveTtsProviderId()).toBe('mock');
  });

  it('allows minimax-tts only when real tests are opted in', () => {
    process.env.NODE_ENV = 'test';
    process.env.MEDIA_TTS_PROVIDER = 'minimax-tts';
    process.env.RUN_REAL_TTS_TESTS = 'true';
    expect(resolveTtsProviderId()).toBe('minimax-tts');
  });

  it('joins /audio/speech without doubling /v1', () => {
    expect(joinAudioSpeechUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1/audio/speech');
    expect(joinAudioSpeechUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1/audio/speech');
    expect(joinAudioSpeechUrl('https://api.example.com/v1/audio/speech')).toBe(
      'https://api.example.com/v1/audio/speech',
    );
    expect(joinAudioSpeechUrl('https://api.example.com')).toBe('https://api.example.com/audio/speech');
  });

  it('rejects unsupported formats and unsafe speeds', () => {
    expect(parseTtsFormat('mp3')).toBe('mp3');
    expect(parseTtsFormat('wav')).toBe('wav');
    expect(() => parseTtsFormat('ogg')).toThrow();
    expect(parseTtsSpeed(1)).toBe(1);
    try {
      parseTtsSpeed(8);
    } catch (error) {
      expect((error as { code?: string }).code).toBe(ErrorCode.TTS_PROVIDER_INVALID_INPUT);
    }
  });
});
