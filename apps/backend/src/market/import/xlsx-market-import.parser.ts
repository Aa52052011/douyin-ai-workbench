import ExcelJS from 'exceljs';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { MarketItemKind } from '../market.types.js';
import {
  MARKET_IMPORT_MAX_CELL_CHARS,
  MARKET_IMPORT_MAX_COLUMNS,
  MARKET_IMPORT_MAX_ROWS,
  MARKET_IMPORT_MAX_SHEETS,
} from './market-import.constants.js';
import { parseMarketImportMatrix } from './market-import-matrix.js';
import type { ParsedMarketImportFile } from './market-import.types.js';

type FormulaCell = { formula: string; result?: unknown };

export async function parseXlsxMarketImport(input: {
  buffer: Buffer;
  fileName: string;
  kind: MarketItemKind;
  customMapping?: Record<string, string> | null;
}): Promise<ParsedMarketImportFile> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(input.buffer as unknown as ArrayBuffer);
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'XLSX file could not be parsed');
  }
  if (workbook.worksheets.length > MARKET_IMPORT_MAX_SHEETS) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'XLSX file has too many worksheets');
  }
  const worksheet = firstDataWorksheet(workbook);
  if (!worksheet) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'XLSX file has no worksheet with a header row');
  }
  if (worksheet.rowCount > MARKET_IMPORT_MAX_ROWS + 1) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `XLSX file exceeds ${MARKET_IMPORT_MAX_ROWS} data rows`);
  }

  const extraWarnings: string[] = [];
  const matrix: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > MARKET_IMPORT_MAX_ROWS + 1) {
      return;
    }
    const values: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber > MARKET_IMPORT_MAX_COLUMNS + 1) {
        return;
      }
      const raw = readCellValue(cell.value);
      if (isFormulaWrapper(raw)) {
        values[colNumber - 1] = raw.result ?? null;
        extraWarnings.push(
          `Row ${rowNumber} contained a formula cell; cached value was used, formula was not executed`,
        );
      } else {
        values[colNumber - 1] = raw;
      }
    });
    matrix[rowNumber - 1] = values;
  });

  return parseMarketImportMatrix({
    format: 'XLSX',
    fileName: input.fileName,
    sheetName: worksheet.name,
    kind: input.kind,
    matrix,
    customMapping: input.customMapping,
    extraWarnings: [...new Set(extraWarnings)],
  });
}

function firstDataWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  for (const worksheet of workbook.worksheets) {
    if (worksheet.rowCount >= 1) {
      return worksheet;
    }
  }
  return workbook.worksheets[0] ?? null;
}

function readCellValue(value: ExcelJS.CellValue): unknown {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'object' && value && 'richText' in value) {
    return (value.richText ?? []).map((part) => part.text).join('');
  }
  if (typeof value === 'object' && value && 'text' in value && typeof value.text === 'string') {
    return value.text;
  }
  if (typeof value === 'object' && value && 'formula' in value) {
    const formula = value as FormulaCell;
    return { formula: formula.formula, result: formula.result ?? null };
  }
  if (typeof value === 'object' && value && 'result' in value) {
    return (value as { result?: unknown }).result ?? null;
  }
  if (typeof value === 'string' && value.length > MARKET_IMPORT_MAX_CELL_CHARS) {
    return value.slice(0, MARKET_IMPORT_MAX_CELL_CHARS);
  }
  return value;
}

function isFormulaWrapper(value: unknown): value is FormulaCell {
  return Boolean(value && typeof value === 'object' && 'formula' in value);
}
