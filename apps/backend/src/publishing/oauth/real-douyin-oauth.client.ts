import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import {
  assertDouyinOAuthConfigured,
  DOUYIN_ACCESS_TOKEN_PATH,
  DOUYIN_REFRESH_TOKEN_PATH,
  DOUYIN_USER_INFO_PATH,
  expiryFromExpiresIn,
  joinDouyinApiPath,
  parseDouyinScopes,
  readDouyinOAuthConfig,
  type DouyinOAuthConfig,
} from './douyin-oauth.config.js';
import {
  douyinOAuthError,
  isAbortError,
  mapDouyinProviderErrorCode,
  providerErrorCodeFromBody,
  providerRequestIdFromBody,
  sanitizeDouyinOAuthError,
  type DouyinOAuthEndpoint,
} from './douyin-oauth.errors.js';
import type {
  DouyinCodeExchangeInput,
  DouyinOAuthClient,
  DouyinPublicUserInfo,
  DouyinRefreshInput,
  DouyinTokenSet,
  DouyinUserInfoInput,
} from './douyin-oauth.types.js';

export type DouyinOAuthFetch = typeof fetch;

@Injectable()
export class RealDouyinOAuthClient implements DouyinOAuthClient {
  private readonly logger = new Logger(RealDouyinOAuthClient.name);

  constructor(private readonly fetchImpl: DouyinOAuthFetch = globalThis.fetch.bind(globalThis)) {}

  async exchangeCode(input: DouyinCodeExchangeInput): Promise<DouyinTokenSet> {
    const config = assertDouyinOAuthConfigured();
    const body = new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      code: input.code,
      grant_type: 'authorization_code',
    });
    const data = await this.postForm(config, DOUYIN_ACCESS_TOKEN_PATH, body, 'exchange');
    return normalizeTokenSet(data, 'exchange');
  }

  async refreshToken(input: DouyinRefreshInput): Promise<DouyinTokenSet> {
    const config = assertDouyinOAuthConfigured();
    const body = new URLSearchParams({
      client_key: config.clientKey,
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
    });
    const data = await this.postForm(config, DOUYIN_REFRESH_TOKEN_PATH, body, 'refresh');
    return normalizeTokenSet(data, 'refresh');
  }

  async getUserInfo(input: DouyinUserInfoInput): Promise<DouyinPublicUserInfo> {
    const config = assertDouyinOAuthConfigured();
    const body = new URLSearchParams({
      access_token: input.accessToken,
      open_id: input.openId,
    });
    const data = await this.postForm(config, DOUYIN_USER_INFO_PATH, body, 'userinfo');
    return normalizeUserInfo(data, input.openId);
  }

  private async postForm(
    config: DouyinOAuthConfig,
    path: string,
    body: URLSearchParams,
    endpoint: DouyinOAuthEndpoint,
  ): Promise<Record<string, unknown>> {
    const url = joinDouyinApiPath(config.apiBaseUrl, path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
      const raw = await readLimitedJson(response, config.maxResponseBytes);
      const providerCode = providerErrorCodeFromBody(raw);
      const requestId = providerRequestIdFromBody(raw);
      if (!response.ok || (typeof providerCode === 'number' && providerCode !== 0)) {
        this.logger.warn(`Douyin OAuth ${endpoint} failed providerCode=${providerCode ?? 'none'} requestId=${requestId ?? 'none'}`);
        throw douyinOAuthError(mapDouyinProviderErrorCode(providerCode ?? -1, endpoint));
      }
      const data = extractData(raw);
      if (!data) {
        throw douyinOAuthError(mapDouyinProviderErrorCode(-1, endpoint));
      }
      return data;
    } catch (error) {
      if (isAbortError(error)) {
        throw douyinOAuthError(
          endpoint === 'userinfo' ? ErrorCode.DOUYIN_USER_INFO_FAILED : ErrorCode.DOUYIN_TOKEN_EXCHANGE_FAILED,
        );
      }
      throw sanitizeDouyinOAuthError(error);
    } finally {
      clearTimeout(timer);
    }
  }
}

function extractData(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return record.data as Record<string, unknown>;
  }
  return record;
}

function normalizeTokenSet(data: Record<string, unknown>, endpoint: DouyinOAuthEndpoint): DouyinTokenSet {
  const accessToken = readNonEmptyString(data.access_token);
  const openId = readNonEmptyString(data.open_id);
  const expiresIn = readFiniteNumber(data.expires_in);
  if (!accessToken || !openId || expiresIn == null) {
    throw douyinOAuthError(
      endpoint === 'refresh' ? ErrorCode.DOUYIN_TOKEN_EXCHANGE_FAILED : ErrorCode.DOUYIN_TOKEN_EXCHANGE_FAILED,
    );
  }
  const now = Date.now();
  const refreshToken = readNonEmptyString(data.refresh_token);
  const refreshExpiresIn = readFiniteNumber(data.refresh_expires_in);
  return {
    accessToken,
    refreshToken,
    accessExpiresAt: expiryFromExpiresIn(expiresIn, now),
    refreshExpiresAt: refreshExpiresIn != null ? expiryFromExpiresIn(refreshExpiresIn, now) : undefined,
    openId,
    scopes: parseDouyinScopes(typeof data.scope === 'string' ? data.scope : undefined),
  };
}

function normalizeUserInfo(data: Record<string, unknown>, expectedOpenId: string): DouyinPublicUserInfo {
  const openId = readNonEmptyString(data.open_id) ?? expectedOpenId;
  if (openId !== expectedOpenId) {
    throw douyinOAuthError(ErrorCode.DOUYIN_USER_INFO_FAILED);
  }
  const nickname = readNonEmptyString(data.nickname);
  const avatar = readNonEmptyString(data.avatar);
  return {
    openId,
    displayName: nickname ?? 'Douyin account',
    avatarUrl: avatar,
  };
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

async function readLimitedJson(response: Response, maxBytes: number): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw douyinOAuthError(ErrorCode.DOUYIN_TOKEN_EXCHANGE_FAILED);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw douyinOAuthError(ErrorCode.DOUYIN_TOKEN_EXCHANGE_FAILED);
  }
  try {
    return JSON.parse(buffer.toString('utf8')) as unknown;
  } catch {
    throw douyinOAuthError(ErrorCode.DOUYIN_TOKEN_EXCHANGE_FAILED);
  }
}
