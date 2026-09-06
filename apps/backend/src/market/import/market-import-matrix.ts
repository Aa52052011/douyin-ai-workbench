import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { MarketItemKind } from '../market.types.js';
import {
  MARKET_IMPORT_MAPPING_VERSION,
  MARKET_IMPORT_MAX_COLUMNS,
  MARKET_IMPORT_MAX_ROWS,
} from './market-import.constants.js';
import { resolveMarketImportMapping, sanitizeDetectedColumns } from './market-import-mapping.js';
import { mapCellsToMarketImportRow } from './market-import-row.js';
import type { ParsedMarketImportFile } from './market-import.types.js';
import type { MarketImportFormat } from './market-import.constants.js';

export function parseMarketImportMatrix(input: {
  format: MarketImportFormat;
  fileName: string;
  sheetName: string | null;
  kind: MarketItemKind;
  matrix: unknown[][];
  customMapping?: Record<string, string> | null;
  extraWarnings?: string[];
}): ParsedMarketImportFile {
  const headerRow = input.matrix[0];
  if (!headerRow || headerRow.every((value) => value == null || String(value).trim() === '')) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'file has no header row');
  }
  if (headerRow.length > MARKET_IMPORT_MAX_COLUMNS) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `file exceeds ${MARKET_IMPORT_MAX_COLUMNS} columns`);
  }
  if (input.matrix.length > MARKET_IMPORT_MAX_ROWS + 1) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `file exceeds ${MARKET_IMPORT_MAX_ROWS} data rows`);
  }

  const detectedColumns = sanitizeDetectedColumns(headerRow);
  const resolvedMapping = resolveMarketImportMapping({
    kind: input.kind,
    detectedColumns,
    customMapping: input.customMapping,
  });
  const warnings = [...(input.extraWarnings ?? []), ...resolvedMapping.warnings];
  const rows = [];
  for (let index = 1; index < input.matrix.length; index += 1) {
    const line = input.matrix[index] ?? [];
    if (isEmptyLine(line)) {
      continue;
    }
    const record: Record<string, unknown> = Object.create(null);
    detectedColumns.forEach((header, column) => {
      record[header] = line[column] ?? null;
    });
    rows.push(
      mapCellsToMarketImportRow({
        rowNumber: index + 1,
        cells: record,
        mapping: resolvedMapping,
      }),
    );
  }

  return {
    format: input.format,
    fileName: input.fileName,
    mappingVersion: MARKET_IMPORT_MAPPING_VERSION,
    sheetName: input.sheetName,
    detectedColumns,
    resolvedMapping,
    rows,
    warnings,
  };
}

function isEmptyLine(line: unknown[]): boolean {
  return line.every((value) => value == null || String(value).trim() === '');
}
