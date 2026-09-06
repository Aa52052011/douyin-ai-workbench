import type { Script } from '@prisma/client';

export type ScriptPublic = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  contentPlanId: string | null;
  topicId: string | null;
  title: string;
  content: string;
  version: number;
  status: string;
  payload: unknown;
  topicSnapshot: unknown;
  sourceAgentRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toPublicScript(script: Script): ScriptPublic {
  return {
    id: script.id,
    tenantId: script.tenantId,
    workspaceId: script.workspaceId,
    projectId: script.projectId,
    contentPlanId: script.contentPlanId,
    topicId: script.topicId,
    title: script.title,
    content: script.content,
    version: script.version,
    status: script.status,
    payload: script.payload,
    topicSnapshot: script.topicSnapshot,
    sourceAgentRunId: script.sourceAgentRunId,
    createdAt: script.createdAt,
    updatedAt: script.updatedAt,
  };
}
