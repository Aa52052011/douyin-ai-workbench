import { createHash } from 'node:crypto';

export function usageIdempotencyKey(parts: Array<string | number | undefined | null>): string {
  const raw = parts.map((item) => (item == null ? '' : String(item))).join(':');
  if (raw.length <= 180) {
    return raw;
  }
  return `${raw.slice(0, 80)}:${createHash('sha256').update(raw).digest('hex').slice(0, 24)}`;
}

export function promptFingerprint(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
