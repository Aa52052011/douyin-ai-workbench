import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import {
  PLATFORM_SECRET_AUTH_TAG_BYTES,
  PLATFORM_SECRET_NONCE_BYTES,
} from './secret.types.js';

const ALGORITHM = 'aes-256-gcm';

export type AesGcmBox = {
  cipher: Buffer;
  nonce: Buffer;
  authTag: Buffer;
};

export function encryptAesGcm(plaintext: Buffer, masterKey: Buffer): AesGcmBox {
  const nonce = randomBytes(PLATFORM_SECRET_NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    cipher: encrypted,
    nonce,
    authTag: cipher.getAuthTag(),
  };
}

export function decryptAesGcm(box: AesGcmBox, masterKey: Buffer): Buffer {
  try {
    if (box.nonce.length !== PLATFORM_SECRET_NONCE_BYTES || box.authTag.length !== PLATFORM_SECRET_AUTH_TAG_BYTES) {
      throw new AppError(ErrorCode.SECRET_DECRYPT_FAILED);
    }
    const decipher = createDecipheriv(ALGORITHM, masterKey, box.nonce);
    decipher.setAuthTag(box.authTag);
    return Buffer.concat([decipher.update(box.cipher), decipher.final()]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(ErrorCode.SECRET_DECRYPT_FAILED);
  }
}
