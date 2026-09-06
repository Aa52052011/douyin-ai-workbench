import { afterEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import {
  assertDouyinOAuthConfigured,
  DEFAULT_DOUYIN_API_BASE_URL,
  DEFAULT_DOUYIN_OAUTH_BASE_URL,
  DOUYIN_OAUTH_SCOPE_USER_INFO,
  joinDouyinAuthorizeUrl,
  parseDouyinScopes,
  readDouyinOAuthConfig,
} from './douyin-oauth.config.js';

const KEYS = [
  'DOUYIN_CLIENT_KEY',
  'DOUYIN_CLIENT_SECRET',
  'DOUYIN_REDIRECT_URI',
  'DOUYIN_OAUTH_BASE_URL',
  'DOUYIN_API_BASE_URL',
] as const;

describe('Douyin OAuth config', () => {
  const previous: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  function snapshotEnv() {
    for (const key of KEYS) {
      previous[key] = process.env[key];
    }
  }

  it('defaults production hosts to official HTTPS', () => {
    snapshotEnv();
    delete process.env.DOUYIN_OAUTH_BASE_URL;
    delete process.env.DOUYIN_API_BASE_URL;
    const config = readDouyinOAuthConfig();
    expect(config.oauthBaseUrl).toBe(DEFAULT_DOUYIN_OAUTH_BASE_URL);
    expect(config.apiBaseUrl).toBe(DEFAULT_DOUYIN_API_BASE_URL);
    expect(config.oauthBaseUrl.startsWith('https://')).toBe(true);
    expect(joinDouyinAuthorizeUrl(config.oauthBaseUrl)).toBe('https://open.douyin.com/platform/oauth/connect');
  });

  it('injects mock/local endpoints from env', () => {
    snapshotEnv();
    process.env.DOUYIN_OAUTH_BASE_URL = 'http://127.0.0.1:9';
    process.env.DOUYIN_API_BASE_URL = 'http://127.0.0.1:9';
    const config = readDouyinOAuthConfig();
    expect(config.oauthBaseUrl).toBe('http://127.0.0.1:9');
    expect(config.apiBaseUrl).toBe('http://127.0.0.1:9');
  });

  it('fails closed when client credentials are missing', () => {
    snapshotEnv();
    delete process.env.DOUYIN_CLIENT_KEY;
    delete process.env.DOUYIN_CLIENT_SECRET;
    delete process.env.DOUYIN_REDIRECT_URI;
    try {
      assertDouyinOAuthConfigured();
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.DOUYIN_OAUTH_NOT_CONFIGURED });
      expect(JSON.stringify(error)).not.toContain('client_secret');
    }
  });

  it('parses user_info as the least-privilege scope', () => {
    expect(parseDouyinScopes('user_info')).toEqual([DOUYIN_OAUTH_SCOPE_USER_INFO]);
    expect(parseDouyinScopes('user_info,video.create.bind')).not.toEqual([DOUYIN_OAUTH_SCOPE_USER_INFO]);
  });
});
