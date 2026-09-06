import { ErrorCode } from '../../common/errors/app-error.js';
import { AppError } from '../../common/errors/app-error.js';
import { ALLOWED_TTS_FORMATS, TTS_PROVIDER_MINIMAX, type TtsAudioFormat } from './tts-config.js';

export { TTS_PROVIDER_MINIMAX };

export const DEFAULT_MINIMAX_MODEL = 'speech-2.8-turbo';
export const DEFAULT_MINIMAX_TIMEOUT_MS = 60_000;
export const DEFAULT_MINIMAX_MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
export const MINIMAX_HARD_MAX_RESPONSE_BYTES = 40 * 1024 * 1024;
export const MINIMAX_MIN_SPEED = 0.5;
export const MINIMAX_MAX_SPEED = 2;
export const MINIMAX_MAX_TEXT_CHARS = 10_000;
export const MINIMAX_VOICE_MISSING = 'MINIMAX_TTS_VOICE missing';

export const MINIMAX_LANGUAGE_BOOSTS = [
  'Chinese',
  'Chinese,Yue',
  'English',
  'Arabic',
  'Russian',
  'Spanish',
  'French',
  'Portuguese',
  'German',
  'Turkish',
  'Dutch',
  'Ukrainian',
  'Vietnamese',
  'Indonesian',
  'Japanese',
  'Italian',
  'Korean',
  'Thai',
  'Polish',
  'Romanian',
  'Greek',
  'Czech',
  'Finnish',
  'Hindi',
  'Bulgarian',
  'Danish',
  'Hebrew',
  'Malay',
  'Persian',
  'Slovak',
  'Swedish',
  'Croatian',
  'Filipino',
  'Hungarian',
  'Norwegian',
  'Slovenian',
  'Catalan',
  'Nynorsk',
  'Tamil',
  'Afrikaans',
  'auto',
] as const;

export type MiniMaxLanguageBoost = (typeof MINIMAX_LANGUAGE_BOOSTS)[number];

export type MiniMaxTtsConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  format: TtsAudioFormat;
  languageBoost: MiniMaxLanguageBoost;
  timeoutMs: number;
  maxResponseBytes: number;
};

export function joinT2aV2Url(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new AppError(ErrorCode.TTS_PROVIDER_NOT_CONFIGURED);
  }
  if (trimmed.endsWith('/t2a_v2')) {
    return trimmed;
  }
  return `${trimmed}/t2a_v2`;
}

export function parseMiniMaxFormat(value: string | undefined): TtsAudioFormat {
  const format = (value?.trim().toLowerCase() || 'mp3') as TtsAudioFormat;
  if (!ALLOWED_TTS_FORMATS.includes(format)) {
    throw new AppError(ErrorCode.TTS_PROVIDER_INVALID_INPUT);
  }
  return format;
}

export function parseMiniMaxSpeed(speed: number | undefined): number {
  const value = speed ?? 1;
  if (!Number.isFinite(value) || value < MINIMAX_MIN_SPEED || value > MINIMAX_MAX_SPEED) {
    throw new AppError(ErrorCode.TTS_PROVIDER_INVALID_INPUT);
  }
  return value;
}

export function parseMiniMaxLanguageBoost(value: string | undefined): MiniMaxLanguageBoost {
  const boost = (value?.trim() || 'Chinese') as MiniMaxLanguageBoost;
  if (!(MINIMAX_LANGUAGE_BOOSTS as readonly string[]).includes(boost)) {
    throw new AppError(ErrorCode.TTS_PROVIDER_INVALID_INPUT);
  }
  return boost;
}

export function parseMiniMaxTimeoutMs(): number {
  const value = Number(process.env.MINIMAX_TTS_TIMEOUT_MS ?? DEFAULT_MINIMAX_TIMEOUT_MS);
  if (!Number.isFinite(value) || value < 1_000) {
    return DEFAULT_MINIMAX_TIMEOUT_MS;
  }
  return Math.min(300_000, Math.floor(value));
}

export function parseMiniMaxMaxResponseBytes(): number {
  const value = Number(process.env.MINIMAX_TTS_MAX_RESPONSE_BYTES ?? DEFAULT_MINIMAX_MAX_RESPONSE_BYTES);
  if (!Number.isFinite(value) || value < 1024) {
    return DEFAULT_MINIMAX_MAX_RESPONSE_BYTES;
  }
  return Math.min(MINIMAX_HARD_MAX_RESPONSE_BYTES, Math.floor(value));
}

export function readMiniMaxTtsConfig(): MiniMaxTtsConfig {
  return {
    baseUrl: process.env.MINIMAX_TTS_BASE_URL?.trim().replace(/\/+$/, '') ?? '',
    apiKey: process.env.MINIMAX_TTS_API_KEY?.trim() ?? '',
    model: process.env.MINIMAX_TTS_MODEL?.trim() || DEFAULT_MINIMAX_MODEL,
    voice: process.env.MINIMAX_TTS_VOICE?.trim() ?? '',
    format: parseMiniMaxFormat(process.env.MINIMAX_TTS_FORMAT),
    languageBoost: parseMiniMaxLanguageBoost(process.env.MINIMAX_TTS_LANGUAGE_BOOST),
    timeoutMs: parseMiniMaxTimeoutMs(),
    maxResponseBytes: parseMiniMaxMaxResponseBytes(),
  };
}

export function isMiniMaxTtsConfigured(config = readMiniMaxTtsConfig()): boolean {
  return Boolean(config.apiKey && config.baseUrl && config.model && config.voice);
}

export function assertMiniMaxTtsConfigured(config = readMiniMaxTtsConfig()): MiniMaxTtsConfig {
  if (!config.voice && config.apiKey && config.baseUrl && config.model) {
    throw new AppError(ErrorCode.TTS_PROVIDER_NOT_CONFIGURED, MINIMAX_VOICE_MISSING);
  }
  if (!isMiniMaxTtsConfigured(config)) {
    throw new AppError(ErrorCode.TTS_PROVIDER_NOT_CONFIGURED);
  }
  return config;
}
