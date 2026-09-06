import { ErrorCode } from '../../common/errors/app-error.js';
import { AppError } from '../../common/errors/app-error.js';
import type { TtsAudioFormat } from '../tts/tts-config.js';

export function mimeForTtsFormat(format: TtsAudioFormat): string {
  return format === 'wav' ? 'audio/wav' : 'audio/mpeg';
}

export function extensionForTtsFormat(format: TtsAudioFormat): '.mp3' | '.wav' {
  return format === 'wav' ? '.wav' : '.mp3';
}

export function filenameForAudioMime(mimeType: string): 'voice.mp3' | 'voice.wav' {
  if (mimeType === 'audio/wav' || mimeType === 'audio/wave') {
    return 'voice.wav';
  }
  if (mimeType === 'audio/mpeg') {
    return 'voice.mp3';
  }
  throw new AppError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
}

export function extensionForAudioMime(mimeType: string | undefined): '.mp3' | '.wav' | null {
  if (mimeType === 'audio/wav' || mimeType === 'audio/wave') {
    return '.wav';
  }
  if (mimeType === 'audio/mpeg') {
    return '.mp3';
  }
  return null;
}

export function isLikelyWav(body: Buffer): boolean {
  return body.length >= 12 && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WAVE';
}

export function isLikelyMp3(body: Buffer): boolean {
  if (body.length < 3) {
    return false;
  }
  if (body.toString('ascii', 0, 3) === 'ID3') {
    return true;
  }
  return body[0] === 0xff && (body[1] & 0xe0) === 0xe0;
}

export function detectAudioMime(body: Buffer): 'audio/mpeg' | 'audio/wav' | null {
  if (isLikelyWav(body)) {
    return 'audio/wav';
  }
  if (isLikelyMp3(body)) {
    return 'audio/mpeg';
  }
  return null;
}

export function assertAudioMatchesFormat(body: Buffer, format: TtsAudioFormat, contentType: string | null): void {
  if (body.length === 0) {
    throw new AppError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
  }
  const head = body.subarray(0, Math.min(body.length, 16)).toString('utf8').trimStart();
  if (head.startsWith('<!') || head.startsWith('<html') || head.startsWith('{') || head.startsWith('[')) {
    throw new AppError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
  }
  const declared = normalizeAudioContentType(contentType);
  const detected = detectAudioMime(body);
  if (!detected) {
    throw new AppError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
  }
  const expected = mimeForTtsFormat(format);
  if (detected !== expected && !(format === 'wav' && detected === 'audio/wav')) {
    throw new AppError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
  }
  if (declared && declared !== expected && declared !== 'application/octet-stream') {
    throw new AppError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
  }
}

function normalizeAudioContentType(contentType: string | null): string | null {
  if (!contentType) {
    return null;
  }
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime === 'audio/wave') {
    return 'audio/wav';
  }
  return mime || null;
}
