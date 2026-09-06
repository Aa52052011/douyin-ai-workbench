import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { MarketItemKind } from '../market.types.js';
import { parseCsvMarketImport } from './csv-market-import.parser.js';
import { inspectMarketImportFile } from './market-import-file-inspector.js';
import type { ParsedMarketImportFile } from './market-import.types.js';
import { parseXlsxMarketImport } from './xlsx-market-import.parser.js';

export async function parseMarketImportFile(input: {
  originalName: string;
  buffer: Buffer;
  kind: MarketItemKind;
  customMapping?: Record<string, string> | null;
}): Promise<ParsedMarketImportFile> {
  const inspected = inspectMarketImportFile({ originalName: input.originalName, buffer: input.buffer });
  if (!inspected.ok) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, inspected.reason);
  }
  if (inspected.format === 'CSV') {
    return parseCsvMarketImport({
      buffer: input.buffer,
      fileName: inspected.fileName,
      kind: input.kind,
      customMapping: input.customMapping,
    });
  }
  return parseXlsxMarketImport({
    buffer: input.buffer,
    fileName: inspected.fileName,
    kind: input.kind,
    customMapping: input.customMapping,
  });
}
