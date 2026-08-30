import type { AuthContext } from '../auth/auth.types.js';

/**
 * V1.0：工作空间只来自 JWT。
 * V2：可读取 X-Workspace-Id，校验 Membership 后再切换。
 */
export function resolveWorkspaceId(auth: AuthContext, _workspaceHint?: string): string {
  return auth.workspaceId;
}

export function isDefaultWorkspaceSlug(slug: string): boolean {
  return slug === 'default';
}

export function workspaceSlugFromName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || 'workspace'}-${suffix}`;
}
