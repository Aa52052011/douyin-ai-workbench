import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { decryptAesGcm, encryptAesGcm } from './aes-gcm.js';
import { parsePlatformSecretMasterKey } from './secret-master-key.js';
import { decodeSecretPayload, encodeSecretPayload } from './secret-payload.js';

const DUMMY = {
  accessToken: 'dummy-access-not-a-real-token',
  refreshToken: 'dummy-refresh-not-a-real-token',
};

describe('AES-GCM secret box', () => {
  const key = randomBytes(32);

  it('encrypts then decrypts dummy payload', () => {
    const plaintext = encodeSecretPayload(DUMMY);
    const box = encryptAesGcm(plaintext, key);
    expect(decryptAesGcm(box, key).equals(plaintext)).toBe(true);
    expect(decodeSecretPayload(plaintext)).toEqual(DUMMY);
  });

  it('uses a random nonce so identical plaintext yields different ciphertext', () => {
    const plaintext = encodeSecretPayload(DUMMY);
    const first = encryptAesGcm(plaintext, key);
    const second = encryptAesGcm(plaintext, key);
    expect(first.nonce.equals(second.nonce)).toBe(false);
    expect(first.cipher.equals(second.cipher)).toBe(false);
  });

  it('fails closed on the wrong master key', () => {
    const box = encryptAesGcm(encodeSecretPayload(DUMMY), key);
    expect(() => decryptAesGcm(box, randomBytes(32))).toThrowError(AppError);
    try {
      decryptAesGcm(box, randomBytes(32));
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.SECRET_DECRYPT_FAILED });
      expect(JSON.stringify(error)).not.toContain(DUMMY.accessToken);
    }
  });
});

describe('platform secret master key', () => {
  it('accepts a 32-byte base64 key', () => {
    const key = randomBytes(32);
    expect(parsePlatformSecretMasterKey(key.toString('base64')).equals(key)).toBe(true);
  });

  it('fail-closes on missing, truncated, or padded keys', () => {
    expect(() => parsePlatformSecretMasterKey(undefined)).toThrowError(AppError);
    expect(() => parsePlatformSecretMasterKey('')).toThrowError(AppError);
    expect(() => parsePlatformSecretMasterKey(randomBytes(16).toString('base64'))).toThrowError(AppError);
    expect(() => parsePlatformSecretMasterKey(randomBytes(48).toString('base64'))).toThrowError(AppError);
    try {
      parsePlatformSecretMasterKey('not-valid');
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.SECRET_MASTER_KEY_INVALID });
      expect(JSON.stringify(error)).not.toContain('PLATFORM_SECRET_MASTER_KEY');
    }
  });
});
