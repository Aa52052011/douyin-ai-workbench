/**
 * Conservative Douyin item-id extraction from a user-supplied URL.
 * Does not follow redirects, fetch short links, or parse private APIs.
 * Unrecognized hosts/paths return null.
 */
const ITEM_ID = '(\\d{10,20})';

const PATH_PATTERNS: RegExp[] = [
  new RegExp(`^https?://(?:www\\.)?douyin\\.com/video/${ITEM_ID}(?:[/?#]|$)`, 'i'),
  new RegExp(`^https?://(?:www\\.)?douyin\\.com/note/${ITEM_ID}(?:[/?#]|$)`, 'i'),
  new RegExp(`^https?://(?:www\\.)?iesdouyin\\.com/share/video/${ITEM_ID}(?:[/?#]|$)`, 'i'),
];

const QUERY_KEYS = new Set(['modal_id', 'item_id', 'item_ids']);

export function parseDouyinItemIdFromUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? '';
  if (!value) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  for (const pattern of PATH_PATTERNS) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  for (const [key, param] of url.searchParams.entries()) {
    if (QUERY_KEYS.has(key.toLowerCase()) && new RegExp(`^${ITEM_ID}$`).test(param)) {
      return param;
    }
  }
  return null;
}
