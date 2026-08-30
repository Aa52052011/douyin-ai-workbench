import type { AgentRun } from '@prisma/client';
import type { AgentRunPublic } from './agent.types.js';

export function toPublicAgentRun(run: AgentRun): AgentRunPublic {
  const started = run.startedAt?.getTime();
  const completed = run.completedAt?.getTime();
  return {
    id: run.id,
    tenantId: run.tenantId,
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    agentId: run.agentId,
    agentVersion: run.agentVersion,
    status: run.status,
    input: run.input,
    output: run.output,
    error: run.error,
    requestId: run.requestId,
    usage: {
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      totalTokens: run.totalTokens,
      estimatedCost: run.estimatedCost != null ? run.estimatedCost.toString() : null,
    },
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    durationMs: started != null && completed != null ? Math.max(0, completed - started) : null,
  };
}
