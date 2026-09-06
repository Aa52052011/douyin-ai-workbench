import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildDouyinWorkListExportFixture } from './fixtures/douyin-work-list-export.js';
import { parseXlsxMetricsImport } from './xlsx-metrics-import.parser.js';

async function workbookBuffer(build: (sheet: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('数据');
  build(sheet);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe('parseXlsxMetricsImport', () => {
  it('reads the first worksheet and Excel date cells', async () => {
    const buffer = await workbookBuffer((sheet) => {
      sheet.addRow(['作品标题', '发布时间', '播放量', '平均观看时长']);
      sheet.addRow(['示例', new Date(Date.UTC(2026, 7, 2, 0, 0, 0)), 1200, 8.5]);
    });
    const parsed = await parseXlsxMetricsImport({ buffer, fileName: 'export.xlsx' });
    expect(parsed.format).toBe('XLSX');
    expect(parsed.rows[0]?.metrics.views).toBe(1200);
    expect(parsed.rows[0]?.metrics.averageWatchTimeSeconds).toBe(8.5);
    expect(parsed.rows[0]?.publishedAt?.toISOString()).toContain('2026-08-02');
  });

  it('does not execute formulas and uses cached results only', async () => {
    const buffer = await workbookBuffer((sheet) => {
      sheet.addRow(['播放量', '数据截止时间']);
      const row = sheet.addRow([null, '2026-08-02 00:00:00']);
      row.getCell(1).value = { formula: '1+1', result: 88 };
    });
    const parsed = await parseXlsxMetricsImport({ buffer, fileName: 'formula.xlsx' });
    expect(parsed.rows[0]?.metrics.views).toBe(88);
    expect(parsed.warnings.some((warning) => warning.includes('formula'))).toBe(true);
    expect(parsed.rows[0]?.metrics.views).not.toBe(2);
  });

  it('parses the official Douyin work-list export headers without mis-mapping extras', async () => {
    const parsed = await parseXlsxMetricsImport({
      buffer: await buildDouyinWorkListExportFixture(),
      fileName: '作品列表导出.xlsx',
    });
    expect(parsed.mappingVersion).toBe('douyin-export-v1');
    expect(parsed.warnings).toEqual(
      expect.arrayContaining([
        'KNOWN_UNMAPPED_METRIC: 5s完播率',
        'KNOWN_UNMAPPED_METRIC: 封面点击率',
        'KNOWN_UNMAPPED_METRIC: 2s跳出率',
        'KNOWN_UNMAPPED_METRIC: 主页访问量',
        'KNOWN_CONTEXT_FIELD: 体裁',
        'KNOWN_CONTEXT_FIELD: 审核状态',
      ]),
    );
    expect(parsed.warnings.some((warning) => warning.includes('Unknown column'))).toBe(false);

    const rowA = parsed.rows[0];
    expect(rowA?.rawTitle).toBe('示例作品A');
    expect(rowA?.metrics).toMatchObject({
      views: 961,
      likes: 34,
      comments: 10,
      shares: 9,
      favorites: 3,
    });
    expect(rowA?.metrics.completionRate ?? null).toBeNull();
    expect(rowA?.metrics.averageWatchTimeSeconds ?? null).toBeNull();
    expect(rowA?.metrics.newFollowers ?? null).toBeNull();
    expect(rowA?.errors).toEqual(expect.arrayContaining(['observedAt is required']));

    const rowB = parsed.rows[1];
    expect(rowB?.metrics.completionRate).toBe(0.12);
    expect(rowB?.metrics.averageWatchTimeSeconds).toBe(33);
    expect(rowB?.metrics.newFollowers).toBe(2);
    expect(rowB?.metrics.completionRate).not.toBe(0.8);
    expect(rowB?.metrics.newFollowers).not.toBe(99);
  });
});
