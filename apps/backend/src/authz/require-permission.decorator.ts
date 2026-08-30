import { SetMetadata } from '@nestjs/common';
import type { PermissionValue } from './permissions.js';

export const PERMISSION_KEY = 'requiredPermission';

export const RequirePermission = (permission: PermissionValue) =>
  SetMetadata(PERMISSION_KEY, permission);
