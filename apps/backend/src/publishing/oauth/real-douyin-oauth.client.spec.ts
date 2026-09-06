import { afterEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { RealDouyinOAuthClient } from './real-douyin-oauth.client.js';
import { DOUYIN_ACCESS_TOKEN_PATH, DOUYIN_REFRESH_TOKEN_PATH } from './douyin-oauth.config.js';

const SECRET = 'test-douyin-client-secret';

describe('RealDouyinOAuthClient', () => {
  const previous: Record<string, string | undefined> = {};

  afterEach(() => {
    restore('DOUYIN_CLIENT_KEY');
    restore('DOUYIN_CLIENT_SECRET');
    restore('DOUYIN_REDIRECT_URI');
    restore('DOUYIN_API_BASE_URL');
  });

  function snapshot(key: string) {
    previous[key] = process.env[key];
  }

  function restore(key: string) {
    if (previous[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous[key];
    }
  }

  function configure() {
    snapshot('DOUYIN_CLIENT_KEY');
    snapshot('DOUYIN_CLIENT_SECRET');
    snapshot('DOUYIN_REDIRECT_URI');
    snapshot('DOUYIN_API_BASE_URL');
    process.env.DOUYIN_CLIENT_KEY = 'test-client-key';
    process.env.DOUYIN_CLIENT_SECRET = SECRET;
    process.env.DOUYIN_REDIRECT_URI = 'https://example.test/platform-accounts/douyin/callback';
    process.env.DOUYIN_API_BASE_URL = 'https://open.douyin.com';
  }

  it('exchanges code server-side and normalizes token fields without logging secrets', async () => {
    configure();
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), body: String(init?.body ?? '') });
      return jsonResponse({
        data: {
          access_token: 'act.not-for-storage-in-tests',
          refresh_token: 'rft.not-for-storage-in-tests',
          expires_in: 100,
          refresh_expires_in: 200,
          open_id: 'open-id-1',
          scope: 'user_info',
          error_code: 0,
          log_id: 'log-1',
        },
        message: 'success',
      });
    };
    const client = new RealDouyinOAuthClient(fetchImpl);
    const tokens = await client.exchangeCode({ code: 'auth-code-1' });
    expect(tokens.openId).toBe('open-id-1');
    expect(tokens.scopes).toEqual(['user_info']);
    expect(Date.parse(tokens.accessExpiresAt)).toBeGreaterThan(Date.now());
    expect(calls[0]?.url).toContain(DOUYIN_ACCESS_TOKEN_PATH);
    expect(calls[0]?.url).not.toContain(SECRET);
    expect(calls[0]?.url).not.toContain('auth-code-1');
    expect(JSON.stringify(tokens)).not.toContain(SECRET);
  });

  it('maps invalid code and does not leak the authorization code in AppError', async () => {
    configure();
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({
        data: { error_code: 10007, description: 'code is invalid', log_id: 'log-2' },
        message: 'error',
      });
    const client = new RealDouyinOAuthClient(fetchImpl);
    try {
      await client.exchangeCode({ code: 'leaked-code-must-not-appear' });
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.DOUYIN_OAUTH_INVALID_CODE });
      expect(JSON.stringify(error)).not.toContain('leaked-code-must-not-appear');
      expect(JSON.stringify(error)).not.toContain(SECRET);
    }
  });

  it('maps expired refresh to reauth without putting client_secret on the refresh URL', async () => {
    configure();
    const fetchImpl: typeof fetch = async (input) => {
      expect(String(input)).toContain(DOUYIN_REFRESH_TOKEN_PATH);
      expect(String(input)).not.toContain(SECRET);
      return jsonResponse({ data: { error_code: 10010, log_id: 'log-3' }, message: 'error' });
    };
    const client = new RealDouyinOAuthClient(fetchImpl);
    await expect(client.refreshToken({ refreshToken: 'rft.expired' })).rejects.toMatchObject({
      code: ErrorCode.DOUYIN_REAUTH_REQUIRED,
    });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
