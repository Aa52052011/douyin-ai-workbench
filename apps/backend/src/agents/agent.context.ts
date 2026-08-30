import type { AuthContext } from '../auth/auth.types.js';
import type { AgentContext } from './agent.types.js';

export function buildAgentContext(input: {
  auth: AuthContext;
  projectId: string;
  requestId: string;
  locale?: string;
}): AgentContext {
  return {
    userId: input.auth.userId,
    tenantId: input.auth.tenantId,
    workspaceId: input.auth.workspaceId,
    projectId: input.projectId,
    requestId: input.requestId,
    locale: input.locale?.split(',')[0]?.trim() || 'zh-CN',
  };
}
