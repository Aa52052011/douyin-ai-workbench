import { RuntimeConfigError } from '../../config/runtime-config-error.js';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AppError } from '../../common/errors/app-error.js';

export const TTS_PROVIDER_OPENAI = 'openai-tts';
export const TTS_PROVIDER_MINIMAX = 'minimax-tts';
export const DEFAULT_TTS_TIMEOUT_MS = 60_000;
export const DEFAULT_TTS_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
export const MIN_TTS_SPEED = 0.5;
export const MAX_TTS_SPEED = 2;
export const ALLOWED_TTS_FORMATS = ['mp3', 'wav'] as const;

export type TtsProviderId = 'mock' | typeof TTS_PROVIDER_OPENAI | typeof TTS_PROVIDER_MINIMAX;
export type TtsAudioFormat = (typeof ALLOWED_TTS_FORMATS)[number];

export type OpenAiTtsConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  format: TtsAudioFormat;
  timeoutMs: number;
  maxResponseBytes: number;
};

export function resolveTtsProviderId(env: NodeJS.ProcessEnv = process.env): TtsProviderId {
  if (env.NODE_ENV === 'test' && env.RUN_REAL_TTS_TESTS !== 'true') {
    return 'mock';
  }
  const raw = env.MEDIA_TTS_PROVIDER?.trim() ?? '';
  if (raw === 'mock') {
    if (env.NODE_ENV === 'production') {
      throw new RuntimeConfigError(['MEDIA_TTS_PROVIDER=mock is not allowed in production']);
    }
    return 'mock';
  }
  if (raw === TTS_PROVIDER_OPENAI) {
    return TTS_PROVIDER_OPENAI;
  }
  if (raw === TTS_PROVIDER_MINIMAX) {
    return TTS_PROVIDER_MINIMAX;
  }
  if (!raw) {
    throw new RuntimeConfigError(['MEDIA_TTS_PROVIDER is required']);
  }
  throw new RuntimeConfigError(['Unknown MEDIA_TTS_PROVIDER']);
}

export function joinAudioSpeechUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new AppError(ErrorCode.TTS_PROVIDER_NOT_CONFIGURED);
  }
  if (trimmed.endsWith('/audio/speech')) {
    return trimmed;
  }
  return `${trimmed}/audio/speech`;
}

export function parseTtsFormat(value: string | undefined): TtsAudioFormat {
  const format = (value?.trim().toLowerCase() || 'mp3') as TtsAudioFormat;
  if (!ALLOWED_TTS_FORMATS.includes(format)) {
    throw new AppError(ErrorCode.TTS_PROVIDER_INVALID_INPUT);
  }
  return format;
}

export function parseTtsSpeed(speed: number | undefined): number {
  const value = speed ?? 1;
  if (!Number.isFinite(value) || value < MIN_TTS_SPEED || value > MAX_TTS_SPEED) {
    throw new AppError(ErrorCode.TTS_PROVIDER_INVALID_INPUT);
  }
  return value;
}

export function parseTtsTimeoutMs(): number {
  const value = Number(process.env.TTS_TIMEOUT_MS ?? DEFAULT_TTS_TIMEOUT_MS);
  if (!Number.isFinite(value) || value < 1_000) {
    return DEFAULT_TTS_TIMEOUT_MS;
  }
  return Math.min(300_000, Math.floor(value));
}

export function parseTtsMaxResponseBytes(): number {
  const value = Number(process.env.TTS_MAX_RESPONSE_BYTES ?? DEFAULT_TTS_MAX_RESPONSE_BYTES);
  if (!Number.isFinite(value) || value < 1024) {
    return DEFAULT_TTS_MAX_RESPONSE_BYTES;
  }
  return Math.min(MEDIA_TTS_HARD_MAX_BYTES, Math.floor(value));
}

const MEDIA_TTS_HARD_MAX_BYTES = 20 * 1024 * 1024;

export function readOpenAiTtsConfig(): OpenAiTtsConfig {
  return {
    baseUrl: process.env.TTS_BASE_URL?.trim().replace(/\/+$/, '') ?? '',
    apiKey: process.env.TTS_API_KEY?.trim() ?? '',
    model: process.env.TTS_MODEL?.trim() ?? '',
    voice: process.env.TTS_VOICE?.trim() || 'alloy',
    format: parseTtsFormat(process.env.TTS_FORMAT),
    timeoutMs: parseTtsTimeoutMs(),
    maxResponseBytes: parseTtsMaxResponseBytes(),
  };
}

export function isOpenAiTtsConfigured(config = readOpenAiTtsConfig()): boolean {
  return Boolean(config.apiKey && config.baseUrl && config.model);
}

export function assertOpenAiTtsConfigured(config = readOpenAiTtsConfig()): OpenAiTtsConfig {
  if (!isOpenAiTtsConfigured(config)) {
    throw new AppError(ErrorCode.TTS_PROVIDER_NOT_CONFIGURED);
  }
  return config;
}
