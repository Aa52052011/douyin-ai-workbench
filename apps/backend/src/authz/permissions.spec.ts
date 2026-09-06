import { describe, expect, it } from 'vitest';
import { Permission, roleHasPermission } from './permissions.js';

describe('permissions', () => {
  it('keeps the existing write matrix', () => {
    expect(roleHasPermission('OWNER', Permission.AGENT_EXECUTE)).toBe(true);
    expect(roleHasPermission('ADMIN', Permission.AGENT_EXECUTE)).toBe(true);
    expect(roleHasPermission('EDITOR', Permission.AGENT_EXECUTE)).toBe(true);
    expect(roleHasPermission('MEMBER', Permission.AGENT_EXECUTE)).toBe(false);
    expect(roleHasPermission('VIEWER', Permission.AGENT_EXECUTE)).toBe(false);
    expect(roleHasPermission('ADMIN', Permission.WORKSPACE_DELETE)).toBe(false);
  });

  it('does not reuse AGENT_EXECUTE for publishing', () => {
    expect(Permission.PUBLICATION_CREATE).not.toBe(Permission.AGENT_EXECUTE);
    expect(Permission.PLATFORM_ACCOUNT_MANAGE).not.toBe(Permission.AGENT_EXECUTE);
  });

  it('grants publishing permissions to current roles', () => {
    expect(roleHasPermission('OWNER', Permission.PLATFORM_ACCOUNT_MANAGE)).toBe(true);
    expect(roleHasPermission('OWNER', Permission.PUBLICATION_CREATE)).toBe(true);
    expect(roleHasPermission('ADMIN', Permission.PLATFORM_ACCOUNT_MANAGE)).toBe(true);
    expect(roleHasPermission('ADMIN', Permission.PUBLICATION_CREATE)).toBe(true);
    expect(roleHasPermission('EDITOR', Permission.PLATFORM_ACCOUNT_MANAGE)).toBe(false);
    expect(roleHasPermission('EDITOR', Permission.PUBLICATION_CREATE)).toBe(true);
    expect(roleHasPermission('MEMBER', Permission.PLATFORM_ACCOUNT_MANAGE)).toBe(false);
    expect(roleHasPermission('MEMBER', Permission.PUBLICATION_CREATE)).toBe(false);
    expect(roleHasPermission('VIEWER', Permission.PLATFORM_ACCOUNT_MANAGE)).toBe(false);
    expect(roleHasPermission('VIEWER', Permission.PUBLICATION_CREATE)).toBe(false);
  });
});
