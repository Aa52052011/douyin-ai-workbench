export type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

export const SUBTITLE_TARGET_CHARS = 15;
export const SUBTITLE_MAX_CHARS = 18;
export const SUBTITLE_SHORT_CHARS = 8;
export const SUBTITLE_MIN_DURATION_SEC = 1;
export const SUBTITLE_MAX_DURATION_SEC = 5;
export const SUBTITLE_TIME_EPSILON = 0.001;

const PRIMARY_SPLIT = /([^。！？；…\n]+[。！？；…]+|\n+|[^。！？；…\n]+)/gu;
const SECONDARY_SPLIT = /([^，、,]+[，、,]+|[^，、,]+)/gu;
const ATOM = /[A-Za-z]+(?:'[A-Za-z]+)?|[0-9]+(?:\.[0-9]+)?|[\s\S]/gu;
const PUNCT_ONLY = /^[^\p{L}\p{N}]+$/u;

export function normalizeSubtitleSemantics(text: string): string {
  return text.replace(/[^\p{L}\p{N}]/gu, '');
}

export function semanticCharCount(text: string): number {
  return normalizeSubtitleSemantics(text).length;
}

export function segmentCanonicalNarration(canonicalText: string): string[] {
  const source = canonicalText.replace(/\r\n/g, '\n').trim();
  if (!source) {
    return [];
  }
  const primary = splitKeep(source, PRIMARY_SPLIT).flatMap((piece) => {
    if (semanticCharCount(piece) <= SUBTITLE_MAX_CHARS) {
      return [piece];
    }
    return splitKeep(piece, SECONDARY_SPLIT).flatMap((secondary) =>
      semanticCharCount(secondary) <= SUBTITLE_MAX_CHARS ? [secondary] : wrapByAtoms(secondary),
    );
  });
  return mergeShortCues(packPieces(primary)).filter((item) => item.length > 0 && !PUNCT_ONLY.test(item));
}

export function buildSubtitleCues(canonicalText: string, actualAudioDuration: number): SubtitleCue[] {
  const segments = segmentCanonicalNarration(canonicalText);
  if (segments.length === 0) {
    return [];
  }
  if (!Number.isFinite(actualAudioDuration) || actualAudioDuration <= 0) {
    return [];
  }
  const weights = segments.map((text) => Math.max(1, semanticCharCount(text)));
  const durations = allocateCueDurations(weights, actualAudioDuration);
  const cues: SubtitleCue[] = [];
  let cursor = 0;
  for (const [index, text] of segments.entries()) {
    const start = index === 0 ? 0 : cursor;
    const rawEnd = index === segments.length - 1 ? actualAudioDuration : cursor + durations[index];
    const end = index === segments.length - 1 ? actualAudioDuration : roundTime(Math.min(actualAudioDuration, rawEnd));
    const safeEnd = Math.max(start + SUBTITLE_TIME_EPSILON, Math.min(actualAudioDuration, end));
    cues.push({ start, end: index === segments.length - 1 ? actualAudioDuration : safeEnd, text });
    cursor = cues[cues.length - 1].end;
  }
  const last = cues[cues.length - 1];
  if (last) {
    last.end = actualAudioDuration;
    if (last.end < last.start) {
      last.start = Math.max(0, actualAudioDuration - SUBTITLE_TIME_EPSILON);
      last.end = actualAudioDuration;
    }
  }
  return cues;
}

export function renderSrt(cues: SubtitleCue[]): string {
  return cues
    .map((cue, index) => `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`)
    .join('\n');
}

export function parseSrt(body: string): SubtitleCue[] {
  const blocks = body.trim().split(/\n\s*\n/);
  return blocks.map((block) => {
    const lines = block.split('\n');
    const times = lines[1]?.split(' --> ') ?? [];
    return {
      start: parseSrtTime(times[0] ?? '00:00:00,000'),
      end: parseSrtTime(times[1] ?? '00:00:00,000'),
      text: lines.slice(2).join('\n'),
    };
  });
}

function splitKeep(text: string, pattern: RegExp): string[] {
  const parts = text.match(pattern) ?? [text];
  return parts.map((item) => item.replace(/^\n+|\n+$/g, '')).filter((item) => item.length > 0 && !/^\n+$/.test(item));
}

function wrapByAtoms(text: string): string[] {
  const atoms = text.match(ATOM) ?? [text];
  const pieces: string[] = [];
  let current = '';
  for (const atom of atoms) {
    const next = current + atom;
    if (current && semanticCharCount(next) > SUBTITLE_MAX_CHARS && !PUNCT_ONLY.test(atom)) {
      pieces.push(current);
      current = atom;
    } else {
      current = next;
    }
  }
  if (current) {
    pieces.push(current);
  }
  return pieces;
}

function packPieces(pieces: string[]): string[] {
  const packed: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (!current) {
      current = piece;
      continue;
    }
    if (semanticCharCount(current + piece) <= SUBTITLE_MAX_CHARS) {
      current += piece;
    } else {
      packed.push(current);
      current = piece;
    }
  }
  if (current) {
    packed.push(current);
  }
  return packed;
}

