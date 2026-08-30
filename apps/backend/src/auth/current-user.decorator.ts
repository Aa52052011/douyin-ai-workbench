import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import type { AuthContext } from './auth.types.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    if (!request.auth) {
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED);
    }
    return request.auth;
  },
);
