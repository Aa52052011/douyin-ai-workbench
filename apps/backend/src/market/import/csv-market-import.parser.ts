import { parse } from 'csv-parse/sync';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { MarketItemKind } from '../market.types.js';
import {
  MARKET_IMPORT_MAX_CELL_CHARS,
  MARKET_IMPORT_MAX_COLUMNS,
  MARKET_IMPORT_MAX_ROWS,
} from './market-import.constants.js';
import { parseMarketImportMatrix } from './market-import-matrix.js';
import type { ParsedMarketImportFile } from './market-import.types.js';

export function parseCsvMarketImport(input: {
  buffer: Buffer;
  fileName: string;
  kind: MarketItemKind;
  customMapping?: Record<string, string> | null;
}): ParsedMarketImportFile {
  let records: string[][];
  try {
    records = parse(input.buffer, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      max_record_size: MARKET_IMPORT_MAX_CELL_CHARS * MARKET_IMPORT_MAX_COLUMNS,
      to: MARKET_IMPORT_MAX_ROWS + 2,
      trim: false,
    }) as string[][];
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'CSV file could not be parsed');
  }
  if (records.length === 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'CSV file has no header row');
  }
  if (records.length > MARKET_IMPORT_MAX_ROWS + 1) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `CSV file exceeds ${MARKET_IMPORT_MAX_ROWS} data rows`);
  }
  return parseMarketImportMatrix({
    format: 'CSV',
    fileName: input.fileName,
    sheetName: null,
    kind: input.kind,
    matrix: records,
    customMapping: input.customMapping,
  });
}
