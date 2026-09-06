import { PG_INT_MAX } from '../publication-metrics.constants.js';

export type ParsedImportNumber =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'invalid' | 'ambiguous_percent' | 'negative' | 'overflow' };

const WAN = 10_000;
const YI = 100_000_000;

export function parseImportCount(raw: unknown): ParsedImportNumber {
  const parsed = parseNumericToken(raw, { allowPercent: false });
  if (!parsed.ok) {
    return parsed;
  }
  if (!Number.isInteger(parsed.value)) {
    return { ok: false, reason: 'invalid' };
  }
  if (parsed.value > PG_INT_MAX) {
    return { ok: false, reason: 'overflow' };
  }
  return parsed;
}

export function parseImportWatchTimeSeconds(raw: unknown): ParsedImportNumber {
  if (typeof raw === 'number') {
    return finalizeNumber(raw);
  }
  const text = stringifyCell(raw);
  if (text == null) {
    return { ok: false, reason: 'empty' };
  }
  const compact = text.replace(/\s+/g, '');
  const secondsSuffix = compact.match(/^(\d+(?:\.\d+)?)s$/i);
  if (secondsSuffix) {
    return finalizeNumber(Number(secondsSuffix[1]));
  }
  const clock = compact.match(/^(\d{1,2}):([0-5]\d)$/);
  if (clock) {
    return finalizeNumber(Number(clock[1]) * 60 + Number(clock[2]));
  }
  return parseNumericToken(raw, { allowPercent: false });
}

export function parseImportCompletionRate(raw: unknown): ParsedImportNumber {
  const text = stringifyCell(raw);
  if (text == null) {
    return { ok: false, reason: 'empty' };
  }
  const hasPercent = /%$/.test(text);
  const parsed = parseNumericToken(text, { allowPercent: true });
  if (!parsed.ok) {
    return parsed;
  }
  if (hasPercent) {
    if (parsed.value < 0 || parsed.value > 1) {
      return { ok: false, reason: 'invalid' };
    }
    return parsed;
  }
  if (parsed.value >= 0 && parsed.value <= 1) {
    return parsed;
  }
  return { ok: false, reason: 'ambiguous_percent' };
}

function parseNumericToken(
  raw: unknown,
  opts: { allowPercent: boolean },
): ParsedImportNumber {
  if (typeof raw === 'number') {
    return finalizeNumber(raw);
  }
  const text = stringifyCell(raw);
  if (text == null) {
    return { ok: false, reason: 'empty' };
  }
  if (looksLikeFormula(text)) {
    return { ok: false, reason: 'invalid' };
  }

  let token = text.replace(/,/g, '').replace(/\s+/g, '');
  let percent = false;
  if (token.endsWith('%')) {
    if (!opts.allowPercent) {
      return { ok: false, reason: 'invalid' };
    }
    percent = true;
    token = token.slice(0, -1);
  }

  let multiplier = 1;
  if (/[万萬]$/.test(token)) {
    multiplier = WAN;
    token = token.slice(0, -1);
  } else if (/[wW]$/.test(token)) {
    multiplier = WAN;
    token = token.slice(0, -1);
  } else if (/亿$/.test(token)) {
    multiplier = YI;
    token = token.slice(0, -1);
  }

  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) {
    return { ok: false, reason: 'invalid' };
  }
  const numeric = Number(token);
  if (!Number.isFinite(numeric)) {
    return { ok: false, reason: 'invalid' };
  }
  const scaled = percent ? (numeric / 100) * multiplier : numeric * multiplier;
  return finalizeNumber(scaled);
}

function finalizeNumber(value: number): ParsedImportNumber {
  if (!Number.isFinite(value)) {
    return { ok: false, reason: 'invalid' };
  }
  if (value < 0) {
    return { ok: false, reason: 'negative' };
  }
  if (value > Number.MAX_SAFE_INTEGER) {
    return { ok: false, reason: 'overflow' };
  }
  return { ok: true, value };
}

export function isUnavailablePlaceholder(text: string): boolean {
  const normalized = text.replace(/\uFEFF/g, '').trim();
  if (normalized.length === 0) {
    return true;
  }
  return normalized === '-' || normalized === '--' || normalized.toLowerCase() === 'n/a' || normalized.toLowerCase() === 'na';
}

export function stringifyCell(raw: unknown): string | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.replace(/\uFEFF/g, '').trim();
    if (trimmed.length === 0 || isUnavailablePlaceholder(trimmed)) {
      return null;
    }
    return trimmed;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === 'boolean') {
    return raw ? '1' : '0';
  }
  return null;
}

export function looksLikeFormula(text: string): boolean {
  if (isUnavailablePlaceholder(text)) {
    return false;
  }
  if (/^[=@\t\r]/.test(text)) {
    return true;
  }
  return /^[+\-]/.test(text) && !/^[+\-]?(?:\d|\.)/.test(text);
}
