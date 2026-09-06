import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { SecretPayload } from './secret.types.js';

export function encodeSecretPayload(payload: SecretPayload): Buffer {
  return Buffer.from(JSON.stringify(normalizeSecretPayload(payload)), 'utf8');
}

export function decodeSecretPayload(bytes: Buffer): SecretPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new AppError(ErrorCode.SECRET_DECRYPT_FAILED);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AppError(ErrorCode.SECRET_DECRYPT_FAILED);
  }
  const record = parsed as Record<string, unknown>;
  try {
    return normalizeSecretPayload({
      accessToken: typeof record.accessToken === 'string' ? record.accessToken : '',
      refreshToken: typeof record.refreshToken === 'string' ? record.refreshToken : undefined,
      expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : undefined,
      refreshExpiresAt: typeof record.refreshExpiresAt === 'string' ? record.refreshExpiresAt : undefined,
      scopes: Array.isArray(record.scopes)
        ? record.scopes.filter((item): item is string => typeof item === 'string')
        : undefined,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw new AppError(ErrorCode.SECRET_DECRYPT_FAILED);
    }
    throw error;
  }
}

function normalizeSecretPayload(payload: SecretPayload): SecretPayload {
  if (typeof payload.accessToken !== 'string' || payload.accessToken.length === 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR);
  }
  const body: SecretPayload = { accessToken: payload.accessToken };
  if (typeof payload.refreshToken === 'string' && payload.refreshToken.length > 0) {
    body.refreshToken = payload.refreshToken;
  }
  if (typeof payload.expiresAt === 'string' && payload.expiresAt.length > 0) {
    body.expiresAt = payload.expiresAt;
  }
  if (typeof payload.refreshExpiresAt === 'string' && payload.refreshExpiresAt.length > 0) {
    body.refreshExpiresAt = payload.refreshExpiresAt;
  }
  if (Array.isArray(payload.scopes)) {
    body.scopes = payload.scopes.filter((item) => typeof item === 'string');
  }
  return body;
}
