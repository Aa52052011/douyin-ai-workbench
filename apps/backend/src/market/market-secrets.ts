import {
  MARKET_AUDIENCE_FORBIDDEN_KEYS,
  MARKET_FORBIDDEN_SECRET_KEYS,
} from './market.constants.js';

const SECRET_LOWER = new Set(MARKET_FORBIDDEN_SECRET_KEYS.map((key) => key.toLowerCase()));
const AUDIENCE_LOWER = new Set(MARKET_AUDIENCE_FORBIDDEN_KEYS.map((key) => key.toLowerCase()));

export function marketRecordHasSecretKeys(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (SECRET_LOWER.has(key.toLowerCase())) {
      return true;
    }
  }
  return false;
}

export function marketRecordHasAudiencePii(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (AUDIENCE_LOWER.has(key.toLowerCase())) {
      return true;
    }
  }
  return false;
}

export function marketTextHasSecretLeak(value: unknown): boolean {
  const text = JSON.stringify(value ?? {});
  return MARKET_FORBIDDEN_SECRET_KEYS.some((key) => text.includes(`"${key}"`));
}
