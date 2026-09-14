import { isDouyinOAuthConfigured, readDouyinOAuthConfig } from '../oauth/douyin-oauth.config.js';
import { isPlatformSecretMasterKeyConfigured, PLATFORM_SECRET_MASTER_KEY_ENV } from '../secrets/secret-master-key.js';

export const DEFAULT_DOUYIN_UPLOAD_TIMEOUT_MS = 120_000;
export const DEFAULT_DOUYIN_CREATE_TIMEOUT_MS = 15_000;
export const DOUYIN_LIVE_API_ENABLED_ENV = 'DOUYIN_LIVE_API_ENABLED';
export const DOUYIN_UPLOAD_TIMEOUT_ENV = 'DOUYIN_UPLOAD_TIMEOUT_MS';
export const DOUYIN_CREATE_TIMEOUT_ENV = 'DOUYIN_CREATE_TIMEOUT_MS';

export const DOUYIN_CONFIG_KEYS = [
  'DOUYIN_CLIENT_KEY',
  'DOUYIN_CLIENT_SECRET',
  'DOUYIN_REDIRECT_URI',
  PLATFORM_SECRET_MASTER_KEY_ENV,
  DOUYIN_LIVE_API_ENABLED_ENV,
  DOUYIN_UPLOAD_TIMEOUT_ENV,
  DOUYIN_CREATE_TIMEOUT_ENV,
] as const;

export function isDouyinLiveApiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DOUYIN_LIVE_API_ENABLED_ENV]?.trim().toLowerCase() === 'true';
}

function parseTimeout(raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value) || value < 1_000) return fallback;
  return Math.min(600_000, Math.floor(value));
}

export function readDouyinPublishRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const oauth = readDouyinOAuthConfig();
  return {
    ...oauth,
    liveApiEnabled: isDouyinLiveApiEnabled(env),
    uploadTimeoutMs: parseTimeout(env[DOUYIN_UPLOAD_TIMEOUT_ENV], DEFAULT_DOUYIN_UPLOAD_TIMEOUT_MS),
    createTimeoutMs: parseTimeout(env[DOUYIN_CREATE_TIMEOUT_ENV], DEFAULT_DOUYIN_CREATE_TIMEOUT_MS),
    encryptionReady: isPlatformSecretMasterKeyConfigured(env[PLATFORM_SECRET_MASTER_KEY_ENV]),
  };
}

export function validateDouyinProviderConfig(env: NodeJS.ProcessEnv = process.env): {
  configured: boolean;
  missingKeys: string[];
  liveApiEnabled: boolean;
  encryptionReady: boolean;
} {
  const missingKeys: string[] = [];
  if (!env.DOUYIN_CLIENT_KEY?.trim()) missingKeys.push('DOUYIN_CLIENT_KEY');
  if (!env.DOUYIN_CLIENT_SECRET?.trim()) missingKeys.push('DOUYIN_CLIENT_SECRET');
  if (!env.DOUYIN_REDIRECT_URI?.trim()) missingKeys.push('DOUYIN_REDIRECT_URI');
  if (!isPlatformSecretMasterKeyConfigured(env[PLATFORM_SECRET_MASTER_KEY_ENV])) {
    missingKeys.push(PLATFORM_SECRET_MASTER_KEY_ENV);
  }
  return {
    configured: missingKeys.length === 0 && isDouyinOAuthConfigured(),
    missingKeys,
    liveApiEnabled: isDouyinLiveApiEnabled(env),
    encryptionReady: isPlatformSecretMasterKeyConfigured(env[PLATFORM_SECRET_MASTER_KEY_ENV]),
  };
}
