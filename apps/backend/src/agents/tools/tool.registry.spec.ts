import { describe, expect, it } from 'vitest';
import { ToolRegistry } from './tool.registry.js';

describe('ToolRegistry', () => {
  it('invokes echoTool through the registry', async () => {
    const registry = new ToolRegistry();
    expect(registry.has('echoTool')).toBe(true);
    const result = await registry.invoke(
      'echoTool',
      { message: 'hello' },
      {
        userId: 'u',
        tenantId: 't',
        workspaceId: 'w',
        projectId: 'p',
        requestId: 'r',
        locale: 'zh-CN',
      },
    );
    expect(result).toEqual({ echoed: 'hello' });
  });
});
