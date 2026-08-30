export type Workspace = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  tenantId: string;
  workspaceId: string;
  name: string;
  industry: string | null;
  platform: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentDefinition = {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
};

export type AgentRun = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  agentId: string;
  agentVersion: string;
  status: string;
  input: unknown;
  output: unknown;
  error: unknown;
  requestId: string;
  durationMs: number | null;
  createdAt: string;
};
