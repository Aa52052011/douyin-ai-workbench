import { decodeHexAudio, looksLikeAudioUrl } from '../tts/minimax-tts-audio.js';
import {
  joinMusicGenerationUrl,
  MINIMAX_MUSIC_MODEL,
  MINIMAX_MUSIC_PROVIDER_ID,
} from '../../production-v2/global-director/director-v1.js';

export const MUSIC_TIMEOUT_MS = 240_000;
export const MUSIC_MAX_RESPONSE_BYTES = 25 * 1024 * 1024;

export type MiniMaxMusicRequestV1 = {
  model: typeof MINIMAX_MUSIC_MODEL;
  prompt: string;
  is_instrumental: true;
  stream: false;
  output_format: 'url' | 'hex';
  audio_setting: {
    sample_rate: 44100;
    bitrate: 256000;
    format: 'mp3';
  };
};

export type MiniMaxMusicLiveResultV1 = {
  ok: boolean;
  httpStatus: number;
  vendorStatusCode: number | null;
  vendorStatusMsg: string | null;
  audioBuffer: Buffer | null;
  audioUrlHost: string | null;
  extension: 'mp3' | 'wav' | 'bin';
  traceId: string | null;
  classified:
    | 'LIVE_OK'
    | 'AUTH_OR_PERMISSION'
    | 'TRANSIENT'
    | 'PROVIDER_ERROR';
};

export function instrumentalMusicPrompt(): string {
  return [
    'Instrumental only, no vocals, no choir, no lyrics.',
    'AI software product-demo background score, clean modern technology, professional, light momentum, subtle rhythm, narration-friendly.',
    'Low-to-medium energy, soft synth pads, light pulse, restrained percussion, no heavy drums, no dense lead melody, no dramatic trailer swells.',
    'Structure: short intro, steady middle, slight lift, calm outro.',
    'About 50 seconds, mixable under spoken Chinese narration.',
  ].join(' ');
}

export function buildInstrumentalMusicRequest(): MiniMaxMusicRequestV1 {
  return {
    model: MINIMAX_MUSIC_MODEL,
    prompt: instrumentalMusicPrompt(),
    is_instrumental: true,
    stream: false,
    output_format: 'url',
    audio_setting: {
      sample_rate: 44100,
      bitrate: 256000,
      format: 'mp3',
    },
  };
}

export function redactMusicEvidence(value: unknown): unknown {
  if (typeof value === 'string') {
    if (/sk-|Bearer\s+\S+/i.test(value) || value.length > 400 && /^[0-9a-fA-F]+$/.test(value)) return '[REDACTED]';
    return value.replace(/https?:\/\/[^\s"]+/g, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}/[path-redacted]`;
      } catch {
        return '[REDACTED_URL]';
      }
    });
  }
  if (Array.isArray(value)) return value.map(redactMusicEvidence);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/key|secret|authorization|token|audio|hex|lyrics/i.test(key) && key !== 'is_instrumental') {
        out[key] = typeof item === 'string' && item.length > 80 ? '[REDACTED_AUDIO]' : redactMusicEvidence(item);
        continue;
      }
      out[key] = redactMusicEvidence(item);
    }
    return out;
  }
  return value;
}

export function classifyMusicFailure(httpStatus: number, vendorCode: number | null, message: string): MiniMaxMusicLiveResultV1['classified'] {
  const blob = `${httpStatus} ${vendorCode ?? ''} ${message}`.toLowerCase();
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    vendorCode === 1004 ||
    vendorCode === 2049 ||
    /permission|unauthorized|invalid credential|invalid api key|api key|forbidden|no longer available|existing paying customers|not available to new users/.test(blob)
  ) {
    return 'AUTH_OR_PERMISSION';
  }
  if (httpStatus === 429 || vendorCode === 1002 || httpStatus >= 500 || /timeout|network|econnreset|fetch failed/.test(blob)) {
    return 'TRANSIENT';
  }
  return 'PROVIDER_ERROR';
}

