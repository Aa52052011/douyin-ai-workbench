export type DouyinTokenSet = {
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt: string;
  refreshExpiresAt?: string;
  openId: string;
  scopes: string[];
};

export type DouyinPublicUserInfo = {
  openId: string;
  displayName: string;
  avatarUrl?: string;
};

export type DouyinCodeExchangeInput = {
  code: string;
};

export type DouyinRefreshInput = {
  refreshToken: string;
};

export type DouyinUserInfoInput = {
  accessToken: string;
  openId: string;
};

export interface DouyinOAuthClient {
  exchangeCode(input: DouyinCodeExchangeInput): Promise<DouyinTokenSet>;
  refreshToken(input: DouyinRefreshInput): Promise<DouyinTokenSet>;
  getUserInfo(input: DouyinUserInfoInput): Promise<DouyinPublicUserInfo>;
}

export const DOUYIN_OAUTH_CLIENT = Symbol('DOUYIN_OAUTH_CLIENT');

export const MOCK_DOUYIN_CODE_SUCCESS = 'mock-code-SUCCESS';
export const MOCK_DOUYIN_CODE_INVALID = 'mock-code-INVALID_CODE';
export const MOCK_DOUYIN_CODE_TOKEN_EXPIRED = 'mock-code-TOKEN_EXPIRED';
export const MOCK_DOUYIN_CODE_USER_INFO_FAILURE = 'mock-code-USER_INFO_FAILURE';
export const MOCK_DOUYIN_REFRESH_SUCCESS = 'dummy-refresh-not-a-real-token';
export const MOCK_DOUYIN_REFRESH_EXPIRED = 'dummy-refresh-expired';
export const MOCK_DOUYIN_OPEN_ID = 'mock-douyin-open-id';
export const MOCK_DOUYIN_DISPLAY_NAME = 'Mock Douyin User';
export const MOCK_DOUYIN_AVATAR_URL = 'https://example.com/douyin-avatar.png';
export const DUMMY_DOUYIN_ACCESS_TOKEN = 'dummy-access-not-a-real-token';
export const DUMMY_DOUYIN_ACCESS_TOKEN_ROTATED = 'dummy-access-rotated-not-a-real-token';
