import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import type { AuthContext } from '../auth/auth.types.js';
import { roleHasPermission, type PermissionValue } from './permissions.js';
import { PERMISSION_KEY } from './require-permission.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<PermissionValue | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    if (!request.auth) {
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED);
    }
    if (!roleHasPermission(request.auth.role, permission)) {
      throw new AppError(forbiddenCodeFor(permission));
    }
    return true;
  }
}

function forbiddenCodeFor(permission: PermissionValue) {
  if (permission.startsWith('workspace:')) {
    return ErrorCode.WORKSPACE_FORBIDDEN;
  }
  if (permission.startsWith('agent:')) {
    return ErrorCode.AGENT_FORBIDDEN;
  }
  return ErrorCode.PROJECT_FORBIDDEN;
}
