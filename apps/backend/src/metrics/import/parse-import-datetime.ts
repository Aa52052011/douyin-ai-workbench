import { stringifyCell } from './parse-import-number.js';

const DATE_TIME =
  /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

export function parseImportDateTime(raw: unknown): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return excelSerialToDate(raw);
  }
  const text = stringifyCell(raw);
  if (text == null) {
    return null;
  }
  const iso = new Date(text);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && !Number.isNaN(iso.getTime())) {
    return iso;
  }
  const match = text.match(DATE_TIME);
  if (!match) {
    if (!Number.isNaN(iso.getTime()) && Number.isNaN(Number(text))) {
      return iso;
    }
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const second = Number(match[6] ?? 0);
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

/** Excel 1900 date system serial, treating the value as UTC days since 1899-12-30. */
export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 0 || serial > 100_000) {
    return null;
  }
  const epoch = Date.UTC(1899, 11, 30);
  const ms = Math.round(serial * 86_400_000);
  const date = new Date(epoch + ms);
  return Number.isNaN(date.getTime()) ? null : date;
}
