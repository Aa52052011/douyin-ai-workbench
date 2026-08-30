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
