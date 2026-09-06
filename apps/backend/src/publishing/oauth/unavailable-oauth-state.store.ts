import { Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { OAuthStateConsumeResult, OAuthStateContext, OAuthStateStore } from './oauth-state.js';

@Injectable()
export class UnavailableOAuthStateStore implements OAuthStateStore {
  async save(_state: string, _context: OAuthStateContext, _ttlMs: number): Promise<void> {
    throw new AppError(ErrorCode.OAUTH_STATE_STORE_UNAVAILABLE);
  }

  async consume(_state: string): Promise<OAuthStateConsumeResult> {
    throw new AppError(ErrorCode.OAUTH_STATE_STORE_UNAVAILABLE);
  }
}
