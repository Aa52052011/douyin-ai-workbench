export type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

export const SUBTITLE_TARGET_CHARS = 14;
export const SUBTITLE_MAX_CHARS = 18;
export const SUBTITLE_LAYOUT_CHARS = 14;
export const SUBTITLE_MAX_LINES = 2;
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

export function layoutCueText(text: string, maxPerLine = SUBTITLE_LAYOUT_CHARS, maxLines = SUBTITLE_MAX_LINES): string {
  const compact = text.replace(/\\N/g, '\n').replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '';
  }
  if (semanticCharCount(compact) <= maxPerLine && !compact.includes('\n')) {
    return compact;
  }
  const pieces = wrapByMaxChars(compact.replace(/\n/g, ''), maxPerLine);
  if (pieces.length <= 1) {
    return pieces[0] ?? compact;
  }
  if (pieces.length <= maxLines) {
    return pieces.join('\n');
  }
  return `${pieces[0]}\n${pieces.slice(1).join('')}`;
}

const PHRASE_MAJOR = /([^：:。！？；;…\n]+[：:。！？；;…]+|[^：:。！？；;…\n]+)/gu;
const PHRASE_COMMA = /([^，,][^，,]*[，,]+|[^，,]+)/gu;
const PHRASE_DUN = /([^、]+[、]+|[^、]+)/gu;
const CONJUNCTION_SPLIT = /(?<!^)(?=(?:以及|并且|而且))/u;
const SEMANTIC_PAUSE = /(?<=顾客|用户|大家|商家)(?=真正|其实|核心)/u;
const AND_SPLIT = /(?<=[\p{L}\p{N}])和(?=[\p{L}\p{N}])/u;

export function splitNaturalSpeechPhrases(text: string): string[] {
  const source = text.replace(/\s+/g, ' ').trim();
  if (!source) {
    return [];
  }
  return splitKeep(source, PHRASE_MAJOR)
    .flatMap((part) => splitKeep(part, PHRASE_COMMA))
    .flatMap((part) => splitKeep(part, PHRASE_DUN))
    .flatMap((part) => part.split(CONJUNCTION_SPLIT).map((item) => item.trim()).filter(Boolean))
    .flatMap(splitAndConnectors)
    .flatMap((part) => part.split(SEMANTIC_PAUSE).map((item) => item.trim()).filter(Boolean))
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !PUNCT_ONLY.test(item));
}

function splitAndConnectors(text: string): string[] {
  const parts = text.split(AND_SPLIT).map((item) => item.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return [text];
  }
  const packed: string[] = [];
  let current = parts[0] ?? '';
  for (let index = 1; index < parts.length; index += 1) {
    const next = parts[index] ?? '';
    if (semanticCharCount(current) >= 2 && semanticCharCount(next) >= 2) {
      packed.push(current);
      current = next;
    } else {
      current = `${current}和${next}`;
    }
  }
  if (current) {
    packed.push(current);
  }
  return packed.filter((item) => item.length > 0 && !PUNCT_ONLY.test(item));
}

function phraseTimingWeight(text: string): number {
  const spoken = Math.max(1, semanticCharCount(text));
  if (/[。！？…]$/u.test(text)) {
    return spoken + 0.35;
  }
  if (/[：:；;]$/u.test(text)) {
    return spoken + 0.25;
  }
  if (/[，,、]$/u.test(text)) {
    return spoken + 0.15;
  }
  return spoken;
}

export function cuesFromSpeechMarks(
  marks: Array<{ text: string; start: number; end: number }>,
  actualAudioDuration: number,
): SubtitleCue[] {
  const cleaned = marks
    .map((item) => ({
      text: item.text.replace(/\s+/g, ' ').trim(),
      start: Math.max(0, item.start),
      end: Math.max(0, item.end),
    }))
    .filter((item) => item.text && item.end > item.start);
  if (cleaned.length === 0 || !Number.isFinite(actualAudioDuration) || actualAudioDuration <= 0) {
    return [];
  }
  const sentences: SubtitleCue[] = [];
  for (const [index, item] of cleaned.entries()) {
    const start = index === 0 ? 0 : Math.max(sentences[index - 1]?.end ?? 0, Math.min(actualAudioDuration, item.start));
    const end = Math.min(actualAudioDuration, Math.max(start + SUBTITLE_TIME_EPSILON, item.end));
    sentences.push({ start, end, text: item.text });
  }
  for (let i = 0; i < sentences.length - 1; i += 1) {
    if (sentences[i].end > sentences[i + 1].start) {
      sentences[i].end = sentences[i + 1].start;
    }
    if (sentences[i].end <= sentences[i].start) {
      sentences[i].end = Math.min(sentences[i + 1].start, sentences[i].start + SUBTITLE_TIME_EPSILON);
    }
  }
  const lastSentence = sentences[sentences.length - 1];
  if (lastSentence) {
    lastSentence.end = actualAudioDuration;
    if (lastSentence.end <= lastSentence.start) {
      lastSentence.start = Math.max(0, actualAudioDuration - SUBTITLE_TIME_EPSILON);
      lastSentence.end = actualAudioDuration;
    }
  }
  const cues: SubtitleCue[] = [];
  for (const sentence of sentences.filter((item) => item.end > item.start && item.text)) {
    const phrases = splitNaturalSpeechPhrases(sentence.text);
    const units = phrases.length > 0 ? phrases : [sentence.text];
    const span = Math.max(SUBTITLE_TIME_EPSILON, sentence.end - sentence.start);
    const weights = units.map((text) => Math.max(0.2, phraseTimingWeight(text)));
    const weightSum = weights.reduce((total, item) => total + item, 0);
    let cursor = sentence.start;
    for (const [index, text] of units.entries()) {
      const start = cursor;
      const raw = (span * weights[index]) / weightSum;
      const end = index === units.length - 1 ? sentence.end : roundTime(Math.min(sentence.end, start + raw));
      const safeEnd = Math.max(start + SUBTITLE_TIME_EPSILON, Math.min(sentence.end, end));
      cues.push({
        start,
        end: index === units.length - 1 ? sentence.end : safeEnd,
        text: layoutCueText(text),
      });
      cursor = cues[cues.length - 1].end;
    }
  }
  return cues.filter((item) => item.end > item.start && item.text);
}

