import { PG_INT_MAX } from '../../metrics/publication-metrics.constants.js';
import {
  looksLikeFormula,
  parseImportCompletionRate,
  stringifyCell,
  type ParsedImportNumber,
} from '../../metrics/import/parse-import-number.js';

export { parseImportCompletionRate, stringifyCell, looksLikeFormula };
export type { ParsedImportNumber };

export function parseMarketImportCount(raw: unknown): ParsedImportNumber {
  if (typeof raw === 'number') {
    return finalizeInteger(raw);
  }
  const text = stringifyCell(raw);
  if (text == null) {
    return { ok: false, reason: 'empty' };
  }
  if (looksLikeFormula(text)) {
    return { ok: false, reason: 'invalid' };
  }
  if (/[万萬wW亿]/.test(text)) {
    return { ok: false, reason: 'invalid' };
  }
  const token = text.replace(/,/g, '').replace(/\s+/g, '');
  if (!/^[+]?\d+$/.test(token)) {
    return { ok: false, reason: 'invalid' };
  }
  return finalizeInteger(Number(token));
}

export function parseMarketImportScore(raw: unknown): ParsedImportNumber {
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
  if (/[万萬wW亿%]/.test(text)) {
    return { ok: false, reason: 'invalid' };
  }
  const token = text.replace(/,/g, '').replace(/\s+/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) {
    return { ok: false, reason: 'invalid' };
  }
  return finalizeNumber(Number(token));
}

function finalizeInteger(value: number): ParsedImportNumber {
  const finalized = finalizeNumber(value);
  if (!finalized.ok) {
    return finalized;
  }
  if (!Number.isInteger(finalized.value)) {
    return { ok: false, reason: 'invalid' };
  }
  if (finalized.value > PG_INT_MAX) {
    return { ok: false, reason: 'overflow' };
  }
  return finalized;
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
