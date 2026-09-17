import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import { probeAudioDuration } from '../audio/probe-audio-duration.js';
import { assertAudioMatchesFormat, mimeForTtsFormat } from '../audio/audio-format.js';
import { StorageService } from '../storage/storage.service.js';
import type { TtsProvider, TtsSynthesizeRequest, TtsSynthesizeResult } from './media-provider.types.js';
import { decodeHexAudio, looksLikeAudioUrl } from '../tts/minimax-tts-audio.js';
import { parseMiniMaxSubtitlePayload } from '../tts/minimax-tts-subtitles.js';
import {
  assertMiniMaxTtsConfigured,
  joinT2aV2Url,
  MINIMAX_MAX_TEXT_CHARS,
  parseMiniMaxSpeed,
  readMiniMaxTtsConfig,
  TTS_PROVIDER_MINIMAX,
  type MiniMaxTtsConfig,
} from '../tts/minimax-tts-config.js';
import {
  classifyMiniMaxStatusCode,
  classifyTtsHttpStatus,
  isAbortError,
  readLimitedResponseBody,
  sanitizeTtsError,
  ttsError,
} from '../tts/tts-errors.js';
import { normalizeTtsText } from '../tts/tts-voice.js';

export type MiniMaxTtsFetch = typeof fetch;
export type MiniMaxTtsProbe = (body: Buffer, mimeType: string) => Promise<number | null>;

type MiniMaxT2aResponse = {
  data?: { audio?: string; status?: number; subtitle_file?: string; subtitle?: unknown } | null;
  extra_info?: {
    audio_length?: number;
    audio_size?: number;
    usage_characters?: number;
    audio_format?: string;
    word_list?: unknown;
  };
  trace_id?: string;
  base_resp?: { status_code?: number; status_msg?: string };
};

@Injectable()
export class MiniMaxTtsProvider implements TtsProvider {
  readonly id = TTS_PROVIDER_MINIMAX;
  readonly capabilities = { tts: true, async: false as const };
  private readonly logger = new Logger(MiniMaxTtsProvider.name);

  constructor(private readonly storage: StorageService) {}

  async synthesize(request: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    return this.synthesizeWith(request, globalThis.fetch.bind(globalThis), probeAudioDuration);
  }

  async synthesizeWith(
    request: TtsSynthesizeRequest,
    fetchImpl: MiniMaxTtsFetch,
    probe: MiniMaxTtsProbe = probeAudioDuration,
  ): Promise<TtsSynthesizeResult> {
    const config = assertMiniMaxTtsConfigured(readMiniMaxTtsConfig());
    try {
      const { body, extra, speechCues, timingSource } = await requestMiniMaxAudio(config, request, fetchImpl);
      const mimeType = mimeForTtsFormat(config.format);
      assertAudioMatchesFormat(body, config.format, mimeType);
      const providerDurationMs =
        extra.audio_length != null && extra.audio_length > 0 ? extra.audio_length : undefined;
      const duration = await resolveDuration(body, mimeType, providerDurationMs, probe, this.logger);
      const stored = await this.storage.put(request.storageKey, body, { mimeType });
      const seconds = Math.max(1, Math.round(duration));
      return {
        storageKey: stored.key,
        duration: seconds,
        mimeType,
        size: stored.size,
        speechCues,
        timingSource,
        usage: {
          inputCharacters: extra.usage_characters ?? normalizeTtsText(request.text).length,
          audioSeconds: seconds,
          audioSecondsExact: duration,
          provider: this.id,
          model: config.model,
          providerDurationMs,
        },
      };
    } catch (error) {
      throw sanitizeTtsError(error);
    }
  }
}

