import { stringifyCell } from './market-import-number.js';

export type ParsedMarketImportList =
  | { ok: true; value: string[] }
  | { ok: false; reason: string };

export function parseMarketImportList(
  raw: unknown,
  opts: { maxItems: number; maxItemLength: number; stripHash?: boolean },
): ParsedMarketImportList {
  const text = stringifyCell(raw);
  if (text == null) {
    return { ok: true, value: [] };
  }
  const trimmed = text.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return { ok: false, reason: 'list must use | delimiter' };
  }
  const parts = trimmed.split('|').map((part) => {
    let item = part.trim();
    if (opts.stripHash) {
      item = item.replace(/^#+/, '');
    }
    return item;
  });
  const seen = new Set<string>();
  const values: string[] = [];
  for (const item of parts) {
    if (!item) {
      continue;
    }
    if (item.length > opts.maxItemLength) {
      return { ok: false, reason: `list item exceeds ${opts.maxItemLength} characters` };
    }
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    values.push(item);
  }
  if (values.length > opts.maxItems) {
    return { ok: false, reason: `list exceeds ${opts.maxItems} items` };
  }
  return { ok: true, value: values };
}
