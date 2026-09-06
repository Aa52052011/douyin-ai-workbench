import { ErrorCode } from '../../common/errors/app-error.js';
import { ttsError } from './tts-errors.js';

export function decodeHexAudio(value: string): Buffer {
  const cleaned = value.replace(/^0x/i, '').replace(/\s+/g, '').trim();
  if (!cleaned || cleaned.length % 2 !== 0 || /[^0-9a-fA-F]/.test(cleaned)) {
    throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
  }
  const body = Buffer.from(cleaned, 'hex');
  if (body.byteLength === 0) {
    throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
  }
  return body;
}

export function looksLikeAudioUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}
