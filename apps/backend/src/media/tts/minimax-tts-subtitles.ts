import type { SpeechTimingCue } from '../providers/media-provider.types.js';

export function parseMiniMaxSubtitlePayload(payload: unknown): SpeechTimingCue[] {
  const rows = extractSubtitleRows(payload);
  const cues: SpeechTimingCue[] = [];
  for (const row of rows) {
    const text = asText(row.text ?? row.content ?? row.word);
    const startMs = asMs(row.time_begin ?? row.start_time ?? row.begin_time ?? row.start);
    const endMs = asMs(row.time_end ?? row.end_time ?? row.finish_time ?? row.end);
    if (!text || startMs == null || endMs == null || endMs <= startMs) {
      continue;
    }
    cues.push({ text, start: startMs / 1000, end: endMs / 1000 });
  }
  return cues;
}

function extractSubtitleRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }
  const nested =
    payload.subtitles ??
    payload.subtitle ??
    payload.utterances ??
    payload.sentences ??
    payload.words ??
    payload.word_list;
  if (typeof nested === 'string') {
    try {
      return extractSubtitleRows(JSON.parse(nested));
    } catch {
      return [];
    }
  }
  if (Array.isArray(nested)) {
    return nested.filter(isRecord);
  }
  if (isRecord(nested)) {
    return extractSubtitleRows(nested);
  }
  return [];
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value >= 0 && value < 1000 && !Number.isInteger(value)) {
    return value * 1000;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
