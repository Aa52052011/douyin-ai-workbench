import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { classifyMiniMaxStatusCode, classifyTtsHttpStatus, readLimitedResponseBody, sanitizeTtsError } from './tts-errors.js';
import { MINIMAX_VOICE_MISSING } from './minimax-tts-config.js';
import { AppError } from '../../common/errors/app-error.js';

describe('tts errors', () => {
  it('classifies http statuses without leaking payloads', () => {
    expect(classifyTtsHttpStatus(401, '{"error":"nope"}')).toBe(ErrorCode.TTS_PROVIDER_AUTH);
    expect(classifyTtsHttpStatus(403, '')).toBe(ErrorCode.TTS_PROVIDER_AUTH);
    expect(classifyTtsHttpStatus(429, 'rate limit')).toBe(ErrorCode.TTS_PROVIDER_RATE_LIMIT);
    expect(classifyTtsHttpStatus(429, 'insufficient_quota')).toBe(ErrorCode.TTS_PROVIDER_QUOTA);
    expect(classifyTtsHttpStatus(400, 'bad request')).toBe(ErrorCode.TTS_PROVIDER_INVALID_INPUT);
    expect(classifyTtsHttpStatus(400, 'content_filter policy')).toBe(ErrorCode.TTS_PROVIDER_CONTENT_REJECTED);
    expect(classifyTtsHttpStatus(500, 'oops')).toBe(ErrorCode.TTS_PROVIDER_UNAVAILABLE);
    const error = sanitizeTtsError(new Error('fetch failed Authorization: Bearer secret-key'));
    expect(error.code).toBe(ErrorCode.TTS_PROVIDER_UNAVAILABLE);
    expect(error.message).not.toContain('secret-key');
    expect(error.message).not.toContain('Authorization');
  });

  it('classifies MiniMax business status codes', () => {
    expect(classifyMiniMaxStatusCode(1004, 'not authorized')).toBe(ErrorCode.TTS_PROVIDER_AUTH);
    expect(classifyMiniMaxStatusCode(2049, 'invalid API Key')).toBe(ErrorCode.TTS_PROVIDER_AUTH);
    expect(classifyMiniMaxStatusCode(1002, 'rate limit')).toBe(ErrorCode.TTS_PROVIDER_RATE_LIMIT);
    expect(classifyMiniMaxStatusCode(1039, 'token limit')).toBe(ErrorCode.TTS_PROVIDER_RATE_LIMIT);
    expect(classifyMiniMaxStatusCode(1008, 'insufficient balance')).toBe(ErrorCode.TTS_PROVIDER_QUOTA);
    expect(classifyMiniMaxStatusCode(2013, 'invalid params')).toBe(ErrorCode.TTS_PROVIDER_INVALID_INPUT);
    expect(classifyMiniMaxStatusCode(1026, 'sensitive')).toBe(ErrorCode.TTS_PROVIDER_CONTENT_REJECTED);
    expect(classifyMiniMaxStatusCode(1001, 'timeout')).toBe(ErrorCode.TTS_PROVIDER_TIMEOUT);
    expect(classifyMiniMaxStatusCode(1000, 'unknown')).toBe(ErrorCode.TTS_PROVIDER_UNAVAILABLE);
    const sanitized = sanitizeTtsError(new AppError(ErrorCode.TTS_PROVIDER_NOT_CONFIGURED, MINIMAX_VOICE_MISSING));
    expect(sanitized.message).toBe(MINIMAX_VOICE_MISSING);
    expect(JSON.stringify(sanitized.getResponse())).not.toContain('sk-');
  });

  it('rejects oversized responses via content-length', async () => {
    const response = new Response('tiny', {
      status: 200,
      headers: { 'content-length': String(99_999_999), 'content-type': 'audio/mpeg' },
    });
    await expect(readLimitedResponseBody(response, 1024)).rejects.toMatchObject({
      code: ErrorCode.TTS_PROVIDER_INVALID_RESPONSE,
    });
  });
});
