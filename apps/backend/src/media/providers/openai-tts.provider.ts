import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import { probeAudioDuration } from '../audio/probe-audio-duration.js';
import { assertAudioMatchesFormat, mimeForTtsFormat } from '../audio/audio-format.js';
import { StorageService } from '../storage/storage.service.js';
import type { TtsProvider, TtsSynthesizeRequest, TtsSynthesizeResult } from './media-provider.types.js';
import {
  assertOpenAiTtsConfigured,
  joinAudioSpeechUrl,
  parseTtsSpeed,
  readOpenAiTtsConfig,
  TTS_PROVIDER_OPENAI,
  type OpenAiTtsConfig,
} from '../tts/tts-config.js';
import { classifyTtsHttpStatus, isAbortError, readLimitedResponseBody, sanitizeTtsError, ttsError } from '../tts/tts-errors.js';
import { mapVoiceStyle, normalizeTtsText } from '../tts/tts-voice.js';

export type OpenAiTtsFetch = typeof fetch;
export type OpenAiTtsProbe = (body: Buffer, mimeType: string) => Promise<number | null>;

@Injectable()
export class OpenAiTtsProvider implements TtsProvider {
  readonly id = TTS_PROVIDER_OPENAI;
  readonly capabilities = { tts: true, async: false as const };

  constructor(private readonly storage: StorageService) {}

  async synthesize(request: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    return this.synthesizeWith(request, globalThis.fetch.bind(globalThis), probeAudioDuration);
  }

  async synthesizeWith(
    request: TtsSynthesizeRequest,
    fetchImpl: OpenAiTtsFetch,
    probe: OpenAiTtsProbe = probeAudioDuration,
  ): Promise<TtsSynthesizeResult> {
    const config = assertOpenAiTtsConfigured(readOpenAiTtsConfig());
    try {
      const body = await requestSpeechAudio(config, request, fetchImpl);
      const mimeType = mimeForTtsFormat(config.format);
      const duration = await probe(body, mimeType);
      if (duration == null || duration <= 0) {
        throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
      }
      const stored = await this.storage.put(request.storageKey, body, { mimeType });
      const seconds = Math.max(1, Math.round(duration));
      return {
        storageKey: stored.key,
        duration: seconds,
        mimeType,
        size: stored.size,
        usage: {
          inputCharacters: normalizeTtsText(request.text).length,
          audioSeconds: seconds,
          audioSecondsExact: duration,
          provider: this.id,
          model: config.model,
        },
      };
    } catch (error) {
      throw sanitizeTtsError(error);
    }
  }
}

export async function requestSpeechAudio(
  config: OpenAiTtsConfig,
  request: TtsSynthesizeRequest,
  fetchImpl: OpenAiTtsFetch,
): Promise<Buffer> {
  const text = normalizeTtsText(request.text);
  if (!text) {
    throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_INPUT);
  }
  const speed = parseTtsSpeed(request.speed);
  const voice = mapVoiceStyle(request.voice, config.voice);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(joinAudioSpeechUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...(request.clientRequestId ? { 'X-Client-Request-Id': request.clientRequestId } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        input: text,
        voice,
        response_format: config.format,
        speed,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errBody = await readErrorSnippet(response);
      throw ttsError(classifyTtsHttpStatus(response.status, errBody));
    }
    const bytes = await readLimitedResponseBody(response, config.maxResponseBytes);
    assertAudioMatchesFormat(bytes, config.format, response.headers.get('content-type'));
    return bytes;
  } catch (error) {
    if (isAbortError(error)) {
      throw ttsError(ErrorCode.TTS_PROVIDER_TIMEOUT);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorSnippet(response: Response): Promise<string> {
  try {
    const raw = await readLimitedResponseBody(response, 4_000);
    return raw.toString('utf8');
  } catch {
    return '';
  }
}
