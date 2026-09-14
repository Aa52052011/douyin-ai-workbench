import { AppError, ErrorCode } from '../../common/errors/app-error.js';

export const DOUYIN_OAUTH_SCOPE_USER_INFO = 'user_info';
/** Required for official upload_video + create_video. */
export const DOUYIN_OAUTH_SCOPE_VIDEO_CREATE_BIND = 'video.create.bind';
export const DOUYIN_OAUTH_PURPOSES = ['LOGIN_ONLY', 'PUBLISHING'] as const;
export type DouyinOAuthPurpose = (typeof DOUYIN_OAUTH_PURPOSES)[number];
export const DOUYIN_OAUTH_LOGIN_SCOPES = [DOUYIN_OAUTH_SCOPE_USER_INFO] as const;
export const DOUYIN_OAUTH_PUBLISHING_SCOPES = [DOUYIN_OAUTH_SCOPE_USER_INFO, DOUYIN_OAUTH_SCOPE_VIDEO_CREATE_BIND] as const;

export function parseDouyinOAuthPurpose(value: string | undefined): DouyinOAuthPurpose {
  return value === 'LOGIN_ONLY' ? 'LOGIN_ONLY' : 'PUBLISHING';
}

export function scopesForOAuthPurpose(purpose: DouyinOAuthPurpose): string[] {
  return purpose === 'LOGIN_ONLY' ? [...DOUYIN_OAUTH_LOGIN_SCOPES] : [...DOUYIN_OAUTH_PUBLISHING_SCOPES];
}

export function formatDouyinScopeParam(scopes: readonly string[]): string {
  return scopes.join(',');
}

export function grantedScopesIncludePublish(scopes: readonly string[]): boolean {
  return scopes.includes(DOUYIN_OAUTH_SCOPE_VIDEO_CREATE_BIND);
}

export function evaluateGrantedScopes(input: { purpose: DouyinOAuthPurpose; granted: readonly string[] }): {
  requested: string[];
  granted: string[];
  missing: string[];
  publishingEligibleByScope: boolean;
} {
  const requested = scopesForOAuthPurpose(input.purpose);
  const granted = [...input.granted];
  const missing = requested.filter((scope) => !granted.includes(scope));
  return {
    requested,
    granted,
    missing,
    publishingEligibleByScope: grantedScopesIncludePublish(granted),
  };
}
export const DEFAULT_DOUYIN_OAUTH_BASE_URL = 'https://open.douyin.com';
export const DEFAULT_DOUYIN_API_BASE_URL = 'https://open.douyin.com';
export const DOUYIN_AUTHORIZE_PATH = '/platform/oauth/connect';
export const DOUYIN_ACCESS_TOKEN_PATH = '/oauth/access_token/';
export const DOUYIN_REFRESH_TOKEN_PATH = '/oauth/refresh_token/';
export const DOUYIN_USER_INFO_PATH = '/oauth/userinfo/';
export const DOUYIN_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const DOUYIN_ACCESS_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
export const DEFAULT_DOUYIN_OAUTH_TIMEOUT_MS = 15_000;
export const DEFAULT_DOUYIN_OAUTH_MAX_RESPONSE_BYTES = 64 * 1024;

export type DouyinOAuthConfig = {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  oauthBaseUrl: string;
  apiBaseUrl: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

export function readDouyinOAuthConfig(): DouyinOAuthConfig {
  return {
    clientKey: process.env.DOUYIN_CLIENT_KEY?.trim() ?? '',
    clientSecret: process.env.DOUYIN_CLIENT_SECRET?.trim() ?? '',
    redirectUri: process.env.DOUYIN_REDIRECT_URI?.trim() ?? '',
    oauthBaseUrl: normalizeBaseUrl(process.env.DOUYIN_OAUTH_BASE_URL, DEFAULT_DOUYIN_OAUTH_BASE_URL),
    apiBaseUrl: normalizeBaseUrl(process.env.DOUYIN_API_BASE_URL, DEFAULT_DOUYIN_API_BASE_URL),
    timeoutMs: parsePositiveInt(process.env.DOUYIN_OAUTH_TIMEOUT_MS, DEFAULT_DOUYIN_OAUTH_TIMEOUT_MS, 1_000, 60_000),
    maxResponseBytes: parsePositiveInt(
      process.env.DOUYIN_OAUTH_MAX_RESPONSE_BYTES,
      DEFAULT_DOUYIN_OAUTH_MAX_RESPONSE_BYTES,
      1024,
      256 * 1024,
    ),
  };
}

export function isDouyinOAuthConfigured(config = readDouyinOAuthConfig()): boolean {
  return Boolean(config.clientKey && config.clientSecret && config.redirectUri);
}

export function assertDouyinOAuthConfigured(config = readDouyinOAuthConfig()): DouyinOAuthConfig {
  if (!isDouyinOAuthConfigured(config)) {
    throw new AppError(ErrorCode.DOUYIN_OAUTH_NOT_CONFIGURED);
  }
  return config;
}

export function joinDouyinAuthorizeUrl(oauthBaseUrl: string): string {
  return joinDouyinPath(oauthBaseUrl, DOUYIN_AUTHORIZE_PATH);
}

export function joinDouyinApiPath(apiBaseUrl: string, path: string): string {
  return joinDouyinPath(apiBaseUrl, path);
}

export function parseDouyinScopes(scope: string | undefined): string[] {
  if (!scope) {
    return [];
  }
  return scope
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function expiryFromExpiresIn(expiresIn: number, nowMs = Date.now()): string {
  if (!Number.isFinite(expiresIn) || expiresIn < 0) {
    throw new AppError(ErrorCode.DOUYIN_TOKEN_EXCHANGE_FAILED);
  }
  return new Date(nowMs + Math.floor(expiresIn) * 1000).toISOString();
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  return raw.replace(/\/+$/, '');
}

function joinDouyinPath(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) {
    throw new AppError(ErrorCode.DOUYIN_OAUTH_NOT_CONFIGURED);
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function parsePositiveInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value) || value < min) {
    return fallback;
  }
  return Math.min(max, Math.floor(value));
}
