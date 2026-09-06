import { describe, expect, it } from 'vitest';
import {
  parseImportCompletionRate,
  parseImportCount,
  parseImportWatchTimeSeconds,
} from './parse-import-number.js';

describe('parseImportCount', () => {
  it('parses integers, grouped thousands, and 万/w', () => {
    expect(parseImportCount('1234')).toEqual({ ok: true, value: 1234 });
    expect(parseImportCount('1,234')).toEqual({ ok: true, value: 1234 });
    expect(parseImportCount('1.2万')).toEqual({ ok: true, value: 12_000 });
    expect(parseImportCount('3.5w')).toEqual({ ok: true, value: 35_000 });
    expect(parseImportCount(0)).toEqual({ ok: true, value: 0 });
  });

  it('rejects negatives, percent, formulas and overflow', () => {
    expect(parseImportCount('-1').ok).toBe(false);
    expect(parseImportCount('12%').ok).toBe(false);
    expect(parseImportCount('=1+1').reason).toBe('invalid');
    expect(parseImportCount('3000000000').reason).toBe('overflow');
    expect(parseImportCount('').reason).toBe('empty');
  });

  it('treats dash placeholders as empty, not zero', () => {
    expect(parseImportCount('-')).toEqual({ ok: false, reason: 'empty' });
    expect(parseImportCount('--')).toEqual({ ok: false, reason: 'empty' });
    expect(parseImportCount('N/A')).toEqual({ ok: false, reason: 'empty' });
    expect(parseImportCount('33s').ok).toBe(false);
  });
});

describe('parseImportCompletionRate', () => {
  it('parses percent and 0–1 decimals', () => {
    expect(parseImportCompletionRate('12%')).toEqual({ ok: true, value: 0.12 });
    expect(parseImportCompletionRate('42.5%')).toEqual({ ok: true, value: 0.425 });
    expect(parseImportCompletionRate('0.42')).toEqual({ ok: true, value: 0.42 });
  });

  it('does not treat 42 as 42%', () => {
    expect(parseImportCompletionRate('42')).toEqual({ ok: false, reason: 'ambiguous_percent' });
  });

  it('parses 12.00% and treats dash as empty', () => {
    expect(parseImportCompletionRate('12.00%')).toEqual({ ok: true, value: 0.12 });
    expect(parseImportCompletionRate('-')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('parseImportWatchTimeSeconds', () => {
  it('keeps fractional seconds and parses Douyin duration suffixes', () => {
    expect(parseImportWatchTimeSeconds('12.345')).toEqual({ ok: true, value: 12.345 });
    expect(parseImportWatchTimeSeconds('33.00s')).toEqual({ ok: true, value: 33 });
    expect(parseImportWatchTimeSeconds('33s')).toEqual({ ok: true, value: 33 });
    expect(parseImportWatchTimeSeconds('33.5s')).toEqual({ ok: true, value: 33.5 });
    expect(parseImportWatchTimeSeconds('01:02')).toEqual({ ok: true, value: 62 });
    expect(parseImportWatchTimeSeconds('-')).toEqual({ ok: false, reason: 'empty' });
  });
});
