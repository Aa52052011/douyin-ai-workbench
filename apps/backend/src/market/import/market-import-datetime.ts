import { parseImportDateTime } from '../../metrics/import/parse-import-datetime.js';

export function parseMarketImportDateTime(raw: unknown): Date | null {
  return parseImportDateTime(raw);
}

export function parseMarketImportDateTimeIso(raw: unknown): string | null {
  const date = parseMarketImportDateTime(raw);
  return date ? date.toISOString() : null;
}
