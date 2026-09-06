import { AppError, ErrorCode } from '../common/errors/app-error.js';

const IDEMPOTENCY_RE = /^[A-Za-z0-9._-]{8,128}$/;

export function requireIdempotencyKey(header?: string): string {
  const value = header?.trim() ?? '';
  if (!value || !IDEMPOTENCY_RE.test(value)) {
    throw new AppError(ErrorCode.IDEMPOTENCY_KEY_REQUIRED);
  }
  return value;
}
