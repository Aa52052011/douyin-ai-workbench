import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { PLATFORM_SECRET_MASTER_KEY_BYTES } from './secret.types.js';

export const PLATFORM_SECRET_MASTER_KEY_ENV = 'PLATFORM_SECRET_MASTER_KEY';

export function parsePlatformSecretMasterKey(raw: string | undefined): Buffer {
  const value = raw?.trim();
  if (!value) {
    throw new AppError(ErrorCode.SECRET_MASTER_KEY_INVALID);
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== PLATFORM_SECRET_MASTER_KEY_BYTES) {
    throw new AppError(ErrorCode.SECRET_MASTER_KEY_INVALID);
  }
  return key;
}

export function readPlatformSecretMasterKey(): Buffer {
  return parsePlatformSecretMasterKey(process.env[PLATFORM_SECRET_MASTER_KEY_ENV]);
}
