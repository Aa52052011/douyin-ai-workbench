import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { MARKET_IMPORT_MAPPING_VERSION } from './market-import.constants.js';
import { resolveMarketImportMapping, validateResolvedMapping } from './market-import-mapping.js';
import { getMarketImportTemplateDefinition } from './market-import-templates.js';

describe('market import mapping', () => {
  it('resolves English headers and Chinese aliases', () => {
    const english = resolveMarketImportMapping({
      kind: 'CONTENT',
      detectedColumns: ['title', 'views', 'likes', 'kind', 'source'],
    });
    expect(english.mappingVersion).toBe(MARKET_IMPORT_MAPPING_VERSION);
    expect(english.columns.title).toBe('title');
    expect(english.columns.views).toBe('views');
    expect(english.ignoredColumns).toEqual(expect.arrayContaining(['kind', 'source']));

    const chinese = resolveMarketImportMapping({
      kind: 'CONTENT',
      detectedColumns: ['作品标题', '播放量', '完播率', '备注列'],
    });
    expect(chinese.columns['作品标题']).toBe('title');
    expect(chinese.columns['播放量']).toBe('views');
    expect(chinese.columns['完播率']).toBe('completionRate');
    expect(chinese.ignoredColumns).toContain('备注列');
    expect(chinese.warnings.some((warning) => warning.includes('备注列'))).toBe(true);
  });

  it('accepts custom mapping and rejects invalid or duplicate targets', () => {
    const custom = resolveMarketImportMapping({
      kind: 'KEYWORD',
      detectedColumns: ['词', '相关'],
      customMapping: { 词: 'keyword', 相关: 'relatedKeywords' },
    });
    expect(custom.columns['词']).toBe('keyword');

    expect(() =>
      resolveMarketImportMapping({
        kind: 'KEYWORD',
        detectedColumns: ['词'],
        customMapping: { 词: 'canonicalKey' },
      }),
    ).toThrow(expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }));

    expect(() =>
      resolveMarketImportMapping({
        kind: 'KEYWORD',
        detectedColumns: ['a', 'b'],
        customMapping: { a: 'keyword', b: 'keyword' },
      }),
    ).toThrow(/mapped more than once/);

    expect(() =>
      resolveMarketImportMapping({
        kind: 'CONTENT',
        detectedColumns: ['title'],
        customMapping: { title: 'kind' },
      }),
    ).toThrow(/not allowed/);

    expect(() =>
      validateResolvedMapping({
        kind: 'KEYWORD',
        mapping: { 词: 'title' },
      }),
    ).toThrow(/not allowed for KEYWORD/);
  });

  it('does not silently accept searchVolume and requires mapped fields', () => {
    const resolved = resolveMarketImportMapping({
      kind: 'KEYWORD',
      detectedColumns: ['keyword', 'searchVolume', '搜索量'],
    });
    expect(resolved.columns.searchVolume).toBeUndefined();
    expect(resolved.warnings.some((warning) => warning.includes('searchVolume'))).toBe(true);

    expect(() =>
      resolveMarketImportMapping({
        kind: 'KEYWORD',
        detectedColumns: ['searchVolume'],
        customMapping: { searchVolume: 'volumeSignal' },
      }),
    ).toThrow(/searchVolume/);

    expect(() =>
      resolveMarketImportMapping({
        kind: 'KEYWORD',
        detectedColumns: ['relatedKeywords'],
      }),
    ).toThrow(/keyword is not mapped/);
  });

  it('rejects audience identity columns', () => {
    expect(() =>
      resolveMarketImportMapping({
        kind: 'AUDIENCE_SIGNAL',
        detectedColumns: ['topic', 'signalType', 'username'],
      }),
    ).toThrow(/identity/);
  });

  it('exposes static template definitions without HTTP', () => {
    const content = getMarketImportTemplateDefinition('CONTENT');
    expect(content.columns.some((column) => column.field === 'title' && !column.required)).toBe(true);
    const keyword = getMarketImportTemplateDefinition('KEYWORD');
    expect(keyword.columns.some((column) => column.field === 'keyword' && column.required)).toBe(true);
  });
});
