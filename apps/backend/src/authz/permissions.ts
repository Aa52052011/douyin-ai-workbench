export const Permission = {
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_UPDATE: 'workspace:update',
  WORKSPACE_DELETE: 'workspace:delete',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
} as const;

export type PermissionValue = (typeof Permission)[keyof typeof Permission];

const ALL_WRITE: PermissionValue[] = Object.values(Permission);

const ROLE_PERMISSIONS: Record<string, readonly PermissionValue[]> = {
  OWNER: ALL_WRITE,
  ADMIN: [
    Permission.WORKSPACE_CREATE,
    Permission.WORKSPACE_UPDATE,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_DELETE,
  ],
  MEMBER: [],
  EDITOR: [Permission.PROJECT_CREATE, Permission.PROJECT_UPDATE],
  VIEWER: [],
};

export function roleHasPermission(role: string, permission: PermissionValue): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}
