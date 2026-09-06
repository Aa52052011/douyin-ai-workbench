import { inspectImportFile, type InspectedImportFile } from '../../metrics/import/inspect-import-file.js';
import { MARKET_IMPORT_MAX_FILE_BYTES } from './market-import.constants.js';

export function inspectMarketImportFile(input: {
  originalName: string;
  buffer: Buffer;
}): InspectedImportFile {
  if (input.buffer.length > MARKET_IMPORT_MAX_FILE_BYTES) {
    return { ok: false, reason: 'Import file is too large' };
  }
  return inspectImportFile(input);
}
