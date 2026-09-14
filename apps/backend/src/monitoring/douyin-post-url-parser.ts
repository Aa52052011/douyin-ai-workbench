export type DouyinUrlParseStatus =
  | 'FORMAT_VALIDATED'
  | 'SHORT_LINK_RESOLUTION_REQUIRED'
  | 'INVALID'
  | 'UNSUPPORTED_HOST';

export type DouyinPostUrlParseV1 = {
  schemaVersion: 'douyin.post-url-parser:v1';
  input: string;
  normalizedUrl: string | null;
  platformPostId: string | null;
  status: DouyinUrlParseStatus;
  verification: 'FORMAT_VALIDATED' | 'USER_ASSERTED' | null;
  platformVerified: false;
};

const VIDEO_ID = /^[0-9]{5,32}$/;

export function parseDouyinPostUrl(raw: string): DouyinPostUrlParseV1 {
  const input = raw.trim();
  const empty: DouyinPostUrlParseV1 = {
    schemaVersion: 'douyin.post-url-parser:v1',
    input,
    normalizedUrl: null,
    platformPostId: null,
    status: 'INVALID',
    verification: null,
    platformVerified: false,
  };
  if (!input) return empty;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return empty;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return empty;

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'v.douyin.com' || host === 'v.iesdouyin.com') {
    return {
      ...empty,
      normalizedUrl: url.toString(),
      status: 'SHORT_LINK_RESOLUTION_REQUIRED',
    };
  }

  const videoMatch = url.pathname.match(/\/(?:share\/)?video\/(\d{5,32})/i) ?? url.pathname.match(/\/note\/(\d{5,32})/i);
  const allowedHost =
    host === 'douyin.com' ||
    host === 'iesdouyin.com' ||
    host === 'm.douyin.com' ||
    host.endsWith('.douyin.com') ||
    host.endsWith('.iesdouyin.com');
  if (!allowedHost) {
    return { ...empty, status: 'UNSUPPORTED_HOST' };
  }
  if (!videoMatch) {
    return { ...empty, normalizedUrl: url.toString(), status: 'INVALID' };
  }
  const platformPostId = videoMatch[1];
  if (!VIDEO_ID.test(platformPostId)) {
    return { ...empty, normalizedUrl: url.toString(), status: 'INVALID' };
  }
  return {
    schemaVersion: 'douyin.post-url-parser:v1',
    input,
    normalizedUrl: url.toString(),
    platformPostId,
    status: 'FORMAT_VALIDATED',
    verification: 'FORMAT_VALIDATED',
    platformVerified: false,
  };
}

export function parsePlatformPostId(raw: string): string | null {
  const value = raw.trim();
  if (!VIDEO_ID.test(value)) return null;
  return value;
}
