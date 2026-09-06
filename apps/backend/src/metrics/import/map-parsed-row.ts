import type { NormalizedPublicationMetrics } from '../ingestion.types.js';
import {
  METRIC_IMPORT_FIELDS,
  type CanonicalImportField,
  type ResolvedColumnMapping,
} from './douyin-export-mapping.js';
import { METRICS_IMPORT_MAX_CELL_CHARS } from './import-file.constants.js';
import { parseImportDateTime } from './parse-import-datetime.js';
import {
  looksLikeFormula,
  parseImportCompletionRate,
  parseImportCount,
  parseImportWatchTimeSeconds,
  stringifyCell,
} from './parse-import-number.js';
import type { ParsedMetricsImportRow } from './metrics-import.types.js';

export function mapRecordToImportRow(
  rowNumber: number,
  record: Record<string, unknown>,
  mapping: ResolvedColumnMapping,
): ParsedMetricsImportRow {
  const warnings: string[] = [];
  const errors: string[] = [];
  const rawColumns: Record<string, string> = Object.create(null);

  for (const [header, value] of Object.entries(record)) {
    const text = cellToPreviewText(value);
    if (text != null) {
      rawColumns[header] = text.slice(0, METRICS_IMPORT_MAX_CELL_CHARS);
    }
    if (typeof text === 'string' && text.length > METRICS_IMPORT_MAX_CELL_CHARS) {
      warnings.push(`Column "${header}" was truncated`);
    }
  }

  const read = (field: CanonicalImportField): unknown => {
    const header = mapping.fieldToHeader[field];
    return header ? record[header] : undefined;
  };

  const rawTitle = stringifyCell(read('title'));
  const rawUrl = stringifyCell(read('url'));
  const externalPostId = stringifyCell(read('externalPostId'));
  const publishedAt = parseOptionalDate(read('publishedAt'), '发布时间', errors);
  const fileObservedAt = parseOptionalDate(read('observedAt'), '数据截止时间', errors);
  const exportedAt = parseOptionalDate(read('exportedAt'), '导出时间', errors);
  const observedAt = fileObservedAt ?? exportedAt;
  const providerCollectedAt = exportedAt;

  if (!fileObservedAt && exportedAt) {
    warnings.push('observedAt fell back to export time');
  }

  const metrics: Partial<NormalizedPublicationMetrics> = {};
  assignCount(metrics, 'views', read('views'), errors);
  assignCount(metrics, 'likes', read('likes'), errors);
  assignCount(metrics, 'comments', read('comments'), errors);
  assignCount(metrics, 'shares', read('shares'), errors);
  assignCount(metrics, 'favorites', read('favorites'), errors);
  assignCount(metrics, 'newFollowers', read('newFollowers'), errors);
  assignWatchTime(metrics, read('averageWatchTimeSeconds'), errors);
  assignCompletionRate(metrics, read('completionRate'), errors);

  const hasMetric = METRIC_IMPORT_FIELDS.some((field) => metrics[field] != null);
  if (!hasMetric) {
    errors.push('At least one metric is required');
  }
  if (!observedAt) {
    errors.push('observedAt is required');
  }

  return {
    rowNumber,
    rawTitle,
    rawUrl,
    externalPostId,
    publishedAt,
    observedAt,
    providerCollectedAt,
    metrics,
    rawColumns,
    warnings,
    errors,
  };
}

function assignCount(
  metrics: Partial<NormalizedPublicationMetrics>,
  key: 'views' | 'likes' | 'comments' | 'shares' | 'favorites' | 'newFollowers',
  raw: unknown,
  errors: string[],
): void {
  const parsed = parseImportCount(raw);
  if (parsed.ok) {
    metrics[key] = parsed.value;
    return;
  }
  if (parsed.reason === 'empty') {
    return;
  }
  errors.push(`${key} is ${parsed.reason}`);
}

function assignWatchTime(
  metrics: Partial<NormalizedPublicationMetrics>,
  raw: unknown,
  errors: string[],
): void {
  const parsed = parseImportWatchTimeSeconds(raw);
  if (parsed.ok) {
    metrics.averageWatchTimeSeconds = parsed.value;
    return;
  }
  if (parsed.reason === 'empty') {
    return;
  }
  errors.push(`averageWatchTimeSeconds is ${parsed.reason}`);
}

function assignCompletionRate(
  metrics: Partial<NormalizedPublicationMetrics>,
  raw: unknown,
  errors: string[],
): void {
  const parsed = parseImportCompletionRate(raw);
  if (parsed.ok) {
    metrics.completionRate = parsed.value;
    return;
  }
  if (parsed.reason === 'empty') {
    return;
  }
  if (parsed.reason === 'ambiguous_percent') {
    errors.push('completionRate is ambiguous without a percent sign or 0–1 value');
    return;
  }
  errors.push(`completionRate is ${parsed.reason}`);
}

function parseOptionalDate(raw: unknown, label: string, errors: string[]): Date | null {
  if (stringifyCell(raw) == null && !(raw instanceof Date) && typeof raw !== 'number') {
    return null;
  }
  const parsed = parseImportDateTime(raw);
  if (!parsed) {
    errors.push(`${label} is invalid`);
    return null;
  }
  return parsed;
}

export function cellToPreviewText(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const text = stringifyCell(value);
  if (text && looksLikeFormula(text)) {
    return text;
  }
  return text;
}