export async function requestMiniMaxAudio(
  config: MiniMaxTtsConfig,
  request: TtsSynthesizeRequest,
  fetchImpl: MiniMaxTtsFetch,
): Promise<{
  body: Buffer;
  extra: NonNullable<MiniMaxT2aResponse['extra_info']>;
  speechCues: NonNullable<TtsSynthesizeResult['speechCues']>;
  timingSource: NonNullable<TtsSynthesizeResult['timingSource']>;
}> {
  const text = normalizeTtsText(request.text);
  if (!text || text.length > MINIMAX_MAX_TEXT_CHARS) {
    throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_INPUT);
  }
  const speed = parseMiniMaxSpeed(request.speed);
  const voiceId = config.voice.trim();
  if (!voiceId) {
    throw ttsError(ErrorCode.TTS_PROVIDER_NOT_CONFIGURED);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(joinT2aV2Url(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...(request.clientRequestId ? { 'X-Client-Request-Id': request.clientRequestId } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        text,
        stream: false,
        language_boost: config.languageBoost,
        output_format: 'hex',
        subtitle_enable: true,
        subtitle_type: 'sentence',
        voice_setting: {
          voice_id: voiceId,
          speed,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: config.format,
          channel: 1,
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errBody = await readErrorSnippet(response);
      throw ttsError(classifyTtsHttpStatus(response.status, errBody));
    }
    const raw = await readLimitedResponseBody(response, config.maxResponseBytes);
    const parsed = parseMiniMaxJson(raw, response.headers.get('content-type'));
    const statusCode = parsed.base_resp?.status_code;
    if (statusCode !== 0) {
      throw ttsError(classifyMiniMaxStatusCode(statusCode ?? -1, parsed.base_resp?.status_msg ?? ''));
    }
    const audio = parsed.data?.audio;
    if (!audio || looksLikeAudioUrl(audio)) {
      throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
    }
    const speechCues = await resolveMiniMaxSpeechCues(parsed, config, fetchImpl);
    return {
      body: decodeHexAudio(audio),
      extra: parsed.extra_info ?? {},
      speechCues,
      timingSource: speechCues.length > 0 ? 'provider_sentence' : 'none',
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw ttsError(ErrorCode.TTS_PROVIDER_TIMEOUT);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveMiniMaxSpeechCues(
  parsed: MiniMaxT2aResponse,
  config: MiniMaxTtsConfig,
  fetchImpl: MiniMaxTtsFetch,
) {
  const inline = parseMiniMaxSubtitlePayload(parsed.data?.subtitle ?? parsed.extra_info?.word_list ?? parsed);
  if (inline.length > 0) {
    return inline;
  }
  const file = parsed.data?.subtitle_file?.trim();
  if (!file) {
    return [];
  }
  if (file.startsWith('{') || file.startsWith('[')) {
    try {
      return parseMiniMaxSubtitlePayload(JSON.parse(file));
    } catch {
      return [];
    }
  }
  if (!/^https?:\/\//i.test(file)) {
    return [];
  }
  const response = await fetchImpl(file, {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  if (!response.ok) {
    return [];
  }
  const raw = await readLimitedResponseBody(response, config.maxResponseBytes);
  try {
    return parseMiniMaxSubtitlePayload(JSON.parse(raw.toString('utf8')));
  } catch {
    return [];
  }
}

function parseMiniMaxJson(raw: Buffer, contentType: string | null): MiniMaxT2aResponse {
  if (raw.byteLength === 0) {
    throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
  }
  const mime = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  const head = raw.subarray(0, Math.min(raw.byteLength, 16)).toString('utf8').trimStart();
  if (head.startsWith('<!') || head.startsWith('<html') || mime === 'text/html' || mime.startsWith('text/plain')) {
    throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
  }
  if (mime && mime !== 'application/json' && mime !== 'application/octet-stream') {
    throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
  }
  try {
    return JSON.parse(raw.toString('utf8')) as MiniMaxT2aResponse;
  } catch {
    throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
  }
}

async function resolveDuration(
  body: Buffer,
  mimeType: string,
  providerDurationMs: number | undefined,
  probe: MiniMaxTtsProbe,
  logger: Logger,
): Promise<number> {
  const providerSeconds = providerDurationMs != null ? providerDurationMs / 1000 : null;
  const probed = await probe(body, mimeType);
  if (probed != null && probed > 0) {
    if (providerSeconds != null && Math.abs(probed - providerSeconds) > Math.max(1, providerSeconds * 0.5)) {
      logger.warn(`MiniMax duration mismatch providerSeconds=${providerSeconds} probedSeconds=${probed}`);
    }
    return probed;
  }
  if (providerSeconds != null && providerSeconds > 0) {
    return providerSeconds;
  }
  throw ttsError(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
}

async function readErrorSnippet(response: Response): Promise<string> {
  try {
    const raw = await readLimitedResponseBody(response, 4_000);
    return raw.toString('utf8');
  } catch {
    return '';
  }
}
