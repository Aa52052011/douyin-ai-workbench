import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { MockDouyinOAuthClient } from './mock-douyin-oauth.client.js';
import {
  DUMMY_DOUYIN_ACCESS_TOKEN,
  DUMMY_DOUYIN_ACCESS_TOKEN_ROTATED,
  MOCK_DOUYIN_CODE_INVALID,
  MOCK_DOUYIN_CODE_SUCCESS,
  MOCK_DOUYIN_CODE_TOKEN_EXPIRED,
  MOCK_DOUYIN_CODE_USER_INFO_FAILURE,
  MOCK_DOUYIN_OPEN_ID,
  MOCK_DOUYIN_REFRESH_EXPIRED,
  MOCK_DOUYIN_REFRESH_SUCCESS,
} from './douyin-oauth.types.js';

describe('MockDouyinOAuthClient', () => {
  it('exchanges a success code into dummy tokens and public user info', async () => {
    const client = new MockDouyinOAuthClient();
    const tokens = await client.exchangeCode({ code: MOCK_DOUYIN_CODE_SUCCESS });
    expect(tokens.openId).toBe(MOCK_DOUYIN_OPEN_ID);
    expect(tokens.accessToken).toBe(DUMMY_DOUYIN_ACCESS_TOKEN);
    expect(tokens.scopes).toEqual(['user_info']);
    const user = await client.getUserInfo({ accessToken: tokens.accessToken, openId: tokens.openId });
    expect(user.openId).toBe(MOCK_DOUYIN_OPEN_ID);
    expect(JSON.stringify(user)).not.toContain('client_secret');
  });

  it('maps invalid code, expired token, user info failure, and refresh outcomes', async () => {
    const client = new MockDouyinOAuthClient();
    await expect(client.exchangeCode({ code: MOCK_DOUYIN_CODE_INVALID })).rejects.toMatchObject({
      code: ErrorCode.DOUYIN_OAUTH_INVALID_CODE,
    });
    await expect(client.exchangeCode({ code: MOCK_DOUYIN_CODE_TOKEN_EXPIRED })).rejects.toMatchObject({
      code: ErrorCode.DOUYIN_REAUTH_REQUIRED,
    });
    const failed = await client.exchangeCode({ code: MOCK_DOUYIN_CODE_USER_INFO_FAILURE });
    await expect(client.getUserInfo({ accessToken: failed.accessToken, openId: failed.openId })).rejects.toMatchObject({
      code: ErrorCode.DOUYIN_USER_INFO_FAILED,
    });
    const rotated = await client.refreshToken({ refreshToken: MOCK_DOUYIN_REFRESH_SUCCESS });
    expect(rotated.accessToken).toBe(DUMMY_DOUYIN_ACCESS_TOKEN_ROTATED);
    await expect(client.refreshToken({ refreshToken: MOCK_DOUYIN_REFRESH_EXPIRED })).rejects.toMatchObject({
      code: ErrorCode.DOUYIN_REAUTH_REQUIRED,
    });
  });
});
