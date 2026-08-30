export type AuthContext = {
  userId: string;
  tenantId: string;
  workspaceId: string;
  role: string;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
};

export type PublicTenant = {
  id: string;
  name: string;
  slug: string;
};

export type PublicWorkspace = {
  id: string;
  name: string;
  slug: string;
};

export type AuthSession = {
  user: PublicUser;
  tenant: PublicTenant;
  workspace: PublicWorkspace;
  role: string;
  accessToken: string;
  expiresIn: number;
};
