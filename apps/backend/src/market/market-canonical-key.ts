import type { MarketItemKind } from './market.types.js';

export function normalizeMarketToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeMarketUrl(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    url.hash = '';
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`.toLowerCase();
  } catch {
    return normalizeMarketToken(trimmed).replace(/\/+$/, '');
  }
}

export function buildMarketCanonicalKey(input: {
  kind: MarketItemKind;
  platform: string;
  externalId?: string | null;
  externalUrl?: string | null;
  keyword?: string | null;
  displayName?: string | null;
  externalAccountId?: string | null;
  profileUrl?: string | null;
  title?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  name?: string | null;
  topic?: string | null;
  signalType?: string | null;
}): string {
  const platform = normalizeMarketToken(input.platform);
  if (input.externalId?.trim()) {
    return `${platform}:id:${normalizeMarketToken(input.externalId)}`;
  }
  if (input.externalUrl?.trim()) {
    return `${platform}:url:${normalizeMarketUrl(input.externalUrl)}`;
  }
  if (input.kind === 'KEYWORD') {
    return `${platform}:keyword:${normalizeMarketToken(input.keyword ?? '')}`;
  }
  if (input.kind === 'COMPETITOR') {
    if (input.externalAccountId?.trim()) {
      return `${platform}:competitor:id:${normalizeMarketToken(input.externalAccountId)}`;
    }
    if (input.profileUrl?.trim()) {
      return `${platform}:competitor:url:${normalizeMarketUrl(input.profileUrl)}`;
    }
    return `${platform}:competitor:name:${normalizeMarketToken(input.displayName ?? '')}`;
  }
  if (input.kind === 'TREND') {
    return `${platform}:trend:${normalizeMarketToken(input.name ?? '')}`;
  }
  if (input.kind === 'AUDIENCE_SIGNAL') {
    return `${platform}:audience:${normalizeMarketToken(input.signalType ?? '')}:${normalizeMarketToken(input.topic ?? '')}`;
  }
  return `${platform}:content:${normalizeMarketToken(input.title ?? '')}:${normalizeMarketToken(input.author ?? '')}:${input.publishedAt ?? ''}`;
}