export function estimateSentenceCues(canonicalText: string, actualAudioDuration: number): SubtitleCue[] {
  const source = canonicalText.replace(/\r\n/g, '\n').trim();
  if (!source || !Number.isFinite(actualAudioDuration) || actualAudioDuration <= 0) {
    return [];
  }
  const segments = splitKeep(source, PRIMARY_SPLIT)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !PUNCT_ONLY.test(item));
  if (segments.length === 0) {
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
    cues.push({
      start,
      end: index === segments.length - 1 ? actualAudioDuration : safeEnd,
      text: layoutCueText(text),
    });
    cursor = cues[cues.length - 1].end;
  }
  return cues;
}

export function speechMarksFromMetadata(metadata: unknown): Array<{ text: string; start: number; end: number }> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return [];
  }
  const raw = (metadata as Record<string, unknown>).speechCues;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const row = item as Record<string, unknown>;
    const text = typeof row.text === 'string' ? row.text : '';
    const start = typeof row.start === 'number' ? row.start : NaN;
    const end = typeof row.end === 'number' ? row.end : NaN;
    if (!text || !Number.isFinite(start) || !Number.isFinite(end)) {
      return [];
    }
    return [{ text, start, end }];
  });
}

export function cueSpokenPhraseCount(text: string): number {
  const phrases = splitNaturalSpeechPhrases(text.replace(/\n/g, ' ').replace(/\\N/g, ' '));
  return Math.max(1, phrases.length || 1);
}

export function subtitleCueStats(cues: SubtitleCue[], audioDuration: number) {
  let overlapCount = 0;
  let negativeDurationCount = 0;
  let outOfRangeCount = 0;
  let active = 0;
  let maxSimultaneousActiveCues = 0;
  const events = cues.flatMap((cue, index) => [
    { time: cue.start, delta: 1, index, kind: 'start' as const },
    { time: cue.end, delta: -1, index, kind: 'end' as const },
  ]);
  events.sort((left, right) => left.time - right.time || (left.kind === 'end' ? -1 : 1) - (right.kind === 'end' ? -1 : 1));
  for (const event of events) {
    active += event.delta;
    maxSimultaneousActiveCues = Math.max(maxSimultaneousActiveCues, active);
  }
  const phraseCounts = cues.map((cue) => cueSpokenPhraseCount(cue.text));
  for (const [index, cue] of cues.entries()) {
    if (cue.end <= cue.start) {
      negativeDurationCount += 1;
    }
    if (cue.start < -SUBTITLE_TIME_EPSILON || cue.end > audioDuration + SUBTITLE_TIME_EPSILON) {
      outOfRangeCount += 1;
    }
    const next = cues[index + 1];
    if (next && cue.end > next.start + SUBTITLE_TIME_EPSILON) {
      overlapCount += 1;
    }
  }
  return {
    cueCount: cues.length,
    firstStart: cues[0]?.start ?? 0,
    lastEnd: cues.at(-1)?.end ?? 0,
    overlapCount,
    negativeDurationCount,
    outOfRangeCount,
    maxSimultaneousActiveCues: cues.length === 0 ? 0 : maxSimultaneousActiveCues,
    multiPhraseCueCount: phraseCounts.filter((count) => count > 1).length,
    maxCuePhraseCount: phraseCounts.length === 0 ? 0 : Math.max(...phraseCounts),
  };
}

export function renderSrt(cues: SubtitleCue[]): string {
  return cues
    .map((cue, index) => `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`)
    .join('\n');
}

export function reflowOverflowCues(cues: SubtitleCue[], maxChars = SUBTITLE_LAYOUT_CHARS): SubtitleCue[] {
  return cues
    .map((cue) => ({
      ...cue,
      text: layoutCueText(cue.text, maxChars, SUBTITLE_MAX_LINES),
    }))
    .filter((cue) => cue.text.length > 0);
}

function wrapByMaxChars(text: string, maxChars: number): string[] {
  const atoms = text.match(ATOM) ?? [text];
  const pieces: string[] = [];
  let current = '';
  for (const atom of atoms) {
    const next = current + atom;
    if (current && semanticCharCount(next) > maxChars && !PUNCT_ONLY.test(atom)) {
      pieces.push(current.trim());
      current = atom;
    } else {
      current = next;
    }
  }
  if (current.trim()) {
    pieces.push(current.trim());
  }
  return pieces;
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
