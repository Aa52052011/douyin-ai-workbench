import ExcelJS from 'exceljs';
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

type FormulaCell = { formula: string; result?: unknown };

export async function parseXlsxMetricsImport(input: {
  buffer: Buffer;
  fileName: string;
}): Promise<ParsedMetricsImportFile> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(input.buffer as unknown as ArrayBuffer);
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'XLSX file could not be parsed');
  }

  const worksheet = firstDataWorksheet(workbook);
  if (!worksheet) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'XLSX file has no worksheet with a header row');
  }

  if (worksheet.rowCount > METRICS_IMPORT_MAX_ROWS + 1) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `XLSX file exceeds ${METRICS_IMPORT_MAX_ROWS} data rows`);
  }

  const matrix: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > METRICS_IMPORT_MAX_ROWS + 1) {
      return;
    }
    const values: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber > METRICS_IMPORT_MAX_COLUMNS + 1) {
        return;
      }
      values[colNumber - 1] = readCellValue(cell.value);
    });
    matrix[rowNumber - 1] = values;
  });

  const headerRow = matrix[0];
  if (!headerRow) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'XLSX file has no header row');
  }
  if (headerRow.length > METRICS_IMPORT_MAX_COLUMNS) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `XLSX file exceeds ${METRICS_IMPORT_MAX_COLUMNS} columns`);
  }
  if (matrix.length > METRICS_IMPORT_MAX_ROWS + 1) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `XLSX file exceeds ${METRICS_IMPORT_MAX_ROWS} data rows`);
  }

  const headers = headerRow.map((value) => (value == null ? '' : String(value)));
  const mapping = resolveColumnMapping(headers);
  const warnings = mappingColumnWarnings(mapping);
  if (!hasMappedMetricColumn(mapping)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'XLSX file has no recognized metric columns');
  }

  const rows = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const line = matrix[index] ?? [];
    const record: Record<string, unknown> = Object.create(null);
    let formulaWarned = false;
    headers.forEach((header, column) => {
      const raw = line[column];
      if (isFormulaWrapper(raw)) {
        record[header] = raw.result ?? null;
        if (!formulaWarned) {
          warnings.push(`Row ${index + 1} contained a formula cell; cached value was used, formula was not executed`);
          formulaWarned = true;
        }
      } else {
        record[header] = raw;
      }
    });
    rows.push(mapRecordToImportRow(index + 1, record, mapping));
  }

  return {
    format: 'XLSX',
    fileName: input.fileName,
    mappingVersion: DOUYIN_EXPORT_MAPPING_VERSION,
    sheetName: worksheet.name,
    rows,
    warnings,
  };
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
  if (typeof value === 'string' && value.length > METRICS_IMPORT_MAX_CELL_CHARS) {
    return value.slice(0, METRICS_IMPORT_MAX_CELL_CHARS);
  }
  return value;
}

function isFormulaWrapper(value: unknown): value is FormulaCell {
  return Boolean(value && typeof value === 'object' && 'formula' in value);
}
