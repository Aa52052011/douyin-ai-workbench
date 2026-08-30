import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import {
  JWT_ISSUER,
  accessTtlSeconds,
  jwtAccessSecret,
} from './auth.constants.js';
import type { AuthContext } from './auth.types.js';

export type AccessClaims = AuthContext & {
  sub: string;
};

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  signAccess(ctx: AuthContext, expiresInSeconds = accessTtlSeconds()): string {
    return this.jwt.sign(
      {
        sub: ctx.userId,
        tid: ctx.tenantId,
        wid: ctx.workspaceId,
        role: ctx.role,
        jti: randomBytes(8).toString('hex'),
      },
      {
        secret: jwtAccessSecret(),
        issuer: JWT_ISSUER,
        expiresIn: expiresInSeconds,
      },
    );
  }

  verifyAccess(token: string): AccessClaims {
    try {
      const payload = this.jwt.verify<{
        sub: string;
        tid: string;
        wid: string;
        role: string;
      }>(token, {
        secret: jwtAccessSecret(),
        issuer: JWT_ISSUER,
      });
      return {
        sub: payload.sub,
        userId: payload.sub,
        tenantId: payload.tid,
        workspaceId: payload.wid,
        role: payload.role,
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TokenExpiredError') {
        throw new AppError(ErrorCode.AUTH_TOKEN_EXPIRED);
      }
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED);
    }
  }

  createRefreshToken(): { raw: string; tokenHash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, tokenHash: hashRefreshToken(raw) };
  }
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
