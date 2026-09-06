import { describe, expect, it } from 'vitest';
import { parseCsvMetricsImport } from './csv-metrics-import.parser.js';
import { METRICS_IMPORT_MAX_ROWS } from './import-file.constants.js';

describe('parseCsvMetricsImport', () => {
  it('parses Chinese headers, grouped numbers and percent', () => {
    const csv = [
      '作品标题,作品链接,发布时间,播放量,点赞数,完播率,备注',
      '第一集,https://www.douyin.com/video/7471234567890123456,2026-08-01 08:00:00,"1,234",10,12%,忽略我',
    ].join('\n');
    const parsed = parseCsvMetricsImport({ buffer: Buffer.from(csv, 'utf8'), fileName: 'export.csv' });
    expect(parsed.mappingVersion).toBe('douyin-export-v1');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.metrics.views).toBe(1234);
    expect(parsed.rows[0]?.metrics.likes).toBe(10);
    expect(parsed.rows[0]?.metrics.completionRate).toBe(0.12);
    expect(parsed.warnings.some((warning) => warning.includes('备注'))).toBe(true);
  });

  it('flags missing observedAt and ambiguous completion rates', () => {
    const csv = ['播放量,完播率', '100,42'].join('\n');
    const parsed = parseCsvMetricsImport({ buffer: Buffer.from(csv, 'utf8'), fileName: 'bad.csv' });
    expect(parsed.rows[0]?.errors).toEqual(
      expect.arrayContaining([
        'observedAt is required',
        'completionRate is ambiguous without a percent sign or 0–1 value',
      ]),
    );
  });

  it('rejects too many rows', () => {
    const lines = ['播放量', ...Array.from({ length: METRICS_IMPORT_MAX_ROWS + 1 }, () => '1')];
    expect(() => parseCsvMetricsImport({ buffer: Buffer.from(lines.join('\n'), 'utf8'), fileName: 'many.csv' })).toThrow(
      /exceeds/,
    );
  });
});
