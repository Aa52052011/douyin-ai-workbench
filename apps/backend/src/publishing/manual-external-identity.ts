import { AppError, ErrorCode } from '../common/errors/app-error.js';

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

export function parseManualExternalPostId(value: string | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 256 || CONTROL_CHARS.test(trimmed)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'externalPostId is invalid');
  }
  return trimmed;
}

export function parseManualExternalUrl(value: string | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 2048 || CONTROL_CHARS.test(trimmed)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'externalUrl is invalid');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'externalUrl is invalid');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'externalUrl is invalid');
  }
  if (parsed.username || parsed.password) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'externalUrl is invalid');
  }
  return trimmed;
}

export function requireManualExternalIdentity(input: { externalPostId?: string; externalUrl?: string }): {
  externalPostId: string | null;
  externalUrl: string | null;
} {
  const externalPostId = parseManualExternalPostId(input.externalPostId);
  const externalUrl = parseManualExternalUrl(input.externalUrl);
  if (!externalPostId && !externalUrl) {
    throw new AppError(ErrorCode.MANUAL_PUBLICATION_EXTERNAL_IDENTITY_REQUIRED);
  }
  return { externalPostId, externalUrl };
}

export function sameManualExternalIdentity(
  current: { externalPostId: string | null; externalUrl: string | null },
  incoming: { externalPostId: string | null; externalUrl: string | null },
): boolean {
  return current.externalPostId === incoming.externalPostId && current.externalUrl === incoming.externalUrl;
}
