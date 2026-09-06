import {
  METRICS_IMPORT_MAX_FILE_BYTES,
  type MetricsImportFormat,
} from './import-file.constants.js';

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4b]);

export type InspectedImportFile =
  | { ok: true; format: MetricsImportFormat; fileName: string }
  | { ok: false; reason: string };

export function inspectImportFile(input: {
  originalName: string;
  buffer: Buffer;
}): InspectedImportFile {
  const fileName = sanitizeFileName(input.originalName);
  if (input.buffer.length === 0) {
    return { ok: false, reason: 'Import file is empty' };
  }
  if (input.buffer.length > METRICS_IMPORT_MAX_FILE_BYTES) {
    return { ok: false, reason: 'Import file is too large' };
  }

  const ext = extensionOf(fileName);
  if (ext === 'xls' || ext === 'xlt' || ext === 'xlsb') {
    return { ok: false, reason: 'Unsupported spreadsheet format' };
  }
  if (ext === 'xlsm' || ext === 'xltm') {
    return { ok: false, reason: 'Macro-enabled workbooks are not allowed' };
  }

  if (startsWith(input.buffer, OLE_MAGIC)) {
    return { ok: false, reason: 'Unsupported spreadsheet format' };
  }

  if (ext === 'xlsx') {
    if (!startsWith(input.buffer, ZIP_MAGIC)) {
      return { ok: false, reason: 'XLSX file is not a valid workbook' };
    }
    if (containsZipEntry(input.buffer, 'xl/vbaProject.bin')) {
      return { ok: false, reason: 'Macro-enabled workbooks are not allowed' };
    }
    return { ok: true, format: 'XLSX', fileName };
  }

  if (ext === 'csv') {
    if (startsWith(input.buffer, ZIP_MAGIC)) {
      return { ok: false, reason: 'CSV file must be plain text' };
    }
    return { ok: true, format: 'CSV', fileName };
  }

  return { ok: false, reason: 'Unsupported import file type' };
}

export function sanitizeFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'upload';
  return base.replace(/[^\w.\u4e00-\u9fff-]+/g, '_').slice(0, 180) || 'upload';
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

function startsWith(buffer: Buffer, magic: Buffer): boolean {
  return buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);
}

function containsZipEntry(buffer: Buffer, entry: string): boolean {
  return buffer.includes(Buffer.from(entry));
}
