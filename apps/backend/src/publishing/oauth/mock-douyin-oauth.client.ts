import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import { DOUYIN_OAUTH_SCOPE_USER_INFO, expiryFromExpiresIn } from './douyin-oauth.config.js';
import { douyinOAuthError } from './douyin-oauth.errors.js';
import type {
  DouyinCodeExchangeInput,
  DouyinOAuthClient,
  DouyinPublicUserInfo,
  DouyinRefreshInput,
  DouyinTokenSet,
  DouyinUserInfoInput,
} from './douyin-oauth.types.js';
import {
  DUMMY_DOUYIN_ACCESS_TOKEN,
  DUMMY_DOUYIN_ACCESS_TOKEN_ROTATED,
  MOCK_DOUYIN_AVATAR_URL,
  MOCK_DOUYIN_CODE_INVALID,
  MOCK_DOUYIN_CODE_SUCCESS,
  MOCK_DOUYIN_CODE_TOKEN_EXPIRED,
  MOCK_DOUYIN_CODE_USER_INFO_FAILURE,
  MOCK_DOUYIN_DISPLAY_NAME,
  MOCK_DOUYIN_OPEN_ID,
  MOCK_DOUYIN_REFRESH_EXPIRED,
  MOCK_DOUYIN_REFRESH_SUCCESS,
} from './douyin-oauth.types.js';

const DEFAULT_ACCESS_EXPIRES_IN = 1_296_000;
const DEFAULT_REFRESH_EXPIRES_IN = 2_592_000;

@Injectable()
export class MockDouyinOAuthClient implements DouyinOAuthClient {
  private lastCode: string | undefined;

  async exchangeCode(input: DouyinCodeExchangeInput): Promise<DouyinTokenSet> {
    this.lastCode = input.code;
    if (input.code === MOCK_DOUYIN_CODE_INVALID) {
      throw douyinOAuthError(ErrorCode.DOUYIN_OAUTH_INVALID_CODE);
    }
    if (input.code === MOCK_DOUYIN_CODE_TOKEN_EXPIRED) {
      throw douyinOAuthError(ErrorCode.DOUYIN_REAUTH_REQUIRED);
    }
    if (input.code === MOCK_DOUYIN_CODE_SUCCESS || input.code === MOCK_DOUYIN_CODE_USER_INFO_FAILURE) {
      return buildMockTokens(DUMMY_DOUYIN_ACCESS_TOKEN, MOCK_DOUYIN_REFRESH_SUCCESS);
    }
    throw douyinOAuthError(ErrorCode.DOUYIN_OAUTH_INVALID_CODE);
  }

  async refreshToken(input: DouyinRefreshInput): Promise<DouyinTokenSet> {
    if (input.refreshToken === MOCK_DOUYIN_REFRESH_EXPIRED) {
      throw douyinOAuthError(ErrorCode.DOUYIN_REAUTH_REQUIRED);
    }
    if (input.refreshToken === MOCK_DOUYIN_REFRESH_SUCCESS) {
      return buildMockTokens(DUMMY_DOUYIN_ACCESS_TOKEN_ROTATED, MOCK_DOUYIN_REFRESH_SUCCESS);
    }
    throw douyinOAuthError(ErrorCode.DOUYIN_REAUTH_REQUIRED);
  }

  async getUserInfo(input: DouyinUserInfoInput): Promise<DouyinPublicUserInfo> {
    if (this.lastCode === MOCK_DOUYIN_CODE_USER_INFO_FAILURE) {
      throw douyinOAuthError(ErrorCode.DOUYIN_USER_INFO_FAILED);
    }
    if (!input.openId) {
      throw douyinOAuthError(ErrorCode.DOUYIN_USER_INFO_FAILED);
    }
    return {
      openId: input.openId,
      displayName: MOCK_DOUYIN_DISPLAY_NAME,
      avatarUrl: MOCK_DOUYIN_AVATAR_URL,
    };
  }
}

function buildMockTokens(accessToken: string, refreshToken: string, now = Date.now()): DouyinTokenSet {
  return {
    accessToken,
    refreshToken,
    accessExpiresAt: expiryFromExpiresIn(DEFAULT_ACCESS_EXPIRES_IN, now),
    refreshExpiresAt: expiryFromExpiresIn(DEFAULT_REFRESH_EXPIRES_IN, now),
    openId: MOCK_DOUYIN_OPEN_ID,
    scopes: [DOUYIN_OAUTH_SCOPE_USER_INFO],
  };
}
