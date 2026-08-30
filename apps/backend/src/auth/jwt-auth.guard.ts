import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import type { AuthContext } from './auth.types.js';
import { TokenService } from './token.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED);
    }
    request.auth = this.tokens.verifyAccess(header.slice('Bearer '.length));
    return true;
  }
}
