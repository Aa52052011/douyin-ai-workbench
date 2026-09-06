import { MockDouyinOAuthClient } from './mock-douyin-oauth.client.js';
import { RealDouyinOAuthClient } from './real-douyin-oauth.client.js';
import type { DouyinOAuthClient } from './douyin-oauth.types.js';

export function usesMockDouyinOAuthClient(): boolean {
  if (process.env.RUN_REAL_DOUYIN_OAUTH_TESTS === 'true') {
    return false;
  }
  if (process.env.NODE_ENV === 'test') {
    return true;
  }
  return process.env.DOUYIN_OAUTH_PROVIDER === 'mock';
}

export function createDouyinOAuthClient(): DouyinOAuthClient {
  if (usesMockDouyinOAuthClient()) {
    return new MockDouyinOAuthClient();
  }
  return new RealDouyinOAuthClient();
}
