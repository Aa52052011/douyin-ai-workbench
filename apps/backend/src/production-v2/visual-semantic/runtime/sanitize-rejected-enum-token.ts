import { findSecretLikeHits } from './b2-6-guards.js';

export const REDACTED_INVALID_ENUM_TOKEN = '[REDACTED_INVALID_ENUM_TOKEN]';
export const REJECTED_ENUM_TOKEN_MAX_LENGTH = 128;
export const MODEL_OUTPUT_OBSERVATION_TYPES_ENUM_ID = 'MODEL_OUTPUT_OBSERVATION_TYPES';

export function jsTypeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function sanitizeRejectedEnumToken(value: unknown): {
  rejectedValue: string;
  originalType: string;
  redacted: boolean;
} {
  const originalType = jsTypeName(value);
  if (typeof value !== 'string') {
    return { rejectedValue: REDACTED_INVALID_ENUM_TOKEN, originalType, redacted: true };
  }
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > REJECTED_ENUM_TOKEN_MAX_LENGTH ||
    /[\u0000-\u0008\u000a-\u001f\u007f]/.test(trimmed) ||
    trimmed.includes('\n') ||
    trimmed.includes('\r') ||
    /^data:/i.test(trimmed) ||
    /base64,/i.test(trimmed) ||
    findSecretLikeHits(trimmed).length > 0
  ) {
    return { rejectedValue: REDACTED_INVALID_ENUM_TOKEN, originalType, redacted: true };
  }
  return { rejectedValue: trimmed, originalType, redacted: false };
}
