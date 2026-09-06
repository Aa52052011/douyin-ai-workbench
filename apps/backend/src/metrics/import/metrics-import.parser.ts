import { parseCsvMetricsImport } from './csv-metrics-import.parser.js';
import { inspectImportFile } from './inspect-import-file.js';
import type { ParsedMetricsImportFile } from './metrics-import.types.js';
import { parseXlsxMetricsImport } from './xlsx-metrics-import.parser.js';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';

export class MetricsImportParser {
  async parse(input: { originalName: string; buffer: Buffer }): Promise<ParsedMetricsImportFile> {
    const inspected = inspectImportFile(input);
    if (!inspected.ok) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, inspected.reason);
    }
    if (inspected.format === 'CSV') {
      return parseCsvMetricsImport({ buffer: input.buffer, fileName: inspected.fileName });
    }
    return parseXlsxMetricsImport({ buffer: input.buffer, fileName: inspected.fileName });
  }
}