function mergeShortCues(cues: string[]): string[] {
  const next = [...cues];
  let index = 0;
  while (index < next.length) {
    if (semanticCharCount(next[index]) >= SUBTITLE_SHORT_CHARS) {
      index += 1;
      continue;
    }
    if (index > 0 && semanticCharCount(next[index - 1] + next[index]) <= SUBTITLE_MAX_CHARS) {
      next[index - 1] += next[index];
      next.splice(index, 1);
      continue;
    }
    if (index + 1 < next.length && semanticCharCount(next[index] + next[index + 1]) <= SUBTITLE_MAX_CHARS) {
      next[index] += next[index + 1];
      next.splice(index + 1, 1);
      continue;
    }
    index += 1;
  }
  return next;
}

function allocateCueDurations(weights: number[], audioDuration: number): number[] {
  const count = weights.length;
  const weightSum = weights.reduce((sum, item) => sum + item, 0);
  if (count === 1) {
    return [audioDuration];
  }
  const raw = weights.map((weight) => (audioDuration * weight) / weightSum);
  if (count * SUBTITLE_MIN_DURATION_SEC > audioDuration + SUBTITLE_TIME_EPSILON) {
    return raw;
  }
  let durations = raw.map((item) =>
    Math.min(SUBTITLE_MAX_DURATION_SEC, Math.max(SUBTITLE_MIN_DURATION_SEC, item)),
  );
  for (let pass = 0; pass < 8; pass += 1) {
    const sum = durations.reduce((total, item) => total + item, 0);
    const drift = audioDuration - sum;
    if (Math.abs(drift) <= SUBTITLE_TIME_EPSILON) {
      break;
    }
    if (drift < 0) {
      const flexible = durations.map((item) => Math.max(0, item - SUBTITLE_MIN_DURATION_SEC));
      const flexSum = flexible.reduce((total, item) => total + item, 0);
      if (flexSum <= 0) {
        break;
      }
      durations = durations.map((item, index) => item + (drift * flexible[index]) / flexSum);
      continue;
    }
    const room = durations.map((item) => Math.max(0, SUBTITLE_MAX_DURATION_SEC - item));
    const roomSum = room.reduce((total, item) => total + item, 0);
    if (roomSum <= 0) {
      durations[count - 1] += drift;
      break;
    }
    durations = durations.map((item, index) => item + (drift * room[index]) / roomSum);
  }
  return durations;
}

function formatSrtTime(seconds: number): string {
  const msTotal = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(msTotal / 3_600_000);
  const minutes = Math.floor((msTotal % 3_600_000) / 60_000);
  const secs = Math.floor((msTotal % 60_000) / 1000);
  const ms = msTotal % 1000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(ms, 3)}`;
}

function parseSrtTime(value: string): number {
  const match = value.trim().match(/(\d+):(\d+):(\d+),(\d+)/);
  if (!match) {
    return 0;
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

function pad(value: number, size: number): string {
  return String(value).padStart(size, '0');
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
