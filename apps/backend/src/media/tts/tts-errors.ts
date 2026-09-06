import { AppError, ErrorCode, type ErrorCodeValue } from '../../common/errors/app-error.js';
import { MINIMAX_VOICE_MISSING } from './minimax-tts-config.js';

const PUBLIC_TTS_CODES: ErrorCodeValue[] = [
  ErrorCode.TTS_PROVIDER_NOT_CONFIGURED,
  ErrorCode.TTS_PROVIDER_AUTH,
  ErrorCode.TTS_PROVIDER_RATE_LIMIT,
  ErrorCode.TTS_PROVIDER_QUOTA,
  ErrorCode.TTS_PROVIDER_INVALID_INPUT,
  ErrorCode.TTS_PROVIDER_CONTENT_REJECTED,
  ErrorCode.TTS_PROVIDER_TIMEOUT,
  ErrorCode.TTS_PROVIDER_UNAVAILABLE,
  ErrorCode.TTS_PROVIDER_INVALID_RESPONSE,
];

export function ttsError(code: ErrorCodeValue): AppError {
  return new AppError(code);
}

export function classifyTtsHttpStatus(status: number, bodyText: string): ErrorCodeValue {
  const snippet = bodyText.slice(0, 400).toLowerCase();
  if (status === 401 || status === 403) {
    return ErrorCode.TTS_PROVIDER_AUTH;
  }
  if (status === 429) {
    return snippet.includes('quota') || snippet.includes('insufficient')
      ? ErrorCode.TTS_PROVIDER_QUOTA
      : ErrorCode.TTS_PROVIDER_RATE_LIMIT;
  }
  if (status === 408) {
    return ErrorCode.TTS_PROVIDER_TIMEOUT;
  }
  if (status >= 500) {
    return ErrorCode.TTS_PROVIDER_UNAVAILABLE;
  }
  if (status === 400 || status === 422) {
    if (snippet.includes('content') && (snippet.includes('filter') || snippet.includes('policy') || snippet.includes('safety'))) {
      return ErrorCode.TTS_PROVIDER_CONTENT_REJECTED;
    }
    if (snippet.includes('quota')) {
      return ErrorCode.TTS_PROVIDER_QUOTA;
    }
    return ErrorCode.TTS_PROVIDER_INVALID_INPUT;
  }
  return ErrorCode.TTS_PROVIDER_UNAVAILABLE;
}

export function classifyMiniMaxStatusCode(statusCode: number, statusMsg: string): ErrorCodeValue {
  const snippet = statusMsg.slice(0, 400).toLowerCase();
  if (statusCode === 1004 || statusCode === 2049) {
    return ErrorCode.TTS_PROVIDER_AUTH;
  }
  if (statusCode === 1002 || statusCode === 1039 || statusCode === 2045) {
    return ErrorCode.TTS_PROVIDER_RATE_LIMIT;
  }
  if (statusCode === 1008 || statusCode === 2056) {
    return ErrorCode.TTS_PROVIDER_QUOTA;
  }
  if (statusCode === 1001) {
    return ErrorCode.TTS_PROVIDER_TIMEOUT;
  }
  if (statusCode === 1026 || statusCode === 1027 || statusCode === 1042) {
    return ErrorCode.TTS_PROVIDER_CONTENT_REJECTED;
  }
  if (statusCode === 2013 || statusCode === 20132 || statusCode === 2042) {
    return ErrorCode.TTS_PROVIDER_INVALID_INPUT;
  }
  if (snippet.includes('quota') || snippet.includes('insufficient') || snippet.includes('balance')) {
    return ErrorCode.TTS_PROVIDER_QUOTA;
  }
  if (statusCode === 1000 || statusCode === 1024 || statusCode === 1033 || statusCode === 1041) {
    return ErrorCode.TTS_PROVIDER_UNAVAILABLE;
  }
  return ErrorCode.TTS_PROVIDER_UNAVAILABLE;
}

export function isTtsPublicError(error: unknown): error is AppError {
  return error instanceof AppError && PUBLIC_TTS_CODES.includes(error.code);
}

export function sanitizeTtsError(error: unknown): AppError {
  if (isTtsPublicError(error)) {
    if (error.code === ErrorCode.TTS_PROVIDER_NOT_CONFIGURED && error.message === MINIMAX_VOICE_MISSING) {
      return new AppError(error.code, MINIMAX_VOICE_MISSING);
    }
    return new AppError(error.code);
  }
  if (isAbortError(error)) {
    return new AppError(ErrorCode.TTS_PROVIDER_TIMEOUT);
  }
  return new AppError(ErrorCode.TTS_PROVIDER_UNAVAILABLE);
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export async function readLimitedResponseBody(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
  }
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
    }
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
