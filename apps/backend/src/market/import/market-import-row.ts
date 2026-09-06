import {
  MARKET_MAX_AUDIENCE_EXAMPLES,
  MARKET_MAX_CONTENT_KEYWORDS,
  MARKET_MAX_CONTENT_THEMES,
  MARKET_MAX_HASHTAGS,
  MARKET_MAX_RELATED_KEYWORDS,
  MARKET_STRING_LIMITS,
} from '../market.constants.js';
import { parseMarketImportDateTimeIso } from './market-import-datetime.js';
import { parseMarketImportList } from './market-import-list.js';
import {
  parseImportCompletionRate,
  parseMarketImportCount,
  parseMarketImportScore,
  stringifyCell,
} from './market-import-number.js';
import {
  MARKET_IMPORT_DANGEROUS_KEYS,
  MARKET_IMPORT_INTEGER_MIN,
  MARKET_IMPORT_MAX_CELL_CHARS,
  MARKET_IMPORT_REQUIRED_BY_KIND,
} from './market-import.constants.js';
import type { MarketImportField, ParsedMarketImportRow, ResolvedMarketImportMapping } from './market-import.types.js';
import { marketImportFieldFormat } from './market-import-templates.js';

const SIGNAL_VALUES = new Set(['low', 'medium', 'high']);
const LIST_LIMITS: Record<string, { maxItems: number; maxItemLength: number; stripHash?: boolean }> = {
  relatedKeywords: { maxItems: MARKET_MAX_RELATED_KEYWORDS, maxItemLength: MARKET_STRING_LIMITS.keyword },
  hashtags: { maxItems: MARKET_MAX_HASHTAGS, maxItemLength: MARKET_STRING_LIMITS.keyword, stripHash: true },
  keywords: { maxItems: MARKET_MAX_CONTENT_KEYWORDS, maxItemLength: MARKET_STRING_LIMITS.keyword },
  contentThemes: { maxItems: MARKET_MAX_CONTENT_THEMES, maxItemLength: MARKET_STRING_LIMITS.topic },
  examples: { maxItems: MARKET_MAX_AUDIENCE_EXAMPLES, maxItemLength: MARKET_STRING_LIMITS.example },
};

export function sanitizeMarketImportCells(cells: Record<string, unknown> | null | undefined): Record<string, string | null> {
  const next: Record<string, string | null> = Object.create(null);
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) {
    return next;
  }
  for (const [key, value] of Object.entries(cells)) {
    if (MARKET_IMPORT_DANGEROUS_KEYS.includes(key.toLowerCase() as (typeof MARKET_IMPORT_DANGEROUS_KEYS)[number])) {
      continue;
    }
    next[key] = cellToString(value);
  }
  return next;
}

export function mapCellsToMarketImportRow(input: {
  rowNumber: number;
  cells: Record<string, unknown>;
  mapping: ResolvedMarketImportMapping;
}): ParsedMarketImportRow {
  const cells = sanitizeMarketImportCells(input.cells);
  const fields: ParsedMarketImportRow['fields'] = {};
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const [source, field] of Object.entries(input.mapping.columns)) {
    const raw = cells[source];
    const parsed = parseField(field, raw);
    if (parsed.warning) {
      warnings.push(parsed.warning);
    }
    if (parsed.error) {
      errors.push(parsed.error);
      continue;
    }
    if (parsed.value !== undefined) {
      fields[field] = parsed.value;
    }
  }

  for (const required of MARKET_IMPORT_REQUIRED_BY_KIND[input.mapping.kind]) {
    const value = fields[required as MarketImportField];
    if (value == null || value === '') {
      errors.push(`${required} is required`);
    }
  }
  if (input.mapping.kind === 'CONTENT' && isWeakContentIdentity(fields)) {
    warnings.push('WEAK_IDENTITY');
  }
  if (input.mapping.kind === 'COMPETITOR' && isWeakCompetitorIdentity(fields)) {
    warnings.push('WEAK_IDENTITY');
  }

  return { rowNumber: input.rowNumber, cells, fields, warnings, errors };
}

function parseField(
  field: MarketImportField,
  raw: unknown,
): { value?: unknown; error?: string; warning?: string } {
  const format = marketImportFieldFormat(field);
  if (format === 'integer' || format === 'duration') {
    const parsed = parseMarketImportCount(raw);
    if (!parsed.ok) {
      return parsed.reason === 'empty' ? {} : { error: `${field} is ${parsed.reason}` };
    }
    const min = MARKET_IMPORT_INTEGER_MIN[field as keyof typeof MARKET_IMPORT_INTEGER_MIN] ?? 0;
    if (parsed.value < min) {
      return { error: `${field} is invalid` };
    }
    return { value: parsed.value };
  }
  if (format === 'percent') {
    const text = stringifyCell(raw);
    if (text == null) {
      return {};
    }
    const parsed = parseImportCompletionRate(raw);
    if (!parsed.ok) {
      return {
        error:
          parsed.reason === 'ambiguous_percent'
            ? 'completionRate is ambiguous without a percent sign or 0–1 value'
            : `${field} is ${parsed.reason}`,
      };
    }
    return { value: parsed.value };
  }
  if (format === 'datetime') {
    const hasValue = raw instanceof Date || (typeof raw === 'number' && Number.isFinite(raw)) || stringifyCell(raw) != null;
    if (!hasValue) {
      return {};
    }
    const iso = parseMarketImportDateTimeIso(raw);
    return iso ? { value: iso } : { error: `${field} is invalid` };
  }
  if (format === 'list') {
    const limits = LIST_LIMITS[field];
    const parsed = parseMarketImportList(raw, limits);
    if (!parsed.ok) {
      return { error: `${field} ${parsed.reason}` };
    }
    return { value: parsed.value };
  }
  if (format === 'signal_enum') {
    const text = stringifyCell(raw);
    if (text == null) {
      return {};
    }
    const normalized = text.trim().toLowerCase();
    if (!SIGNAL_VALUES.has(normalized)) {
      return { error: `${field} is invalid` };
    }
    return { value: normalized };
  }
  if (format === 'score') {
    const parsed = parseMarketImportScore(raw);
    if (!parsed.ok) {
      return parsed.reason === 'empty' ? {} : { error: `${field} is ${parsed.reason}` };
    }
    return { value: parsed.value };
  }
  const text = stringifyCell(raw);
  return text == null ? {} : { value: text };
}

function isWeakContentIdentity(fields: ParsedMarketImportRow['fields']): boolean {
  return !fields.externalContentId && !fields.externalUrl && !fields.title && !fields.author && !fields.publishedAt;
}

function isWeakCompetitorIdentity(fields: ParsedMarketImportRow['fields']): boolean {
  return !fields.externalAccountId && !fields.profileUrl;
}

function cellToString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.replace(/\uFEFF/g, '').trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.length > MARKET_IMPORT_MAX_CELL_CHARS ? trimmed.slice(0, MARKET_IMPORT_MAX_CELL_CHARS) : trimmed;
  }
  return stringifyCell(value);
}