export async function requestMiniMaxMusicOnce(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<MiniMaxMusicLiveResultV1> {
  const key = env.MINIMAX_TTS_API_KEY?.trim() ?? '';
  if (!key) {
    return {
      ok: false,
      httpStatus: 0,
      vendorStatusCode: null,
      vendorStatusMsg: 'MISSING_MINIMAX_TTS_API_KEY',
      audioBuffer: null,
      audioUrlHost: null,
      extension: 'bin',
      traceId: null,
      classified: 'AUTH_OR_PERMISSION',
    };
  }
  const url = joinMusicGenerationUrl(env);
  const body = buildInstrumentalMusicRequest();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MUSIC_TIMEOUT_MS);
  let httpStatus = 0;
  let text = '';
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    httpStatus = response.status;
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.byteLength > MUSIC_MAX_RESPONSE_BYTES) {
      return {
        ok: false,
        httpStatus,
        vendorStatusCode: null,
        vendorStatusMsg: 'RESPONSE_TOO_LARGE',
        audioBuffer: null,
        audioUrlHost: null,
        extension: 'bin',
        traceId: null,
        classified: 'PROVIDER_ERROR',
      };
    }
    text = raw.toString('utf8');
  } catch (error) {
    clearTimeout(timer);
    const message = error instanceof Error ? error.name : 'FETCH_FAILED';
    return {
      ok: false,
      httpStatus: 0,
      vendorStatusCode: null,
      vendorStatusMsg: message === 'AbortError' ? 'TIMEOUT' : 'NETWORK',
      audioBuffer: null,
      audioUrlHost: null,
      extension: 'bin',
      traceId: null,
      classified: 'TRANSIENT',
    };
  }
  clearTimeout(timer);
  let parsed: {
    base_resp?: { status_code?: number; status_msg?: string };
    data?: { status?: number; audio?: string };
    extra_info?: { music_duration?: number };
    trace_id?: string;
  } = {};
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    return {
      ok: false,
      httpStatus,
      vendorStatusCode: null,
      vendorStatusMsg: 'INVALID_JSON',
      audioBuffer: null,
      audioUrlHost: null,
      extension: 'bin',
      traceId: null,
      classified: classifyMusicFailure(httpStatus, null, text.slice(0, 200)),
    };
  }
  const vendorCode = parsed.base_resp?.status_code ?? null;
  const vendorMsg = parsed.base_resp?.status_msg ?? null;
  const audioField = parsed.data?.audio;
  if (httpStatus >= 400 || (vendorCode != null && vendorCode !== 0) || parsed.data?.status !== 2 || !audioField) {
    return {
      ok: false,
      httpStatus,
      vendorStatusCode: vendorCode,
      vendorStatusMsg: vendorMsg,
      audioBuffer: null,
      audioUrlHost: null,
      extension: 'bin',
      traceId: typeof parsed.trace_id === 'string' ? parsed.trace_id : null,
      classified: classifyMusicFailure(httpStatus, vendorCode, `${vendorMsg ?? ''} ${text.slice(0, 200)}`),
    };
  }
  if (looksLikeAudioUrl(audioField)) {
    const host = new URL(audioField).host;
    const download = await fetchImpl(audioField, { method: 'GET' });
    if (!download.ok) {
      return {
        ok: false,
        httpStatus: download.status,
        vendorStatusCode: vendorCode,
        vendorStatusMsg: 'AUDIO_DOWNLOAD_FAILED',
        audioBuffer: null,
        audioUrlHost: host,
        extension: 'mp3',
        traceId: typeof parsed.trace_id === 'string' ? parsed.trace_id : null,
        classified: download.status >= 500 ? 'TRANSIENT' : 'PROVIDER_ERROR',
      };
    }
    const buf = Buffer.from(await download.arrayBuffer());
    return {
      ok: true,
      httpStatus,
      vendorStatusCode: vendorCode,
      vendorStatusMsg: vendorMsg,
      audioBuffer: buf,
      audioUrlHost: host,
      extension: 'mp3',
      traceId: typeof parsed.trace_id === 'string' ? parsed.trace_id : null,
      classified: 'LIVE_OK',
    };
  }
  const buf = decodeHexAudio(audioField);
  return {
    ok: true,
    httpStatus,
    vendorStatusCode: vendorCode,
    vendorStatusMsg: vendorMsg,
    audioBuffer: buf,
    audioUrlHost: null,
    extension: 'mp3',
    traceId: typeof parsed.trace_id === 'string' ? parsed.trace_id : null,
    classified: 'LIVE_OK',
  };
}

export { MINIMAX_MUSIC_PROVIDER_ID };
