import { parse } from 'csv-parse/sync';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { hasMappedMetricColumn, mappingColumnWarnings, resolveColumnMapping } from './douyin-export-mapping.js';
import {
  DOUYIN_EXPORT_MAPPING_VERSION,
  METRICS_IMPORT_MAX_CELL_CHARS,
  METRICS_IMPORT_MAX_COLUMNS,
  METRICS_IMPORT_MAX_ROWS,
} from './import-file.constants.js';
import { mapRecordToImportRow } from './map-parsed-row.js';
import type { ParsedMetricsImportFile } from './metrics-import.types.js';

export function parseCsvMetricsImport(input: {
  buffer: Buffer;
  fileName: string;
}): ParsedMetricsImportFile {
  let records: string[][];
  try {
    records = parse(input.buffer, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      max_record_size: METRICS_IMPORT_MAX_CELL_CHARS * METRICS_IMPORT_MAX_COLUMNS,
      to: METRICS_IMPORT_MAX_ROWS + 2,
      trim: false,
    }) as string[][];
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'CSV file could not be parsed');
  }

  if (records.length === 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'CSV file has no header row');
  }
  if (records.length > METRICS_IMPORT_MAX_ROWS + 1) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `CSV file exceeds ${METRICS_IMPORT_MAX_ROWS} data rows`);
  }

  const headers = (records[0] ?? []).map((header) => String(header ?? ''));
  if (headers.length === 0 || headers.every((header) => header.trim() === '')) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'CSV file has no header row');
  }
  if (headers.length > METRICS_IMPORT_MAX_COLUMNS) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `CSV file exceeds ${METRICS_IMPORT_MAX_COLUMNS} columns`);
  }

  const mapping = resolveColumnMapping(headers);
  const warnings = mappingColumnWarnings(mapping);
  if (!hasMappedMetricColumn(mapping)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'CSV file has no recognized metric columns');
  }

  const rows = records.slice(1).map((line, index) => {
    const record: Record<string, unknown> = Object.create(null);
    headers.forEach((header, column) => {
      record[header] = line[column];
    });
    return mapRecordToImportRow(index + 2, record, mapping);
  });

  return {
    format: 'CSV',
    fileName: input.fileName,
    mappingVersion: DOUYIN_EXPORT_MAPPING_VERSION,
    sheetName: null,
    rows,
    warnings,
  };
}
