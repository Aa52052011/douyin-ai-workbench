import { describe, expect, it } from 'vitest';
import { inspectImportFile } from './inspect-import-file.js';
import { METRICS_IMPORT_MAX_FILE_BYTES } from './import-file.constants.js';

describe('inspectImportFile', () => {
  it('accepts CSV text and rejects zip-disguised CSV, OLE .xls and macros', () => {
    expect(inspectImportFile({ originalName: 'a.csv', buffer: Buffer.from('标题,播放量\n') }).ok).toBe(true);
    expect(inspectImportFile({ originalName: 'a.csv', buffer: Buffer.from('PK\x03\x04fake') }).ok).toBe(false);
    expect(
      inspectImportFile({
        originalName: 'old.xls',
        buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]),
      }).reason,
    ).toBe('Unsupported spreadsheet format');
    expect(
      inspectImportFile({
        originalName: 'macro.xlsm',
        buffer: Buffer.from('PK\x03\x04workbook'),
      }).reason,
    ).toBe('Macro-enabled workbooks are not allowed');
    expect(
      inspectImportFile({
        originalName: 'hidden.xlsx',
        buffer: Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.from('xl/vbaProject.bin')]),
      }).reason,
    ).toBe('Macro-enabled workbooks are not allowed');
  });

  it('rejects oversized files', () => {
    const inspected = inspectImportFile({
      originalName: 'big.csv',
      buffer: Buffer.alloc(METRICS_IMPORT_MAX_FILE_BYTES + 1, 97),
    });
    expect(inspected.ok).toBe(false);
    if (!inspected.ok) {
      expect(inspected.reason).toBe('Import file is too large');
    }
  });
});
