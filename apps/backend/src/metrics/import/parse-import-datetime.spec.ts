import { describe, expect, it } from 'vitest';
import { excelSerialToDate, parseImportDateTime } from './parse-import-datetime.js';

describe('parseImportDateTime', () => {
  it('parses ISO, date-only and common export formats', () => {
    expect(parseImportDateTime('2026-08-02T12:00:00.000Z')?.toISOString()).toBe('2026-08-02T12:00:00.000Z');
    expect(parseImportDateTime('2026-08-02')?.toISOString()).toBe('2026-08-02T00:00:00.000Z');
    expect(parseImportDateTime('2026-08-02 12:00:00')?.toISOString()).toBe('2026-08-02T12:00:00.000Z');
    expect(parseImportDateTime('2026/08/02 08:00:00')?.toISOString()).toBe('2026-08-02T08:00:00.000Z');
  });

  it('parses Date objects and Excel serials', () => {
    const date = new Date('2026-08-02T00:00:00.000Z');
    expect(parseImportDateTime(date)?.toISOString()).toBe(date.toISOString());
    const serial = excelSerialToDate(45905);
    expect(serial).toBeInstanceOf(Date);
    expect(parseImportDateTime(45905)?.getUTCFullYear()).toBe(serial?.getUTCFullYear());
  });
});
