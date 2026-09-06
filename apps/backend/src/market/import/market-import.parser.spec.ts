import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { ErrorCode } from '../../common/errors/app-error.js';
import { hashMarketImportFile, hashNormalizedMarketItems } from './market-import-fingerprint.js';
import { inspectMarketImportFile } from './market-import-file-inspector.js';
import { ingestParsedMarketImportRows } from './market-import-ingestion.js';
import { parseMarketImportList } from './market-import-list.js';
import { parseMarketImportCount } from './market-import-number.js';
import { MARKET_IMPORT_MAPPING_VERSION, MARKET_IMPORT_MAX_FILE_BYTES, MARKET_IMPORT_MAX_ROWS } from './market-import.constants.js';
import { parseMarketImportFile } from './market-import.parser.js';

function csv(lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf8');
}

async function xlsx(headers: string[], rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('market import parser', () => {
  it('parses valid CSV and XLSX CONTENT files', async () => {
    const csvParsed = await parseMarketImportFile({
      originalName: 'content.csv',
      buffer: csv([
        'title,externalContentId,views,likes,completionRate,hashtags,keywords',
        '样本A,aweme-1,0,10,12%,#防脱|#洗发水,防脱|头皮',
      ]),
      kind: 'CONTENT',
    });
    expect(csvParsed.format).toBe('CSV');
    expect(csvParsed.rows[0]?.fields.views).toBe(0);
    expect(csvParsed.rows[0]?.fields.completionRate).toBe(0.12);
    expect(csvParsed.rows[0]?.fields.hashtags).toEqual(['防脱', '洗发水']);

    const xlsxParsed = await parseMarketImportFile({
      originalName: 'content.xlsx',
      buffer: await xlsx(['作品标题', '播放量'], [['样本B', 1234]]),
      kind: 'CONTENT',
    });
    expect(xlsxParsed.format).toBe('XLSX');
    expect(xlsxParsed.rows[0]?.fields.title).toBe('样本B');
    expect(xlsxParsed.rows[0]?.fields.views).toBe(1234);
  });

  it('rejects unsupported files, macros, oversized payloads and too many rows/columns', async () => {
    expect(inspectMarketImportFile({ originalName: 'old.xls', buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]) }).ok).toBe(false);
    expect(inspectMarketImportFile({ originalName: 'macro.xlsm', buffer: Buffer.from('PK\x03\x04xl/vbaProject.bin') }).ok).toBe(false);
    expect(inspectMarketImportFile({ originalName: 'big.csv', buffer: Buffer.alloc(MARKET_IMPORT_MAX_FILE_BYTES + 1, 97) }).reason).toBe(
      'Import file is too large',
    );
    await expect(
      parseMarketImportFile({
        originalName: 'many.csv',
        buffer: csv(['title', ...Array.from({ length: MARKET_IMPORT_MAX_ROWS + 1 }, () => 'a')]),
        kind: 'CONTENT',
      }),
    ).rejects.toThrow(/exceeds/);
    await expect(
      parseMarketImportFile({
        originalName: 'wide.csv',
        buffer: csv([Array.from({ length: 41 }, (_, index) => `c${index}`).join(',')]),
        kind: 'CONTENT',
      }),
    ).rejects.toThrow(/columns/);
  });

  it('parses numeric, percent, list and signal rules', async () => {
    expect(parseMarketImportCount('1,234')).toEqual({ ok: true, value: 1234 });
    expect(parseMarketImportCount('0')).toEqual({ ok: true, value: 0 });
    expect(parseMarketImportCount('1.2万').ok).toBe(false);
    expect(parseMarketImportCount('=1+1').ok).toBe(false);
    expect(parseMarketImportList('防脱|发际线|头皮护理', { maxItems: 20, maxItemLength: 80 })).toEqual({
      ok: true,
      value: ['防脱', '发际线', '头皮护理'],
    });
    expect(parseMarketImportList('["a","b"]', { maxItems: 20, maxItemLength: 80 }).ok).toBe(false);

    const percent = await parseMarketImportFile({
      originalName: 'rate.csv',
      buffer: csv(['title,completionRate', 'A,0.12', 'B,12', 'C,']),
      kind: 'CONTENT',
    });
    expect(percent.rows[0]?.fields.completionRate).toBe(0.12);
    expect(percent.rows[1]?.errors.some((error) => error.includes('ambiguous'))).toBe(true);
    expect(percent.rows[2]?.fields.completionRate).toBeUndefined();

    const keyword = await parseMarketImportFile({
      originalName: 'kw.csv',
      buffer: csv(['keyword,relatedKeywords,volumeSignal', '防脱,掉发|头皮,HIGH', '', '']),
      kind: 'KEYWORD',
    });
    expect(keyword.rows[0]?.fields.volumeSignal).toBe('high');
    expect(keyword.rows[0]?.fields.relatedKeywords).toEqual(['掉发', '头皮']);
  });

  it('enforces kind-specific required fields and weak identity warnings', async () => {
    const content = await parseMarketImportFile({
      originalName: 'weak.csv',
      buffer: csv(['views', '10']),
      kind: 'CONTENT',
    });
    expect(content.rows[0]?.warnings).toContain('WEAK_IDENTITY');

    const competitor = await parseMarketImportFile({
      originalName: 'comp.csv',
      buffer: csv(['displayName,followerCount', '竞品A,1000']),
      kind: 'COMPETITOR',
    });
    expect(competitor.rows[0]?.warnings).toContain('WEAK_IDENTITY');
    expect(competitor.rows[0]?.fields.followerCount).toBe(1000);

    await expect(
      parseMarketImportFile({
        originalName: 'kw-missing.csv',
        buffer: csv(['relatedKeywords', 'a|b']),
        kind: 'KEYWORD',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

    const trend = await parseMarketImportFile({
      originalName: 'trend.csv',
      buffer: csv(['name,heatSignal', '防脱热,medium', '假热度,850']),
      kind: 'TREND',
    });
    expect(trend.rows[0]?.fields.heatSignal).toBe('medium');
    expect(trend.rows[1]?.errors.some((error) => error.includes('heatSignal'))).toBe(true);

    const audience = await parseMarketImportFile({
      originalName: 'aud.csv',
      buffer: csv(['topic,signalType,examples', '掉发,pain,头发稀疏|头皮痒|发际线|出油|卡粉|第六条']),
      kind: 'AUDIENCE_SIGNAL',
    });
    expect(audience.rows[0]?.errors.some((error) => error.includes('exceeds 5'))).toBe(true);
  });

  it('prefers externalContentId for canonicalKey and ignores row order in fingerprint', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const first = ingestParsedMarketImportRows({
      kind: 'CONTENT',
      rows: [
        {
          rowNumber: 2,
          cells: {},
          fields: { title: '后', externalContentId: 'id-2', views: 2 },
          warnings: [],
          errors: [],
        },
        {
          rowNumber: 3,
          cells: {},
          fields: { title: '前', externalContentId: 'id-1', views: 1 },
          warnings: [],
          errors: [],
        },
      ],
      collectedAtOverride: '2026-08-01T00:00:00.000Z',
      now,
      fileFingerprint: 'a'.repeat(64),
    });
    expect(first.items[0]?.canonicalKey).toContain(':id:');
    const reversed = ingestParsedMarketImportRows({
      kind: 'CONTENT',
      rows: [
        {
          rowNumber: 2,
          cells: {},
          fields: { title: '前', externalContentId: 'id-1', views: 1 },
          warnings: [],
          errors: [],
        },
        {
          rowNumber: 3,
          cells: {},
          fields: { title: '后', externalContentId: 'id-2', views: 2 },
          warnings: [],
          errors: [],
        },
      ],
      collectedAtOverride: '2026-08-01T00:00:00.000Z',
      now,
      fileFingerprint: 'a'.repeat(64),
    });
    expect(hashNormalizedMarketItems(first.items)).toBe(hashNormalizedMarketItems(reversed.items));
    expect(hashMarketImportFile(Buffer.from('abc'), MARKET_IMPORT_MAPPING_VERSION)).toBe(
      hashMarketImportFile(Buffer.from('abc'), MARKET_IMPORT_MAPPING_VERSION),
    );
  });

  it('resolves collectedAt priority and never uses publishedAt', () => {
    const now = new Date('2026-09-05T00:00:00.000Z');
    const rowFirst = ingestParsedMarketImportRows({
      kind: 'CONTENT',
      rows: [
        {
          rowNumber: 2,
          cells: {},
          fields: { title: 'A', publishedAt: '2020-01-01T00:00:00.000Z', collectedAt: '2026-07-01T00:00:00.000Z' },
          warnings: [],
          errors: [],
        },
      ],
      collectedAtOverride: '2026-08-01T00:00:00.000Z',
      now,
      fileFingerprint: 'b'.repeat(64),
    });
    expect(rowFirst.items[0]?.collectedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(rowFirst.collectedAtAssumed).toBe(false);

    const override = ingestParsedMarketImportRows({
      kind: 'CONTENT',
      rows: [{ rowNumber: 2, cells: {}, fields: { title: 'A' }, warnings: [], errors: [] }],
      collectedAtOverride: '2026-08-01T00:00:00.000Z',
      now,
      fileFingerprint: 'b'.repeat(64),
    });
    expect(override.items[0]?.collectedAt).toBe('2026-08-01T00:00:00.000Z');
    expect(override.collectedAtAssumed).toBe(false);

    const assumed = ingestParsedMarketImportRows({
      kind: 'CONTENT',
      rows: [{ rowNumber: 2, cells: {}, fields: { title: 'A', publishedAt: '2020-01-01T00:00:00.000Z' }, warnings: [], errors: [] }],
      now,
      fileFingerprint: 'b'.repeat(64),
    });
    expect(assumed.collectedAtAssumed).toBe(true);
    expect(assumed.warnings).toContain('COLLECTED_AT_ASSUMED');
    expect(assumed.items[0]?.collectedAt).toBe(now.toISOString());
    expect(assumed.items[0]?.kind === 'CONTENT' && assumed.items[0].publishedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('dedupes rows and keeps IMPORT dataQuality LIMITED', () => {
    const result = ingestParsedMarketImportRows({
      kind: 'KEYWORD',
      rows: [
        { rowNumber: 2, cells: {}, fields: { keyword: '防脱' }, warnings: [], errors: [] },
        { rowNumber: 3, cells: {}, fields: { keyword: ' 防脱 ' }, warnings: [], errors: [] },
      ],
      collectedAtOverride: '2026-09-01T00:00:00.000Z',
      fileFingerprint: 'c'.repeat(64),
    });
    expect(result.items).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.dataQuality.dataSufficiency).toBe('LIMITED');
    expect(result.dataQuality.importOnly).toBe(true);
    expect(result.dataQuality.thirdPartyUsed).toBe(false);
    expect(result.sampleStats.note).toBe('snapshot_sample_only');
    expect(result.items[0]?.source).toBe('IMPORT');
  });

  it('falls TREND observedAt back to collectedAt', () => {
    const result = ingestParsedMarketImportRows({
      kind: 'TREND',
      rows: [{ rowNumber: 2, cells: {}, fields: { name: '防脱热' }, warnings: [], errors: [] }],
      collectedAtOverride: '2026-09-01T00:00:00.000Z',
      fileFingerprint: 'd'.repeat(64),
    });
    expect(result.items[0]?.kind).toBe('TREND');
    if (result.items[0]?.kind === 'TREND') {
      expect(result.items[0].observedAt).toBe('2026-09-01T00:00:00.000Z');
    }
  });
});
