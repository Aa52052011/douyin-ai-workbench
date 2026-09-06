import { createHash } from 'node:crypto';
import type { NormalizedMarketItem } from '../market.types.js';
import { MARKET_IMPORT_MAPPING_VERSION } from './market-import.constants.js';

export function hashMarketImportFile(buffer: Buffer, mappingVersion = MARKET_IMPORT_MAPPING_VERSION): string {
  return createHash('sha256').update(buffer).update('\0').update(mappingVersion).digest('hex');
}

export function hashNormalizedMarketItems(items: NormalizedMarketItem[]): string {
  const ordered = [...items].sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey));
  return createHash('sha256').update(stableSerialize(ordered)).digest('hex');
}

export function hashMarketImportIdempotency(input: {
  fileFingerprint: string;
  mappingVersion: string;
  kind: string;
  normalizedItemsFingerprint: string;
  productBriefId: string;
  productBriefVersion: number;
  origin: string;
  selectionMethod: string;
  collectedAt: string;
}): string {
  return createHash('sha256')
    .update(input.fileFingerprint)
    .update('\0')
    .update(input.mappingVersion)
    .update('\0')
    .update(input.kind)
    .update('\0')
    .update(input.normalizedItemsFingerprint)
    .update('\0')
    .update(input.productBriefId)
    .update('\0')
    .update(String(input.productBriefVersion))
    .update('\0')
    .update(input.origin)
    .update('\0')
    .update(input.selectionMethod)
    .update('\0')
    .update(input.collectedAt)
    .digest('hex');
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== '__proto__' && key !== 'constructor' && key !== 'prototype')
      .sort(([left], [right]) => left.localeCompare(right));
    const next: Record<string, unknown> = {};
    for (const [key, nested] of entries) {
      next[key] = sortValue(nested);
    }
    return next;
  }
  return value;
}
