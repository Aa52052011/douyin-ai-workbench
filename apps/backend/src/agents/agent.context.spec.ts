import { describe, expect, it } from 'vitest';
import { buildAgentContext } from './agent.context.js';

describe('buildAgentContext', () => {
  it('copies ids from auth and never embeds a full user object', () => {
    const ctx = buildAgentContext({
      auth: {
        userId: 'user-1',
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        role: 'OWNER',
      },
      projectId: 'proj-1',
      requestId: 'req-1',
      locale: 'en-US,en;q=0.9',
    });
    expect(ctx).toEqual({
      userId: 'user-1',
      tenantId: 'tenant-1',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      requestId: 'req-1',
      locale: 'en-US',
    });
    expect(ctx).not.toHaveProperty('email');
    expect(ctx).not.toHaveProperty('password');
    expect(ctx).not.toHaveProperty('role');
  });
});
